import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, SquareBoard, SquareAuthorType, AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class SquareService {
  constructor(private prisma: PrismaService) {}

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

  // ─── 推荐流（加权混排，§8.1.4）───────────────────────────────
  async listRecommend(
    userId: string,
    opts: { page?: number; limit?: number; cursor?: string } = {},
  ) {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;
    const mySchool = await this.getUserSchool(userId);

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
      .map((p) => ({ post: p, score: this.scorePersonalCard(p, mySchool, now) }))
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
    opts: { page?: number; limit?: number; cursor?: string } = {},
  ) {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;
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
    };

    const [posts, total] = await Promise.all([
      this.prisma.squarePost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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
                profile: { select: { nickname: true, avatarUrl: true } },
              },
            },
            replies: {
              orderBy: { createdAt: 'asc' },
              include: {
                user: {
                  select: {
                    id: true,
                    profile: { select: { nickname: true, avatarUrl: true } },
                  },
                },
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

    // #4b：匿名帖的评论脱敏（化名 + 好友备注规则）
    if (post.anonymous && post.authorType === SquareAuthorType.USER && Array.isArray(post.comments) && post.comments.length) {
      await this.anonymizeComments(post);
    }
    const shaped = { ...this.shapePost(post, userId), comments: post.comments, myLiked };
    if (userId) await this.annotateMyVotes([shaped], userId);
    return shaped;
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

    const [comment] = await this.prisma.$transaction([
      this.prisma.squarePostComment.create({
        data: {
          postId,
          userId,
          content: dto.content,
          imageUrl: dto.imageUrl || null,
          parentCommentId: parentComment?.id || null,
        },
        include: {
          user: {
            select: {
              id: true,
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

    // 通知作者 + 被回复者（去重、不通知自己、官方帖无 authorUserId 跳过）
    // 匿名帖：评论者对楼主与其他评论者都保持匿名（帖内 anonymizeComments 已脱敏），
    // 通知 body 也须用化名而非真实昵称，否则楼主凭「XX 评论了」+ 帖内匿名评论即可反解身份。
    const isAnonUserPost = post.anonymous && post.authorType === SquareAuthorType.USER;
    const actorName = isAnonUserPost ? this.funAlias(userId) : await this.getNickname(userId);
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
    }

    return comment;
  }

  // ─── 点赞（切换）────────────────────────────────────────────
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
        const actorName = isAnonUserPost ? this.funAlias(userId) : await this.getNickname(userId);
        await this.prisma.notification.create({
          data: {
            userId: post.authorUserId,
            type: 'like',
            title: 'New like',
            body: `${actorName} liked your post`,
            metadata: { postId, actorId: actorKey },
          },
        });
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
  private scorePersonalCard(
    post: { likeCount: number; commentCount: number; school: string | null; createdAt: Date },
    mySchool: string | null,
    now: number,
  ): number {
    const hotness = Math.log10(1 + post.likeCount + 2 * post.commentCount);
    const sameSchool = mySchool && post.school === mySchool ? 1 : 0;
    const ageHours = (now - new Date(post.createdAt).getTime()) / 3600000;
    const freshness = Math.max(0, Math.min(1, 1 - ageHours / 168));
    return 0.5 * hotness + 0.3 * sameSchool + 0.2 * freshness;
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
  shapePost(post: any, viewerId: string | undefined) {
    const out: any = { ...post };
    // 审核内部字段绝不下发：metadata.reports 含举报人 userId + 理由，
    // 若原样返回，任何人（含被举报作者）都能看到谁举报了自己。整块 metadata 目前只承载
    // 审核数据，前端无消费，直接剔除。
    delete out.metadata;
    // 是否本人（用于前端展示自删入口等）——须在删除 authorUserId 之前算出
    const isMine = !!viewerId && post.authorUserId === viewerId;
    if (post.anonymous && post.authorType === SquareAuthorType.USER) {
      // 从源头防泄露：作者位置空，前端渲染"匿名同学"
      out.authorUser = null;
      out.anonymousAuthor = { nickname: this.funAlias(post.authorUserId), avatarUrl: null };
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

  // 匿名帖楼主的 per-post 稳定不透明 token：按 postId+userId 哈希，
  // 仅在同一帖内稳定、跨帖不可关联，且无法反推真实 userId（§8.1.1 匿名）
  private authorToken(postId: string, userId: string): string {
    let h = 2166136261;
    const s = `${postId}:${userId || ''}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return `a_${h.toString(36)}`;
  }

  // #4a：匿名身份的稳定有趣化名（按 userId 哈希，同一人始终同名）
  private funAlias(userId: string): string {
    const ADJ = ['Curious', 'Quiet', 'Brave', 'Gentle', 'Witty', 'Clever', 'Mellow', 'Swift', 'Cozy', 'Bold', 'Sunny', 'Lucky', 'Calm', 'Eager', 'Noble', 'Jolly'];
    const ANI = ['Otter', 'Fox', 'Sparrow', 'Koala', 'Panda', 'Lynx', 'Heron', 'Robin', 'Wren', 'Bear', 'Finch', 'Hare', 'Seal', 'Crane', 'Marten', 'Quokka'];
    let h = 2166136261;
    const s = userId || '';
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return `${ADJ[h % ADJ.length]} ${ANI[(h >>> 8) % ANI.length]}`;
  }

  // #4b：匿名帖的评论脱敏。作者 X 的好友 Y（且 X 给 Y 设过备注）显示「X化名 的 备注」，
  // 其余评论者显示各自化名；头像一律隐藏。回复同样处理。
  private async anonymizeComments(post: any) {
    const X = post.authorUserId;
    const authorAlias = this.funAlias(X);
    const me = await this.prisma.user.findUnique({ where: { id: X }, select: { settings: true } });
    const notes = ((me?.settings as any)?.notes) || {};
    const friends = await this.prisma.match.findMany({
      where: { mode: 'FRIEND' as any, status: 'FRIEND_CONFIRMED' as any, dissolvedAt: null, OR: [{ userAId: X }, { userBId: X }] },
      select: { userAId: true, userBId: true },
    });
    const friendSet = new Set<string>();
    for (const f of friends) friendSet.add(f.userAId === X ? f.userBId : f.userAId);
    const labelFor = (yId: string) =>
      (friendSet.has(yId) && notes[yId]) ? `${authorAlias}'s ${notes[yId]}` : this.funAlias(yId);
    const authorToken = this.authorToken(post.id, X);
    const shape = (c: any) => {
      if (c?.user) {
        const yId = c.user.id;
        // 剔除评论者真实 id / userId，仅下发化名 + 匿名头像；
        // 楼主本人的评论改用 per-post 稳定不透明 token（与 shapePost 一致）供前端打 AUTHOR 徽标
        c.user = { profile: { nickname: labelFor(yId), avatarUrl: null } };
        delete c.userId;
        if (yId === X) c.anonymousAuthorToken = authorToken;
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
