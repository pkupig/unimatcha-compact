import { createHmac } from 'crypto';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, SquareBoard, SquareAuthorType, AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CreatePostDto, CreateCommentDto } from './dto/square.dto';

/**
 * 广场 v2（§8.1）：基于 SquarePost / SquarePostComment / SquarePostLike。
 * 旧 CouplePost 体系已废弃，本服务不再读写旧表。
 * - 用户帖：recommend(小卡) / campus_wall(中卡，同校可见)
 * - 官方帖：STUDENT_UNION/TEAM/SPONSOR(大卡)，由后管经 createOfficialPost 发布
 * - 推荐流：加权混排（§8.1.4）；校园墙：同校硬过滤
 */

// 官方帖作者类型集合（用于判定大卡）
const OFFICIAL_TYPES: SquareAuthorType[] = [
  SquareAuthorType.STUDENT_UNION,
  SquareAuthorType.TEAM,
  SquareAuthorType.SPONSOR,
];

// 举报自动隐藏阈值（§8.1.7）
const REPORT_HIDE_THRESHOLD = 3;

// 校园墙中卡破圈阈值与每页插入上限（§8.1.4）
const WALL_HOT_THRESHOLD = 10;
const WALL_PICKS_PER_PAGE = 2;

// 每隔多少张小卡插一张官方大卡（§8.1.4）
const OFFICIAL_INTERVAL = 5;

/**
 * 「猜你喜欢」口味画像：由用户的点赞/评论行为聚合而来的三张权重表，
 * 值域均为 0..1（按各表最大值归一化）。见 getTasteProfile。
 */
interface TasteProfile {
  tags: Map<string, number>;
  authors: Map<string, number>;
  schools: Map<string, number>;
}

@Injectable()
export class SquareService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  // board 字符串 → Prisma 枚举（public：SquareAdminService 复用）
  toBoard(b: 'recommend' | 'campus_wall'): SquareBoard {
    return b === 'campus_wall' ? SquareBoard.CAMPUS_WALL : SquareBoard.RECOMMEND;
  }

  // 取作者学校（campus_wall 发帖必需）
  private async getUserSchool(userId: string): Promise<string | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { school: true },
    });
    return profile?.school ?? null;
  }

  // ─── 用户发帖（§8.1.5） ──────────────────────────────────────
  // authorType=USER；school 取作者 profile.school（用户无法伪造他校）
  async createPost(userId: string, dto: CreatePostDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // 投票帖（校园墙投票）：强制发在校园墙，需审核后才对他人可见
    const isPoll = dto.postType === 'poll';
    const board = isPoll ? SquareBoard.CAMPUS_WALL : this.toBoard(dto.board);
    const school = await this.getUserSchool(userId);

    // campus_wall 且作者无 school → 400（引导补全资料，§8.1.6 决策 2）
    if (board === SquareBoard.CAMPUS_WALL && !school) {
      throw new BadRequestException('Please fill in your school in your profile before posting to the campus wall');
    }

    let pollOptions: { text: string; votes: number }[] | undefined;
    if (isPoll) {
      const opts = (dto.pollOptions || []).map((t) => (t || '').trim()).filter(Boolean);
      if (opts.length < 2) {
        throw new BadRequestException('A poll needs at least 2 options');
      }
      pollOptions = opts.map((text) => ({ text, votes: 0 }));
    }

    const post = await this.prisma.squarePost.create({
      data: {
        board,
        authorType: SquareAuthorType.USER,
        authorUserId: userId,
        school: school ?? null,
        title: dto.title || null,
        content: dto.content,
        images: dto.images || [],
        anonymous: dto.anonymous ?? false,
        tags: dto.tags || [],
        postType: isPoll ? 'poll' : 'normal',
        pollOptions: pollOptions as any,
        // 投票帖需审核（有对应学生会由其审，否则平台团队审）；普通帖直接可见
        reviewStatus: isPoll ? 'pending' : 'approved',
      },
      include: this.postInclude(),
    });

    return this.shapePost(post, userId);
  }

  // ─── 校园墙投票：投票/改票（POST /square/v2/posts/:id/vote）────
  async votePoll(postId: string, userId: string, optionIndex: number) {
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, postType: true, pollOptions: true, reviewStatus: true, isHidden: true, school: true },
    });
    if (!post || post.postType !== 'poll') throw new NotFoundException('Poll not found');
    if (post.isHidden || post.reviewStatus !== 'approved') {
      throw new BadRequestException('This poll is not open for voting');
    }
    // 校园墙投票的语义前提是同校：拿到链接的外校用户不可灌票
    if (post.school) {
      const mySchool = await this.getUserSchool(userId);
      if (mySchool !== post.school) {
        throw new ForbiddenException('Only students of this school can vote');
      }
    }
    const options = (post.pollOptions as any[]) || [];
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
      throw new BadRequestException('Invalid option');
    }
    // 事务：落票（每人一票可改票）→ 重算各选项票数 → 冗余写回 pollOptions
    const pollOptions = await this.prisma.$transaction(async (tx) => {
      await tx.squarePollVote.upsert({
        where: { postId_userId: { postId, userId } },
        create: { postId, userId, optionIndex },
        update: { optionIndex },
      });
      const grouped = await tx.squarePollVote.groupBy({
        by: ['optionIndex'],
        where: { postId },
        _count: { _all: true },
      });
      const counts = new Map(grouped.map((g) => [g.optionIndex, g._count._all]));
      const next = options.map((o: any, i: number) => ({ text: o.text, votes: counts.get(i) || 0 }));
      await tx.squarePost.update({ where: { id: postId }, data: { pollOptions: next as any } });
      return next;
    });
    return { pollOptions, myVote: optionIndex };
  }

  // 批量补充 myVote：feed / 详情里的投票帖标记当前用户投的选项
  private async annotateMyVotes(items: any[], userId: string) {
    const pollIds = items.filter((p) => p?.postType === 'poll').map((p) => p.id);
    if (!pollIds.length) return items;
    const votes = await this.prisma.squarePollVote.findMany({
      where: { userId, postId: { in: pollIds } },
      select: { postId: true, optionIndex: true },
    });
    const byPost = new Map(votes.map((v) => [v.postId, v.optionIndex]));
    for (const p of items) {
      if (p?.postType === 'poll') p.myVote = byPost.has(p.id) ? byPost.get(p.id) : null;
    }
    return items;
  }

  // ═══════════ 广场搜索（§8.1.4 扩展）═══════════════════════════
  //
  // 检索：pg_trgm。中英混排内容不能用 Postgres 内置全文检索（对中文不分词），
  // trgm 的 ILIKE '%q%' 对中英文一视同仁，且有 GIN 索引兜底
  // （见 prisma/ensure-search-indexes.ts；缺扩展时功能不变、只是走全表扫）。
  //
  // 排序：相关性为主，热度/新鲜度只做小幅加成——搜索场景用户找的是"这条"，
  // 不是"最热的一条"，热度权重过大会把精确命中压到长热帖后面。

  // 查询串长度上限：trgm 相似度对超长串无意义，且防止构造巨串拖垮 ILIKE
  private static readonly SEARCH_MAX_LEN = 64;

  /** 归一化查询串；返回 null 表示不是一次有效搜索（调用方应回退到普通信息流） */
  private normalizeQuery(raw?: string): string | null {
    const q = (raw || '').trim().replace(/\s+/g, ' ');
    if (!q) return null;
    return q.slice(0, SquareService.SEARCH_MAX_LEN);
  }

  /**
   * 帖子搜索。board 为空表示跨两个板块搜。
   * 可见性与信息流严格一致：
   *  - 一律 isHidden=false
   *  - 推荐板：reviewStatus=approved
   *  - 校园墙：仅本校，且 approved（本人的待审/被驳回帖对本人仍可见）
   * 未填学校的用户搜不到任何校园墙内容（与 listCampusWall 的 needProfileSchool 同口径）。
   */
  async searchPosts(
    userId: string,
    opts: { q: string; board?: SquareBoard; page?: number; limit?: number } = {} as any,
  ) {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;
    const q = this.normalizeQuery(opts.q);
    const mySchool = await this.getUserSchool(userId);

    if (!q) {
      return { items: [], page, limit, total: 0, hasMore: false, query: '', isSearch: true };
    }

    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

    // 可见性分支：按板块拼 SQL 片段。跨板搜索时两个分支 OR 起来，
    // 各自带各自的约束（校园墙的同校硬过滤绝不能被 OR 掉）。
    const wallVisible = mySchool
      ? Prisma.sql`(p.board = 'CAMPUS_WALL' AND p.school = ${mySchool}
                    AND (p."reviewStatus" = 'approved' OR p."authorUserId" = ${userId}))`
      : Prisma.sql`(false)`;
    const recommendVisible = Prisma.sql`(p.board = 'RECOMMEND' AND p."reviewStatus" = 'approved')`;

    let scope: Prisma.Sql;
    if (opts.board === SquareBoard.CAMPUS_WALL) scope = wallVisible;
    else if (opts.board === SquareBoard.RECOMMEND) scope = recommendVisible;
    else scope = Prisma.sql`(${recommendVisible} OR ${wallVisible})`;

    // 相关性：标题命中 > 标签精确命中 > 正文命中；模糊相似度兜底错别字/词形差异。
    // similarity() 只对已被 WHERE 过滤出的行计算，不影响索引使用。
    // 正文只取前 500 字算相似度——长文整篇算 trgm 相似度既慢又会被长度稀释。
    // 无 pg_trgm 时去掉这两项模糊分量（函数不存在会直接报错），只保留精确/子串命中，
    // 搜索仍然可用，只是没有容错匹配。
    const fuzzy = (await this.prisma.hasTrgm())
      ? Prisma.sql`,
               similarity(COALESCE(p.title, ''), ${q}) * 2.0,
               similarity(LEFT(p.content, 500), ${q}) * 1.2`
      : Prisma.empty;

    // 评论命中（P1-9）：LEFT JOIN LATERAL 每帖只取一条最早的命中评论——
    // 这既给出展示用的片段，又天然按帖去重（一帖 10 条评论命中也只出一张卡，
    // 否则热帖会用自己的评论把整页搜索结果刷满）。
    // 片段截断到 120 字：卡片放不下更多，也避免把整篇长评论塞进列表响应。
    // 只取正文、不带评论作者——匿名帖的评论在详情页本就脱敏，
    // 搜索结果更不该成为反推身份的旁路。
    const rows = await this.prisma.$queryRaw<
      { id: string; rel: number; commentSnippet: string | null }[]
    >(Prisma.sql`
      SELECT p.id,
             GREATEST(
               CASE WHEN p.title ILIKE ${like} THEN 3.0 ELSE 0 END,
               CASE WHEN ${q} = ANY(p.tags) THEN 2.6 ELSE 0 END,
               CASE WHEN p.content ILIKE ${like} THEN 1.8 ELSE 0 END,
               -- 评论命中弱于正文命中：讨论区提到 ≠ 帖子本身讲这个
               CASE WHEN cm.snippet IS NOT NULL THEN 1.2 ELSE 0 END${fuzzy}
             )::float8 AS rel,
             cm.snippet AS "commentSnippet"
        FROM square_posts p
        LEFT JOIN LATERAL (
          SELECT LEFT(c.content, 120) AS snippet
            FROM square_post_comments c
           WHERE c."postId" = p.id
             AND c.content ILIKE ${like}
           ORDER BY c."createdAt" ASC
           LIMIT 1
        ) cm ON true
       WHERE p."isHidden" = false
         AND ${scope}
         AND (
              p.title ILIKE ${like}
           OR p.content ILIKE ${like}
           OR p.tags @> ARRAY[${q}]::text[]
           OR cm.snippet IS NOT NULL
         )
       ORDER BY rel DESC, p."createdAt" DESC
       LIMIT 300
    `);

    if (!rows.length) {
      return { items: [], page, limit, total: 0, hasMore: false, query: q, isSearch: true };
    }

    const relById = new Map(rows.map((r) => [r.id, Number(r.rel) || 0]));
    // 命中片段：仅当帖子本身没命中时才展示，否则卡片上会同时出现标题高亮与
    // 一句无关的评论，反而看不懂是为什么搜到的
    const snippetById = new Map(
      rows.filter((r) => r.commentSnippet).map((r) => [r.id, r.commentSnippet as string]),
    );
    const posts = await this.prisma.squarePost.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: this.postInclude(),
    });

    // 判定帖子本身是否命中（与上面 SQL 的 ILIKE 同语义：大小写不敏感子串）
    const needle = q.toLowerCase();
    const matches = (s: string | null | undefined) => !!s && s.toLowerCase().includes(needle);

    // 终排：相关性 × (热度加成) × (新鲜度加成)。两个加成都是 ≤1.3 的乘子，
    // 保证「标题精确命中的冷帖」永远排在「只是正文擦边的热帖」前面。
    const now = Date.now();
    const ranked = posts
      .map((p) => {
        const rel = relById.get(p.id) ?? 0;
        const hotness = Math.log10(1 + p.likeCount + 2 * p.commentCount); // 0..~2
        const ageDays = (now - new Date(p.createdAt).getTime()) / 86400000;
        const freshness = Math.max(0, 1 - ageDays / 30);
        return { post: p, score: rel * (1 + 0.12 * hotness) * (1 + 0.1 * freshness) };
      })
      .sort((a, b) => b.score - a.score || +new Date(b.post.createdAt) - +new Date(a.post.createdAt));

    const total = ranked.length;
    const start = (page - 1) * limit;
    const items = ranked.slice(start, start + limit).map((x) => {
      const card = this.shapeCard(x.post, userId, mySchool);
      const snippet = snippetById.get(x.post.id);
      // 帖子本身命中（标题/正文/标签）时不挂片段——那时用户已经看得出为什么搜到它
      const postItselfHit =
        (x.post.title && matches(x.post.title)) ||
        matches(x.post.content) ||
        (x.post.tags || []).some((t) => t.toLowerCase() === q.toLowerCase());
      if (snippet && !postItselfHit) card.commentSnippet = snippet;
      return card;
    });
    await this.annotateMyVotes(items, userId);

    return {
      items,
      page,
      limit,
      total,
      hasMore: start + limit < total,
      query: q,
      isSearch: true,
      // 未填学校时搜索结果里没有任何校园墙内容，前端可据此引导补资料
      needProfileSchool: !mySchool && opts.board === SquareBoard.CAMPUS_WALL,
    };
  }

  /** 广场搜索：只返回帖子。
   *  原来还会带一组「用户」结果（搜索页顶部的 PEOPLE 区），按产品要求去掉——
   *  广场搜索只搜内容，找人走好友面板的扫码/连接码。 */
  async searchAll(
    userId: string,
    opts: { q: string; board?: SquareBoard; page?: number; limit?: number } = {} as any,
  ) {
    const q = this.normalizeQuery(opts.q);
    if (!q) return { query: '', posts: { items: [], page: 1, limit: 20, total: 0, hasMore: false } };
    const posts = await this.searchPosts(userId, { ...opts, q });
    return { query: q, posts };
  }

  // ─── 推荐流（加权混排，§8.1.4）───────────────────────────────
  async listRecommend(
    userId: string,
    opts: { page?: number; limit?: number; cursor?: string; search?: string } = {},
  ) {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;

    // 带关键词 → 走搜索。此前该参数被静默忽略：H5 早就在发 &search=，
    // 后端只读 page/limit/cursor，于是搜索框亮起「筛选中」高亮却返回未过滤的信息流。
    const q = this.normalizeQuery(opts.search);
    if (q) {
      return this.searchPosts(userId, { q, board: SquareBoard.RECOMMEND, page, limit });
    }

    // 口味画像与学校并行取：画像走缓存，多数情况下是内存命中
    const [mySchool, taste] = await Promise.all([
      this.getUserSchool(userId),
      this.getTasteProfile(userId),
    ]);

    // 1) 个人小卡候选：board=RECOMMEND && authorType=USER && !isHidden
    const personalRaw = await this.prisma.squarePost.findMany({
      where: {
        board: SquareBoard.RECOMMEND,
        authorType: SquareAuthorType.USER,
        isHidden: false,
        reviewStatus: 'approved',
      },
      orderBy: { createdAt: 'desc' },
      take: 300, // 候选上限，应用层打分
      include: this.postInclude(),
    });
    const now = Date.now();
    const personal = personalRaw
      // 自己的帖子不参与个性化打分之外的特殊处理，但要排除"作者亲和"自举——已在画像里剔除
      .map((p) => ({ post: p, score: this.scorePersonalCard(p, mySchool, now, taste) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.post);

    // 2) 官方大卡：board=RECOMMEND && 官方类型 && !isHidden（pinned 优先）
    const officialRaw = await this.prisma.squarePost.findMany({
      where: {
        board: SquareBoard.RECOMMEND,
        authorType: { in: OFFICIAL_TYPES },
        isHidden: false,
        reviewStatus: 'approved',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: this.postInclude(),
    });
    const officialSorted = [...officialRaw].sort((a, b) => {
      const pa = this.metaPinned(a) ? 1 : 0;
      const pb = this.metaPinned(b) ? 1 : 0;
      if (pa !== pb) return pb - pa; // pinned 优先
      return this.metaWeight(b) - this.metaWeight(a); // 再按 weight
    });
    const pinned = officialSorted.filter((p) => this.metaPinned(p));
    const normalOfficial = officialSorted.filter((p) => !this.metaPinned(p));

    // 3) 校园墙中卡破圈：同校 && likeCount>=阈值，随机取若干
    let wallPicks: typeof personalRaw = [];
    if (mySchool) {
      const wallHot = await this.prisma.squarePost.findMany({
        where: {
          board: SquareBoard.CAMPUS_WALL,
          authorType: SquareAuthorType.USER,
          isHidden: false,
          reviewStatus: 'approved',
          school: mySchool,
          likeCount: { gte: WALL_HOT_THRESHOLD },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: this.postInclude(),
      });
      // 按 (用户, 当天) 播种：同一用户当天翻页时墙卡顺序稳定，避免 offset 分页错位重复/漏卡。
      wallPicks = this.seededShuffle(wallHot, this.hashStr(userId) ^ Math.floor(now / 86400000));
    }

    // 4) 混排：pinned 大卡置顶 → 每 5 小卡插 1 普通大卡 → 每页 ≤2 中卡
    const feed = this.interleave({
      personal,
      pinned,
      normalOfficial,
      wallPicks,
      pageSize: limit,
    });

    // 5) 分页切片
    const total = feed.length;
    const start = (page - 1) * limit;
    const slice = feed.slice(start, start + limit);
    const items = slice.map((p) => this.shapeCard(p, userId, mySchool));
    await this.annotateMyVotes(items, userId);

    return {
      items,
      page,
      limit,
      total,
      hasMore: start + limit < total,
    };
  }

  // ─── 校园墙流（同校硬过滤，§8.1.4）───────────────────────────
  async listCampusWall(
    userId: string,
    opts: { page?: number; limit?: number; cursor?: string; search?: string } = {},
  ) {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;

    // 同上：带关键词走搜索（校园墙作用域，同校硬过滤在 searchPosts 内保持）
    const q = this.normalizeQuery(opts.search);
    if (q) {
      return this.searchPosts(userId, { q, board: SquareBoard.CAMPUS_WALL, page, limit });
    }

    const mySchool = await this.getUserSchool(userId);

    // 无 school → 返回空 + 引导补全资料（§8.1.4）
    if (!mySchool) {
      return {
        items: [],
        page,
        limit,
        total: 0,
        hasMore: false,
        needProfileSchool: true,
      };
    }

    const where: Prisma.SquarePostWhereInput = {
      board: SquareBoard.CAMPUS_WALL,
      school: mySchool, // 同校硬约束
      isHidden: false,
      // 投票帖须审核通过；本人的待审/被驳回投票帖仍对本人可见（OR 分支）
      OR: [{ reviewStatus: 'approved' }, { authorUserId: userId }],
      // 置顶帖已单独成页（listPinned），不再混在墙上——**活动帖除外**：
      // 活动有时效、错过就没了，仍留在墙顶（产品口径）。
      NOT: { AND: [{ pinnedAt: { not: null } }, { postType: { not: 'event' } }] },
    };

    const [posts, total] = await Promise.all([
      this.prisma.squarePost.findMany({
        where,
        // 墙上只剩活动置顶帖会排在最前，其余按时间倒序
        orderBy: [{ pinnedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: this.postInclude(),
      }),
      this.prisma.squarePost.count({ where }),
    ]);

    const items = posts.map((p) => this.shapeCard(p, userId, mySchool));
    await this.annotateMyVotes(items, userId);
    return {
      items,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  // ─── 帖子详情（含评论 + myLiked，§8.1.5）─────────────────────
  async getPost(postId: string, userId?: string) {
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      include: {
        ...this.postInclude(),
        comments: {
          where: { parentCommentId: null },
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                verificationStatus: true,
                verifiedSchool: true,
                profile: { select: { nickname: true, avatarUrl: true } },
              },
            },
            // 评论点赞：_count 出总数；likes 只取当前用户自己的行判定 myLiked
            // （未登录时 userId 为空串，匹配不到任何行）
            _count: { select: { likes: true } },
            likes: { where: { userId: userId ?? '' }, select: { id: true } },
            replies: {
              orderBy: { createdAt: 'asc' },
              include: {
                user: {
                  select: {
                    id: true,
                    verificationStatus: true,
                    verifiedSchool: true,
                    profile: { select: { nickname: true, avatarUrl: true } },
                  },
                },
                _count: { select: { likes: true } },
                likes: { where: { userId: userId ?? '' }, select: { id: true } },
              },
            },
          },
        },
      },
    });
    if (!post) throw new NotFoundException('Post not found');

    // 隐藏帖：对他人不可见、发帖者本人仍可见（§8.1.7）
    if (post.isHidden && post.authorUserId !== userId) {
      throw new NotFoundException('Post not found');
    }
    // 待审/被驳回投票帖同理：仅作者可见
    if (post.reviewStatus !== 'approved' && post.authorUserId !== userId) {
      throw new NotFoundException('Post not found');
    }

    let myLiked = false;
    if (userId) {
      const like = await this.prisma.squarePostLike.findUnique({
        where: { postId_userId: { postId, userId } },
      });
      myLiked = !!like;
    }

    // 匿名按【每条评论】自己的 anonymous 处理——不再因为帖子匿名就把全楼一律脱敏
    // （用户口径：发帖可选匿名，发评论也各自可选）
    this.anonymizeComments(post);
    const shaped = { ...this.shapePost(post, userId), comments: this.shapeComments(post.comments), myLiked };
    if (userId) await this.annotateMyVotes([shaped], userId);
    return shaped;
  }

  // 评论出参整形：把 _count.likes 折成 likeCount、当前用户的 likes 行折成
  // myLiked，并剥掉原始 likes 数组（否则会把点赞者 id 泄露给所有人）。
  private shapeComments(comments: any[]): any[] {
    if (!Array.isArray(comments)) return [];
    const one = (c: any) => {
      if (!c) return c;
      const { _count, likes, ...rest } = c;
      return {
        ...rest,
        likeCount: _count?.likes ?? 0,
        myLiked: Array.isArray(likes) && likes.length > 0,
        replies: Array.isArray(rest.replies) ? rest.replies.map(one) : [],
      };
    };
    return comments.map(one);
  }

  // ─── 置顶页（学生会置顶的信息，单独一页）──────────────────────
  // 与校园墙同一套可见性口径（同校 + 未隐藏 + 审核通过），区别只在「必须是置顶帖」。
  // 排序完全由学生会在后台定：pinnedOrder 小的在前，同值再按置顶时间倒序。
  // 不做分页：置顶是人工维护的少量信息，翻页反而让人看不全（上限兜底 50 条）。
  async listPinned(userId: string) {
    const mySchool = await this.getUserSchool(userId);
    if (!mySchool) {
      return { items: [], total: 0, needProfileSchool: true };
    }
    const where: Prisma.SquarePostWhereInput = {
      board: SquareBoard.CAMPUS_WALL,
      school: mySchool,
      isHidden: false,
      pinnedAt: { not: null },
      reviewStatus: 'approved',
    };
    const posts = await this.prisma.squarePost.findMany({
      where,
      orderBy: [{ pinnedOrder: 'asc' }, { pinnedAt: 'desc' }],
      take: 50,
      include: this.postInclude(),
    });
    const items = posts.map((p) => this.shapeCard(p, userId, mySchool));
    await this.annotateMyVotes(items, userId);
    return { items, total: items.length };
  }

  // ─── 评论（楼中楼，§8.1.5）──────────────────────────────────
  async createComment(userId: string, postId: string, dto: CreateCommentDto) {
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, isHidden: true, authorUserId: true, anonymous: true, authorType: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.isHidden && post.authorUserId !== userId) {
      throw new NotFoundException('Post not found');
    }

    // 校验父评论属于同帖
    let parentComment: { id: string; userId: string } | null = null;
    if (dto.parentCommentId) {
      const parent = await this.prisma.squarePostComment.findUnique({
        where: { id: dto.parentCommentId },
        select: { id: true, userId: true, postId: true, parentCommentId: true },
      });
      if (!parent || parent.postId !== postId) {
        throw new BadRequestException('Parent comment does not belong to this post');
      }
      // 楼中楼只有两层（getPost 只取顶层评论的直接 replies）。若回复目标本身是「回复」，
      // 把新评论挂到其顶层父评论下，否则这条 reply-to-reply 会入库、计数、通知，却永不渲染。
      // 通知仍发给被回复者本人（parent.userId）。
      const topLevelId = parent.parentCommentId || parent.id;
      parentComment = { id: topLevelId, userId: parent.userId };
    }

    // 本条评论的**最终**匿名值：先取评论者自己的选择；
    // 匿名帖楼主在自己帖下评论则强制匿名——他实名说话会被 AUTHOR 标记指认，
    // 等于把发帖时选的匿名当场作废。下面通知文案也必须用这个值，不能用 dto 原值。
    const isAnonUserPost = post.anonymous && post.authorType === SquareAuthorType.USER;
    const isPostAuthor = !!post.authorUserId && post.authorUserId === userId;
    const anonymous = (dto.anonymous ?? false) || (isAnonUserPost && isPostAuthor);

    const [comment] = await this.prisma.$transaction([
      this.prisma.squarePostComment.create({
        data: {
          postId,
          userId,
          content: dto.content,
          imageUrl: dto.imageUrl || null,
          anonymous,
          parentCommentId: parentComment?.id || null,
        },
        include: {
          user: {
            select: {
              id: true,
              verificationStatus: true,
              verifiedSchool: true,
              profile: { select: { nickname: true, avatarUrl: true } },
            },
          },
        },
      }),
      this.prisma.squarePost.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      }),
    ]);

    // 评论是画像里权重最高的信号，同样立即失效缓存
    this.invalidateTaste(userId);

    // 通知作者 + 被回复者（去重、不通知自己、官方帖无 authorUserId 跳过）
    // 名字按【这条评论】的匿名值出，与帖子是否匿名无关：匿名评论若在通知里写真名，
    // 收件人拿「XX 评论了」一对帖内的匿名楼层就还原了身份，匿名当场作废。
    // 化名用与帖内同一个 per-post 种子，否则通知里的名字对不上楼里的任何人。
    const actorName = anonymous
      ? this.anonIdentity(postId, userId).nickname
      : await this.getNickname(userId);
    if (post.authorUserId && post.authorUserId !== userId) {
      await this.prisma.notification.create({
        data: {
          userId: post.authorUserId,
          type: 'comment',
          title: 'New comment',
          body: `${actorName} commented on your post`,
          metadata: { postId, commentId: comment.id },
        },
      });
      this.realtime.emitToUser(post.authorUserId, { type: 'notification' });
    }
    if (
      parentComment &&
      parentComment.userId !== userId &&
      parentComment.userId !== post.authorUserId
    ) {
      await this.prisma.notification.create({
        data: {
          userId: parentComment.userId,
          type: 'comment',
          title: 'New reply',
          body: `${actorName} replied to your comment`,
          metadata: { postId, commentId: comment.id },
        },
      });
      this.realtime.emitToUser(parentComment.userId, { type: 'notification' });
    }

    // 出参也要脱敏：前端可能把 POST 的返回直接插进楼层，
    // 不脱敏会闪出真实昵称/头像，与用户刚勾的匿名自相矛盾（iOS 还可能缓存）。
    const shapedPost: any = { id: postId, authorUserId: post.authorUserId, anonymous: post.anonymous, comments: [comment] };
    this.anonymizeComments(shapedPost);
    return shapedPost.comments[0];
  }

  // ─── 点赞（切换）────────────────────────────────────────────
  // 评论点赞（切换）。计数不落字段，改后按 _count 聚合返回最新值；
  // 唯一约束 (commentId,userId) 保证并发重复点赞不会重复入行。
  async likeComment(commentId: string, userId: string) {
    const comment = await this.prisma.squarePostComment.findUnique({
      where: { id: commentId },
      select: { id: true, post: { select: { isHidden: true, authorUserId: true } } },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.post?.isHidden && comment.post.authorUserId !== userId) {
      throw new NotFoundException('Comment not found');
    }
    const liked = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.squareCommentLike.findUnique({
        where: { commentId_userId: { commentId, userId } },
      });
      if (existing) {
        await tx.squareCommentLike.delete({
          where: { commentId_userId: { commentId, userId } },
        });
        return false;
      }
      await tx.squareCommentLike.create({ data: { commentId, userId } });
      return true;
    });
    const likeCount = await this.prisma.squareCommentLike.count({ where: { commentId } });
    return { liked, likeCount };
  }

  async likePost(postId: string, userId: string) {
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, isHidden: true, authorUserId: true, anonymous: true, authorType: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.isHidden && post.authorUserId !== userId) {
      throw new NotFoundException('Post not found');
    }

    // 存在性检查 + 计数变更放进同一事务,并以 delete/create 真正命中行为准:
    // 并发重复 like/unlike 时,败者的 delete(P2025)/create(P2002) 会抛错回滚,
    // 计数不会被重复增减(修复 likeCount 漂移/转负)。
    const liked = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.squarePostLike.findUnique({
        where: { postId_userId: { postId, userId } },
      });
      if (existing) {
        await tx.squarePostLike.delete({ where: { postId_userId: { postId, userId } } });
        await tx.squarePost.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
        });
        return false;
      }
      await tx.squarePostLike.create({ data: { postId, userId } });
      await tx.squarePost.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      });
      return true;
    });

    // 点赞是「猜你喜欢」画像的主要输入，行为一变就让缓存失效，
    // 用户下拉刷新即可看到偏好生效，而不用等 5 分钟 TTL 到期
    this.invalidateTaste(userId);

    if (!liked) {
      return { liked: false, message: 'Like removed' };
    }

    if (post.authorUserId && post.authorUserId !== userId) {
      // 匿名帖：点赞者对楼主保持匿名。body 用化名，且 metadata.actorId 用不可反推的 per-post
      // token（不能下发真实 userId——客户端可见 metadata），否则匿名形同虚设。
      // 去重键 actorKey 在匿名/非匿名下都对同一 (post, 用户) 稳定，首赞去重仍生效。
      const isAnonUserPost = post.anonymous && post.authorType === SquareAuthorType.USER;
      const actorKey = isAnonUserPost ? this.authorToken(postId, userId) : userId;
      // 只在该用户对该帖「首次点赞」时通知，避免反复取消/重赞刷屏（§8.1）：
      // 若已存在本 post+actor 的 like 通知则跳过。用 JSON path 过滤（PostgreSQL），
      // 不依赖 metadata 键顺序，比整对象 equals 更稳健。
      const existingNotif = await this.prisma.notification.findFirst({
        where: {
          userId: post.authorUserId,
          type: 'like',
          AND: [
            { metadata: { path: ['postId'], equals: postId } },
            { metadata: { path: ['actorId'], equals: actorKey } },
          ],
        },
        select: { id: true },
      });
      if (!existingNotif) {
        const actorName = isAnonUserPost ? this.anonIdentity(postId, userId).nickname : await this.getNickname(userId);
        await this.prisma.notification.create({
          data: {
            userId: post.authorUserId,
            type: 'like',
            title: 'New like',
            body: `${actorName} liked your post`,
            metadata: { postId, actorId: actorKey },
          },
        });
        this.realtime.emitToUser(post.authorUserId, { type: 'notification' });
      }
    }

    return { liked: true, message: 'Liked' };
  }

  // ─── 举报（累计 ≥3 自动隐藏，§8.1.7）─────────────────────────
  async reportPost(postId: string, userId: string, reason?: string) {
    // 并发举报同帖时若在事务外读-改-写，后发请求可能基于过期 reports 覆盖前者，
    // 导致计数丢失或重复触发隐藏。整个读-改-写 + 阈值判定置于同一事务内原子执行（§8.1.7）。
    // 仅默认隔离级别（Read Committed）下两并发举报仍可能各自读到旧 metadata 后互相覆盖（lost update），
    // 故显式提升到 Serializable：冲突事务会被数据库回滚（败者抛错重试或失败），保证不丢举报、阈值只触发一次。
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.squarePost.findUnique({
        where: { id: postId },
        select: { id: true, isHidden: true, metadata: true },
      });
      if (!post) throw new NotFoundException('Post not found');

      // metadata.reports[] 去重计数（按 userId），无新表
      const meta = (post.metadata as Record<string, any> | null) ?? {};
      const reports: Array<{ userId: string; reason?: string; at: string }> =
        Array.isArray(meta.reports) ? meta.reports : [];

      const already = reports.some((r) => r.userId === userId);
      if (!already) {
        reports.push({ userId, reason: reason || undefined, at: new Date().toISOString() });
      }

      const reporterCount = new Set(reports.map((r) => r.userId)).size;
      const shouldHide = reporterCount >= REPORT_HIDE_THRESHOLD && !post.isHidden;

      const data: Prisma.SquarePostUpdateInput = {
        metadata: { ...meta, reports } as Prisma.InputJsonValue,
      };
      // 仅当尚未隐藏且达阈值时自动隐藏
      if (shouldHide) {
        data.isHidden = true;
        data.deletedBy = 'reporter:auto';
        data.deletedAt = new Date();
        data.deleteReason = 'Automatically hidden after exceeding report threshold';
      }

      await tx.squarePost.update({ where: { id: postId }, data });

      return {
        reported: !already,
        reporterCount,
        hidden: shouldHide || post.isHidden,
        message: already ? 'You have already reported this post' : 'Report submitted',
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // ─── 作者自删（§8.1.7）──────────────────────────────────────
  async deleteOwnPost(userId: string, postId: string) {
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, authorUserId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorUserId !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    await this.prisma.squarePost.update({
      where: { id: postId },
      data: {
        isHidden: true,
        deletedBy: userId,
        deletedAt: new Date(),
        deleteReason: 'Deleted by author',
      },
    });
    return { deleted: true, message: 'Deleted' };
  }

  // ════════════ 私有工具 ════════════

  // 列表/详情通用 include（作者 + 官方 + 情侣双方 profile）
  // public：SquareAdminService 复用同一套关联与整形
  postInclude() {
    return {
      authorUser: {
        select: {
          id: true,
          // 校标：认 verifiedSchool（审核快照）而非 profile.school（用户可随意改）。
          // shapePost 对匿名帖会把整个 authorUser 置 null，故此处无需额外防匿名。
          verificationStatus: true,
          verifiedSchool: true,
          profile: { select: { nickname: true, avatarUrl: true, school: true } },
        },
      },
      admin: {
        select: { id: true, name: true, organizationName: true, role: true },
      },
      // 活动帖直出活动信息（时间/地点/票价/余量），H5 卡片与详情免二次请求
      event: {
        select: {
          id: true, title: true, venue: true, school: true, startAt: true, endAt: true,
          priceCents: true, capacity: true, ticketsSold: true, status: true,
        },
      },
      _count: { select: { likes: true, comments: true } },
    } satisfies Prisma.SquarePostInclude;
  }

  // 个人小卡打分（§8.1.4）：score = 0.5*hotness + 0.3*sameSchool + 0.2*freshness
  //                        + 0.45*affinity（「猜你喜欢」个性化分量）
  // 个性化权重刻意压在热度之下：画像来自点赞/评论这类稀疏信号，
  // 新用户几乎没有画像，权重过高会让冷启动用户看到一堆低质长尾帖。
  private scorePersonalCard(
    post: {
      likeCount: number; commentCount: number; school: string | null;
      createdAt: Date; tags?: string[]; authorUserId?: string | null;
    },
    mySchool: string | null,
    now: number,
    taste?: TasteProfile | null,
  ): number {
    const hotness = Math.log10(1 + post.likeCount + 2 * post.commentCount);
    const sameSchool = mySchool && post.school === mySchool ? 1 : 0;
    const ageHours = (now - new Date(post.createdAt).getTime()) / 3600000;
    const freshness = Math.max(0, Math.min(1, 1 - ageHours / 168));
    const affinity = taste ? this.affinityOf(post, taste) : 0;
    return 0.5 * hotness + 0.3 * sameSchool + 0.2 * freshness + 0.45 * affinity;
  }

  /**
   * 帖子与用户口味画像的契合度，归一化到 0..1。
   * 三个分量：标签命中（最强）、作者亲和（读过这个人的东西）、学校亲和。
   */
  private affinityOf(
    post: { tags?: string[]; authorUserId?: string | null; school?: string | null },
    taste: TasteProfile,
  ): number {
    let tagScore = 0;
    for (const t of post.tags ?? []) {
      const w = taste.tags.get(t.trim().toLowerCase());
      if (w) tagScore += w;
    }
    // 多标签命中收益递减：3 个弱标签不该压过 1 个强标签
    tagScore = tagScore > 0 ? Math.min(1, Math.sqrt(tagScore)) : 0;

    const authorScore = post.authorUserId ? (taste.authors.get(post.authorUserId) ?? 0) : 0;
    const schoolScore = post.school ? (taste.schools.get(post.school) ?? 0) : 0;

    return Math.min(1, 0.6 * tagScore + 0.3 * authorScore + 0.1 * schoolScore);
  }

  /**
   * 口味画像：由最近的点赞/评论行为聚合出 tag / 作者 / 学校三张权重表（各自归一化到 0..1）。
   *
   * 缓存：进程内 TTL 5 分钟。画像变化很慢（要攒够行为才会漂移），
   * 而推荐流是高频接口——每次翻页都重算两张行为表是纯浪费。
   * 单进程缓存对多实例部署会有最多 5 分钟的不一致，这对"排序偏好"来说完全无害。
   */
  private tasteCache = new Map<string, { at: number; taste: TasteProfile }>();
  private static readonly TASTE_TTL_MS = 5 * 60 * 1000;
  private static readonly TASTE_CACHE_MAX = 500;

  private async getTasteProfile(userId: string): Promise<TasteProfile | null> {
    const hit = this.tasteCache.get(userId);
    if (hit && Date.now() - hit.at < SquareService.TASTE_TTL_MS) return hit.taste;

    // 评论权重高于点赞：打字比点一下贵得多，是更强的兴趣表达
    const [likes, comments] = await Promise.all([
      this.prisma.squarePostLike.findMany({
        where: { userId },
        select: { post: { select: { tags: true, authorUserId: true, school: true } } },
        orderBy: { createdAt: 'desc' },
        take: 150,
      }),
      this.prisma.squarePostComment.findMany({
        where: { userId },
        select: { post: { select: { tags: true, authorUserId: true, school: true } } },
        orderBy: { createdAt: 'desc' },
        take: 80,
      }),
    ]);

    const signals: { post: any; w: number }[] = [
      ...likes.map((l) => ({ post: l.post, w: 1 })),
      ...comments.map((c) => ({ post: c.post, w: 2.5 })),
    ].filter((s) => s.post);

    // 行为太少（<3 次）画像不可信，直接不做个性化，走原有混排
    if (signals.length < 3) {
      this.rememberTaste(userId, null);
      return null;
    }

    const tags = new Map<string, number>();
    const authors = new Map<string, number>();
    const schools = new Map<string, number>();
    const add = (m: Map<string, number>, k: string | null | undefined, w: number) => {
      if (!k) return;
      m.set(k, (m.get(k) ?? 0) + w);
    };
    for (const s of signals) {
      for (const t of s.post.tags ?? []) add(tags, String(t).trim().toLowerCase(), s.w);
      // 不把"自己"算进作者亲和：用户当然会赞自己的帖，那会让自己的帖霸占自己的首页
      if (s.post.authorUserId && s.post.authorUserId !== userId) {
        add(authors, s.post.authorUserId, s.w);
      }
      add(schools, s.post.school, s.w);
    }

    const taste: TasteProfile = {
      tags: this.normalizeWeights(tags, 40),
      authors: this.normalizeWeights(authors, 40),
      schools: this.normalizeWeights(schools, 10),
    };
    this.rememberTaste(userId, taste);
    return taste;
  }

  /** 按最大值归一化到 0..1，只留权重最高的 topN 项 */
  private normalizeWeights(m: Map<string, number>, topN: number): Map<string, number> {
    if (!m.size) return new Map();
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
    const max = sorted[0][1] || 1;
    return new Map(sorted.map(([k, v]) => [k, v / max]));
  }

  private rememberTaste(userId: string, taste: TasteProfile | null) {
    // 粗暴 LRU：超上限时丢掉最旧的一条，防止长跑进程无限增长
    if (this.tasteCache.size >= SquareService.TASTE_CACHE_MAX) {
      const oldest = [...this.tasteCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.tasteCache.delete(oldest[0]);
    }
    this.tasteCache.set(userId, {
      at: Date.now(),
      taste: taste ?? { tags: new Map(), authors: new Map(), schools: new Map() },
    });
  }

  /** 用户产生新行为后使画像失效（点赞/评论即时反映到下一次刷新） */
  private invalidateTaste(userId: string) {
    this.tasteCache.delete(userId);
  }

  private metaPinned(post: { metadata: unknown }): boolean {
    const m = post.metadata as Record<string, any> | null;
    return !!m?.pinned;
  }

  private metaWeight(post: { metadata: unknown }): number {
    const m = post.metadata as Record<string, any> | null;
    const w = m?.weight;
    return typeof w === 'number' ? w : 0;
  }

  // 混排：pinned 大卡置顶 → 每 OFFICIAL_INTERVAL 张小卡插 1 普通大卡 → 每页 ≤WALL_PICKS_PER_PAGE 中卡
  // 中卡配额按「每页（pageSize 张已发出卡片）」重置，而非整条 feed 一次性封顶——
  // 否则封顶后只有第 1 页有中卡，后续页永远看不到破圈中卡（§8.1.4）。
  private interleave<T>(args: {
    personal: T[];
    pinned: T[];
    normalOfficial: T[];
    wallPicks: T[];
    pageSize: number;
  }): T[] {
    const { personal, pinned, normalOfficial, wallPicks, pageSize } = args;
    const feed: T[] = [];

    // pinned 永远首位
    feed.push(...pinned);

    let oi = 0; // 普通官方游标
    let wi = 0; // 中卡游标
    // 当前页窗口内已插入的中卡数；每满 pageSize 张已发出卡片重置（每页 ≤ WALL_PICKS_PER_PAGE）
    let wallInsertedThisPage = 0;
    const pageOf = (len: number) => (pageSize > 0 ? Math.floor(len / pageSize) : 0);
    let curPage = pageOf(feed.length);

    const rollPage = () => {
      const p = pageOf(feed.length);
      if (p !== curPage) {
        curPage = p;
        wallInsertedThisPage = 0;
      }
    };

    for (let i = 0; i < personal.length; i++) {
      feed.push(personal[i]);
      rollPage();
      // 每 OFFICIAL_INTERVAL 张小卡后插 1 普通大卡
      if ((i + 1) % OFFICIAL_INTERVAL === 0 && oi < normalOfficial.length) {
        feed.push(normalOfficial[oi++]);
        rollPage();
        // 同一节奏点尝试插中卡（当前页 ≤ WALL_PICKS_PER_PAGE）
        if (wallInsertedThisPage < WALL_PICKS_PER_PAGE && wi < wallPicks.length) {
          feed.push(wallPicks[wi++]);
          wallInsertedThisPage++;
          rollPage();
        }
      }
    }

    // 余下普通大卡补到尾部
    while (oi < normalOfficial.length) feed.push(normalOfficial[oi++]);
    // 余下中卡补到尾部：personal/official 已耗尽，中卡是唯一可填内容，逐张追加，
    // 仍按「每页 ≤ WALL_PICKS_PER_PAGE」配额（每满 pageSize 张已发出卡片重置），
    // 越过页边界后下一页继续插，保证后续页同样能看到破圈中卡（§8.1.4）。
    while (wi < wallPicks.length) {
      rollPage();
      if (wallInsertedThisPage >= WALL_PICKS_PER_PAGE) {
        // 本页配额已满且无其它卡可推进页边界：余下中卡只能堆在末尾页，
        // 直接追加（不再受配额约束，因为没有内容可分隔），避免静默丢弃热门中卡
        feed.push(wallPicks[wi++]);
        continue;
      }
      feed.push(wallPicks[wi++]);
      wallInsertedThisPage++;
    }

    return feed;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 确定性洗牌（LCG）：同一 seed 产出同一顺序。用于推荐流的破圈墙卡——
  // 原来每次请求都 Math.random 重洗，offset 分页会在页间错位（同卡重复/漏出）。
  private seededShuffle<T>(arr: T[], seed: number): T[] {
    const a = [...arr];
    let s = (seed >>> 0) || 1;
    const rand = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  // 卡片整形：判定卡型 + 匿名脱敏（§8.1.1 规则 7）
  private shapeCard(post: any, viewerId: string | undefined, mySchool: string | null) {
    const isOfficial = OFFICIAL_TYPES.includes(post.authorType);
    let cardType: 'large' | 'medium' | 'small';
    if (isOfficial) {
      cardType = 'large';
    } else if (post.board === SquareBoard.CAMPUS_WALL) {
      cardType = 'medium';
    } else {
      cardType = 'small';
    }
    return { ...this.shapePost(post, viewerId), cardType, sameSchool: !!mySchool && post.school === mySchool };
  }

  // 帖子脱敏整形：匿名帖不下发作者身份（学校照常显示，§8.1.1）
  // public：SquareAdminService 复用
  shapePost(post: any, viewerId: string | undefined) {
    const out: any = { ...post };
    // 审核内部字段绝不下发：metadata.reports 含举报人 userId + 理由，
    // 若原样返回，任何人（含被举报作者）都能看到谁举报了自己。整块 metadata 目前只承载
    // 审核数据，前端无消费，直接剔除。
    delete out.metadata;
    // 用户侧只给布尔（何时被置顶属后管信息）
    out.isPinned = !!post.pinnedAt;
    delete out.pinnedAt;
    // 是否本人（用于前端展示自删入口等）——须在删除 authorUserId 之前算出
    const isMine = !!viewerId && post.authorUserId === viewerId;
    if (post.anonymous && post.authorType === SquareAuthorType.USER) {
      // 从源头防泄露：作者位置空，前端渲染"匿名同学"
      out.authorUser = null;
      out.anonymousAuthor = this.anonIdentity(post.id, post.authorUserId);
      // 彻底剔除真实作者标识（authorUserId / adminId），避免匿名被前端反解
      delete out.authorUserId;
      delete out.adminId;
      // AUTHOR 徽标改用 per-post 稳定不透明 token（按 postId+authorUserId 派生，
      // 与 anonymizeComments 中给作者本人评论打的 token 一致），前端据此标记楼主评论
      out.anonymousAuthorToken = this.authorToken(post.id, post.authorUserId);
    }
    out.isMine = isMine;
    return out;
  }

  // ─── 匿名身份（§8.1.1）────────────────────────────────────
  // 化名与 token 一律走**带密钥**的 HMAC，且以 postId 加盐。
  //
  // 为什么必须带密钥：原实现是无密钥 FNV-1a 哈希，输入（postId、userId）又都是公开值——
  // 真实 userId 在别处照常下发（非匿名帖的 authorUserId、非匿名评论的 user.id），
  // 任何人拿一批 userId 离线重算就能精确反解出匿名者是谁（已实测复现，唯一命中）。
  // 逐条匿名评论上线后，这个洞会从「只暴露楼主」扩大到「每个匿名评论者」，故先修它。
  //
  // 为什么以 postId 加盐：同一个人在不同帖子里得到不同化名，跨帖不可关联——
  // 否则一次自我暴露就会把此人所有匿名发言一并连坐。
  private get anonKey(): string {
    // 复用部署时已有的密钥，避免新增一个必配项（缺失时退回常量：本地开发可用，
    // 生产 .env 一定有 JWT_SECRET，见 DEPLOY.md）
    return process.env.ANON_ALIAS_SECRET || process.env.JWT_SECRET || 'unimatcha-anon-dev';
  }

  /** per-post 稳定的匿名种子：同帖同人恒等，跨帖不可关联，且不可反推 userId */
  private anonSeed(postId: string, userId: string): number {
    const mac = createHmac('sha256', this.anonKey).update(`${postId}:${userId || ''}`).digest();
    return mac.readUInt32BE(0);
  }

  // 前端按 seed 自行渲染中/英化名与头像（切语言不必回后端）。
  // 仍下发英文 nickname：iOS 直接读它，去掉会破功。
  private anonIdentity(postId: string, userId: string) {
    const seed = this.anonSeed(postId, userId);
    return { aliasSeed: seed, nickname: this.aliasFromSeed(seed), avatarUrl: null };
  }

  // 楼主标记用的 per-post 不透明 token（前端据此给楼主评论打「作者」标）
  private authorToken(postId: string, userId: string): string {
    return `a_${(this.anonSeed(postId, userId) >>> 0).toString(36)}`;
  }

  // 英文化名（形容词 + 动物）。中文化名由前端按同一 seed 取词，
  // 两边词表下标一一对应，保证「同一个人」在中英两态是同一只动物。
  private aliasFromSeed(seed: number): string {
    const ADJ = ['Curious', 'Quiet', 'Brave', 'Gentle', 'Witty', 'Clever', 'Mellow', 'Swift', 'Cozy', 'Bold', 'Sunny', 'Lucky', 'Calm', 'Eager', 'Noble', 'Jolly'];
    const ANI = ['Otter', 'Fox', 'Sparrow', 'Koala', 'Panda', 'Lynx', 'Heron', 'Robin', 'Wren', 'Bear', 'Finch', 'Hare', 'Seal', 'Crane', 'Marten', 'Quokka'];
    return `${ADJ[seed % ADJ.length]} ${ANI[(seed >>> 8) % ANI.length]}`;
  }

  // 逐条评论脱敏：只看这条评论自己的 anonymous，不看帖子。
  // 匿名评论必须做到「除了化名什么都不剩」——真实 userId / user.id / 头像全部剔除，
  // 否则前端拿 id 一比对就还原了身份（审计实测：shapeComments 原本会把它们原样带出去）。
  private anonymizeComments(post: any) {
    const postId = post.id;
    const authorId = post.authorUserId;
    // 匿名帖楼主的 token：用来给他自己的评论打「作者」标，同时不暴露真实 id
    const authorTok = post.anonymous && authorId ? this.authorToken(postId, authorId) : null;
    const shape = (c: any) => {
      if (!c) return;
      if (c.anonymous) {
        const uid = c.userId || c.user?.id;
        const ident = this.anonIdentity(postId, uid || '');
        c.user = { profile: { nickname: ident.nickname, avatarUrl: null } };
        c.anonymousAuthor = ident; // 前端按 aliasSeed 出中/英化名与头像
        delete c.userId;
        // 楼主本人的匿名评论才打「作者」标；别人的匿名评论不能带这个 token
        if (authorTok && uid === authorId) c.anonymousAuthorToken = authorTok;
      } else if (c.user) {
        // 实名评论：只留展示所需，不下发 user.id（它是反解匿名者的原料之一）。
        // 校标两字段随实名评论下发；匿名分支整体替换 c.user，天然剥掉它们——
        // 匿名号带上「已认证」会把候选集从全校缩到该校 verified 用户，等于泄漏。
        c.user = {
          profile: c.user.profile || null,
          verificationStatus: c.user.verificationStatus ?? null,
          verifiedSchool: c.user.verifiedSchool ?? null,
        };
      }
      if (Array.isArray(c.replies)) c.replies.forEach(shape);
    };
    (post.comments || []).forEach(shape);
  }

  private async getNickname(userId: string): Promise<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { nickname: true },
    });
    return profile?.nickname || 'Someone';
  }
}
