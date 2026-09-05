import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, SquareBoard, SquareAuthorType, AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SquareService } from './square.service';
import { AdminScopeService } from '../admin-core/admin-scope.service';
import { AdminActor } from '../admin-core/admin-actor';
import { paginated, skipTake } from '../common/utils/pagination';
import { ListQueryDto } from '../common/dto/list-query.dto';
import {
  CreateOfficialPostDto,
  ListPollsQueryDto,
  ListSquarePostsQueryDto,
  PinPostDto,
  ReorderPinnedDto,
  ReviewPollDto,
  UpdateOfficialPostDto,
} from './dto/square-admin.dto';

/**
 * 广场后管（ADMIN-REDESIGN §5.5，Step5 自 SquareService 拆出）：
 * 帖子管理 / 举报队列 / 投票审核 / 官方发帖。
 * 身份与范围统一走 AdminScopeService；查询与状态机逻辑自原实现逐字搬移。
 */
@Injectable()
export class SquareAdminService {
  constructor(
    private prisma: PrismaService,
    private squareService: SquareService,
    private adminScope: AdminScopeService,
  ) {}

  // ─── 投票帖审核（学生会本校 / 团队全量，ADMIN-REDESIGN §4）─────
  async listPolls(actor: AdminActor, q: ListPollsQueryDto) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const status = q.status ?? 'pending';
    const where: Prisma.SquarePostWhereInput = {
      postType: 'poll',
      reviewStatus: status,
    };
    if (actor.role === AdminRole.STUDENT_UNION) {
      where.school = this.adminScope.requireUnionSchool(actor).name;
    }
    const [posts, total, unionSchools] = await Promise.all([
      this.prisma.squarePost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: this.squareService.postInclude(),
      }),
      this.prisma.squarePost.count({ where }),
      // 有学生会入驻的学校名单：团队视图标记「该校有学生会（默认由其审核）」
      this.prisma.school.findMany({
        where: { unionAdmins: { some: { role: AdminRole.STUDENT_UNION, isActive: true } } },
        select: { name: true },
      }),
    ]);
    const unionSet = new Set(unionSchools.map((s) => s.name));
    const items = posts.map((p) => {
      const out: any = {
        ...p,
        // ⚠️ 这里是**不走 shapePost 的独立整形口**：postInclude 会回带全部标量列，
        // 帖子的 lat/lng 会原样出网。匿名投票帖虽在下面剔除了 authorUser，但坐标
        // 留在同一对象里，等于把匿名发起人的 ≈110m 位置交给同校学生会审核员，
        // 脱敏当场落空。
        lat: undefined,
        lng: undefined,
        metadata: undefined,
        hasUnionReviewer: !!p.school && unionSet.has(p.school),
      };
      // 匿名投票帖对审核员同样脱敏：审核不需要作者身份，且学生会审核员
      // 是本校账号，下发 authorUser 等于把匿名发起人直接暴露给同校学生
      if (p.anonymous) {
        out.authorUser = null;
        delete out.authorUserId;
      }
      return out;
    });
    return paginated(items, total, q);
  }

  async reviewPoll(actor: AdminActor, postId: string, dto: ReviewPollDto) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, postType: true, school: true, reviewStatus: true, authorUserId: true, title: true, content: true },
    });
    if (!post || post.postType !== 'poll') throw new NotFoundException('投票帖不存在');
    if (actor.role === AdminRole.STUDENT_UNION) {
      this.adminScope.assertSchoolNameInScope(actor, post.school);
    }
    if (post.reviewStatus !== 'pending') {
      throw new BadRequestException('该投票已审核过');
    }
    const approved = dto.action === 'approve';
    const note = dto.note;
    const updated = await this.prisma.squarePost.update({
      where: { id: postId },
      data: {
        reviewStatus: approved ? 'approved' : 'rejected',
        reviewedByAdminId: actor.id,
        reviewedAt: new Date(),
        reviewNote: note || null,
      },
    });
    // 通知作者审核结果（失败不影响审核落库）；通知文案为用户侧内容，保持英文原文
    if (post.authorUserId) {
      const label = post.title || post.content.slice(0, 30);
      await this.prisma.notification
        .create({
          data: {
            userId: post.authorUserId,
            type: 'system',
            title: approved ? 'Poll approved' : 'Poll rejected',
            body: approved
              ? `Your poll "${label}" is now live on the campus wall.`
              : `Your poll "${label}" was not approved.${note ? ` Reason: ${note}` : ''}`,
            metadata: { postId },
          },
        })
        .catch(() => undefined);
    }
    return { id: updated.id, reviewStatus: updated.reviewStatus };
  }

  // ─── 官方发帖（§8.1.3 / §8.1.5）──────────────────────────────
  async createOfficialPost(actor: AdminActor, dto: CreateOfficialPostDto) {
    if (!this.adminScope.canPublishOfficial(actor)) {
      throw new ForbiddenException('当前角色无权发布官方帖');
    }

    // authorType 由 role 推导（role 一定是官方三角色之一，因为 canPublishOfficial）
    const authorType = actor.role as unknown as SquareAuthorType;

    let school: string | null = dto.school ?? null;
    let isSponsored = dto.isSponsored ?? false;

    // board 先于角色分支解析：SPONSOR 分支要按 board 拦校园墙
    const board = dto.board ? this.squareService.toBoard(dto.board) : SquareBoard.RECOMMEND;

    if (actor.role === AdminRole.STUDENT_UNION) {
      // 学生会只能发本校：school 必填且须为本校名
      // （admin.schoolId 现为 School.id，post.school 存学校名 → 用解析出的名字比对，ADMIN-REDESIGN §4）
      if (!school) {
        throw new BadRequestException('学生会发帖必须指定学校');
      }
      this.adminScope.assertSchoolNameInScope(actor, school);
    } else if (actor.role === AdminRole.SPONSOR) {
      // 校园墙是同校学生的真实生活流，商业推广只允许进推荐流
      if (board === SquareBoard.CAMPUS_WALL) {
        throw new ForbiddenException('广告商仅可在推荐流发布推广帖');
      }
      // 广告商强制 Sponsored 标识；school 可空（跨校）
      isSponsored = true;
    }
    // TEAM：school 可空（跨校），无额外约束

    const post = await this.prisma.squarePost.create({
      data: {
        board,
        authorType,
        adminId: actor.id,
        school,
        title: dto.title || null,
        content: dto.content,
        images: dto.images || [],
        isSponsored,
      },
      include: this.squareService.postInclude(),
    });

    return this.squareService.shapePost(post, undefined);
  }

  // ─── 后管帖子列表（ADMIN-REDESIGN §5.5）───────────────────────
  // GET /admin/square/posts?board&school&status&reported&search&page&limit
  // 学生会强制 school=本校名；reported=true 走 $queryRaw（jsonb_array_length 过滤，避免跨页 post-filter）
  async adminListPosts(actor: AdminActor, params: ListSquarePostsQueryDto) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);

    const { page, limit } = params;

    // board：RECOMMEND | CAMPUS_WALL（容忍小写）
    let board: SquareBoard | undefined;
    if (params.board) {
      const b = String(params.board).toUpperCase();
      if (b !== SquareBoard.RECOMMEND && b !== SquareBoard.CAMPUS_WALL) {
        throw new BadRequestException('board 参数无效（RECOMMEND / CAMPUS_WALL）');
      }
      board = b as SquareBoard;
    }

    // status：all（默认）/ visible / hidden
    const status = params.status || 'all';
    if (!['all', 'visible', 'hidden'].includes(status)) {
      throw new BadRequestException('status 参数无效（all / visible / hidden）');
    }

    // 学校过滤：学生会强制本校 School.name；TEAM/SUPER 可按名筛选
    let school: string | undefined;
    if (actor.role === AdminRole.STUDENT_UNION) {
      school = this.adminScope.requireUnionSchool(actor).name;
    } else if (params.school) {
      school = params.school;
    }

    const search = params.search?.trim() || undefined;
    const reported = params.reported === 'true';

    if (reported) {
      return this.adminListReportedPosts({ board, school, status, search, page, limit });
    }

    const where: Prisma.SquarePostWhereInput = {};
    if (board) where.board = board;
    if (school) where.school = school;
    if (status === 'visible') where.isHidden = false;
    if (status === 'hidden') where.isHidden = true;
    if (search) {
      where.OR = [
        { content: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [posts, total] = await Promise.all([
      this.prisma.squarePost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: this.squareService.postInclude(),
      }),
      this.prisma.squarePost.count({ where }),
    ]);

    return {
      items: posts.map((p) => this.shapeAdminPost(p)),
      total,
      page,
      limit,
    };
  }

  // reported=true 分支：metadata.reports 非空 OR deletedBy='reporter:auto'。
  // Prisma 对 JSON 数组长度无法直接过滤 → 用 $queryRaw 在 SQL 层分页取 id + 总数，
  // 再 findMany 取完整关联并按原顺序回填（禁止跨页 post-filter，ADMIN-REDESIGN §5.5）
  private async adminListReportedPosts(args: {
    board?: SquareBoard;
    school?: string;
    status: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    const { board, school, status, search, page, limit } = args;

    const conds: Prisma.Sql[] = [
      Prisma.sql`("deletedBy" = 'reporter:auto' OR (jsonb_typeof(metadata -> 'reports') = 'array' AND jsonb_array_length(metadata -> 'reports') > 0))`,
    ];
    if (board) conds.push(Prisma.sql`board::text = ${board}`);
    if (school) conds.push(Prisma.sql`school = ${school}`);
    if (status === 'visible') conds.push(Prisma.sql`"isHidden" = false`);
    if (status === 'hidden') conds.push(Prisma.sql`"isHidden" = true`);
    if (search) {
      const like = `%${search}%`;
      conds.push(Prisma.sql`(content ILIKE ${like} OR title ILIKE ${like})`);
    }
    const whereSql = Prisma.join(conds, ' AND ');

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM square_posts WHERE ${whereSql} ORDER BY "createdAt" DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      ),
      this.prisma.$queryRaw<Array<{ count: number }>>(
        Prisma.sql`SELECT COUNT(*)::int AS count FROM square_posts WHERE ${whereSql}`,
      ),
    ]);
    const total = countRows[0]?.count ?? 0;
    const ids = rows.map((r) => r.id);

    const posts = ids.length
      ? await this.prisma.squarePost.findMany({
          where: { id: { in: ids } },
          include: this.squareService.postInclude(),
        })
      : [];
    const byId = new Map(posts.map((p) => [p.id, p]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => this.shapeAdminPost(p));

    return { items, total, page, limit };
  }

  // 后管列表项整形（§5.5）：全量内容（前端自行截断）+ 举报计数 + 作者展示名。
  // 匿名帖对管理员仍显示真实昵称（anonymous 标记随行，前端据此加"匿名"徽章）
  private shapeAdminPost(post: any) {
    const meta = (post.metadata as Record<string, any> | null) ?? {};
    const reportCount = Array.isArray(meta.reports) ? meta.reports.length : 0;
    const author =
      post.authorType === SquareAuthorType.USER
        ? { nickname: post.authorUser?.profile?.nickname ?? null }
        : { name: post.admin?.name ?? null };
    return {
      id: post.id,
      board: post.board,
      authorType: post.authorType,
      school: post.school,
      title: post.title,
      content: post.content,
      images: post.images,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      anonymous: post.anonymous,
      isSponsored: post.isSponsored,
      // 前端以 postType==='event' 隐藏编辑/彻底删除入口（活动帖走活动管理），缺此字段门控失效
      postType: post.postType,
      isHidden: post.isHidden,
      deletedBy: post.deletedBy,
      deleteReason: post.deleteReason,
      deletedAt: post.deletedAt,
      pinnedAt: post.pinnedAt,
      createdAt: post.createdAt,
      reportCount,
      author,
      // 处置被举报作者（封禁）需要用户句柄；匿名帖对管理员本就显示真实昵称，此处不新增泄漏面
      authorUserId: post.authorType === SquareAuthorType.USER ? post.authorUserId : null,
    };
  }

  // ─── 后管下架（§8.1.5 / §5.5）：学生会仅可下架本校帖 ──────────
  async adminDeletePost(actor: AdminActor, postId: string, reason?: string) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, school: true },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    this.adminScope.assertSchoolNameInScope(actor, post.school);

    await this.prisma.squarePost.update({
      where: { id: postId },
      data: {
        isHidden: true,
        deletedBy: actor.id,
        deletedAt: new Date(),
        deleteReason: reason || 'Removed by admin',
      },
    });
    return { hidden: true, message: '已下架' };
  }

  // ─── 后管恢复展示（ADMIN-REDESIGN §5.5）───────────────────────
  // POST /admin/square/posts/:id/restore：isHidden=false，清 deletedBy/deletedAt/deleteReason
  async adminRestorePost(actor: AdminActor, postId: string) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, school: true },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    this.adminScope.assertSchoolNameInScope(actor, post.school);

    await this.prisma.squarePost.update({
      where: { id: postId },
      data: {
        isHidden: false,
        deletedBy: null,
        deletedAt: null,
        deleteReason: null,
      },
    });
    return { restored: true, message: '已恢复展示' };
  }

  // ─── 后管清除举报（ADMIN-REDESIGN §5.5）───────────────────────
  // POST /admin/square/posts/:id/dismiss-reports：清空 metadata.reports（保留其余键）；
  // 若为举报自动隐藏（deletedBy='reporter:auto'）则同一 update 里恢复展示
  async adminDismissReports(actor: AdminActor, postId: string) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, school: true, metadata: true, deletedBy: true, isHidden: true },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    this.adminScope.assertSchoolNameInScope(actor, post.school);

    const meta = { ...(((post.metadata as Record<string, any> | null) ?? {})) };
    delete meta.reports;

    const wasAutoHidden = post.deletedBy === 'reporter:auto';
    const data: Prisma.SquarePostUpdateInput = {
      metadata: meta as Prisma.InputJsonValue,
    };
    if (wasAutoHidden) {
      data.isHidden = false;
      data.deletedBy = null;
      data.deletedAt = null;
      data.deleteReason = null;
    }

    await this.prisma.squarePost.update({ where: { id: postId }, data });
    return {
      dismissed: true,
      restored: wasAutoHidden,
      message: wasAutoHidden ? '举报已清除，帖子已恢复展示' : '举报已清除',
    };
  }

  // ─── 校园墙置顶（POST /admin/square/posts/:id/pin）────────────
  // pinnedAt 非空即置顶，墙流按 pinnedAt desc nulls last 排在最前；
  // 与推荐流官方大卡的 metadata.pinned 机制无关
  async pinPost(actor: AdminActor, postId: string, dto: PinPostDto) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, board: true, school: true },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.board !== SquareBoard.CAMPUS_WALL) {
      throw new BadRequestException('仅校园墙帖可置顶');
    }
    if (actor.role === AdminRole.STUDENT_UNION) {
      const own = this.adminScope.requireUnionSchool(actor);
      if (post.school !== own.name) {
        throw new ForbiddenException('仅可置顶本校校园墙帖');
      }
    }
    // 新置顶的排最前（取当前最小 order − 1）：刚置顶的多半是最要紧的事，
    // 默认沉到最底下、还要审核员手动拖上来，等于把功夫推给人。
    let pinnedOrder = 0;
    if (dto.pinned) {
      const top = await this.prisma.squarePost.findFirst({
        where: { board: SquareBoard.CAMPUS_WALL, pinnedAt: { not: null }, school: post.school },
        orderBy: { pinnedOrder: 'asc' },
        select: { pinnedOrder: true },
      });
      pinnedOrder = top ? top.pinnedOrder - 1 : 0;
    }
    const updated = await this.prisma.squarePost.update({
      where: { id: postId },
      data: { pinnedAt: dto.pinned ? new Date() : null, pinnedOrder },
      include: this.squareService.postInclude(),
    });
    return this.shapeAdminPost(updated);
  }

  // ─── 置顶页排序（PUT /admin/square/pinned/order）──────────────
  // 学生会拖顺序用。只接受本校全部置顶帖的完整 id 列表：
  // 少一条就说不清剩下那条该排哪儿，多一条（尤其是别校的）就是越权，两种都直接拒。
  async reorderPinned(actor: AdminActor, dto: ReorderPinnedDto) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const school =
      actor.role === AdminRole.STUDENT_UNION
        ? this.adminScope.requireUnionSchool(actor).name
        : undefined;

    // 取当前这一批置顶帖作为「合法集合」——学生会只能看到也只能动本校的
    const current = await this.prisma.squarePost.findMany({
      where: {
        board: SquareBoard.CAMPUS_WALL,
        pinnedAt: { not: null },
        ...(school ? { school } : {}),
      },
      select: { id: true },
    });
    const allowed = new Set(current.map((p) => p.id));
    const incoming = dto.postIds || [];
    if (new Set(incoming).size !== incoming.length) {
      throw new BadRequestException('排序列表里有重复的帖子');
    }
    for (const id of incoming) {
      // 别校的帖子 / 已取消置顶的帖子都会落在这里，一律拒绝而不是静默跳过
      if (!allowed.has(id)) throw new ForbiddenException('列表中包含无权调整或已取消置顶的帖子');
    }
    if (incoming.length !== allowed.size) {
      throw new BadRequestException('排序列表必须包含全部置顶帖（可能有人同时改了置顶）');
    }

    // 一次事务写完：中途失败不会留下一半新序一半旧序
    await this.prisma.$transaction(
      incoming.map((id, idx) =>
        this.prisma.squarePost.update({ where: { id }, data: { pinnedOrder: idx } }),
      ),
    );
    return { ok: true, count: incoming.length };
  }

  // ─── 编辑官方帖（PATCH /admin/square/posts/:id）───────────────
  // SUPER 可编辑任意官方帖；其余角色仅限自己发布的。用户帖/活动帖不可在此编辑
  async updateOfficialPost(actor: AdminActor, postId: string, dto: UpdateOfficialPostDto) {
    this.adminScope.assertRole(
      actor,
      AdminRole.SUPER,
      AdminRole.TEAM,
      AdminRole.STUDENT_UNION,
      AdminRole.SPONSOR,
    );
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, authorType: true, postType: true, adminId: true },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.authorType === SquareAuthorType.USER) {
      throw new BadRequestException('用户帖不可编辑');
    }
    if (post.postType === 'event') {
      throw new BadRequestException('活动帖请在活动管理中编辑活动，正文会自动同步');
    }
    if (actor.role !== AdminRole.SUPER && post.adminId !== actor.id) {
      throw new ForbiddenException('仅可编辑自己发布的官方帖');
    }

    const data: Prisma.SquarePostUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title || null;
    if (dto.content !== undefined) {
      if (!dto.content.trim()) throw new BadRequestException('正文不能为空');
      data.content = dto.content;
    }
    if (dto.images !== undefined) data.images = dto.images;

    const updated = await this.prisma.squarePost.update({
      where: { id: postId },
      data,
      include: this.squareService.postInclude(),
    });
    return this.shapeAdminPost(updated);
  }

  // ─── 彻底删除（POST /admin/square/posts/:id/purge）────────────
  // 不可恢复，区别于软下架（adminDeletePost 仅 isHidden 隐藏可 restore）：
  // 物理删除帖子行，评论/点赞/投票由 DB onDelete: Cascade 一并清除
  async purgePost(actor: AdminActor, postId: string) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, school: true, postType: true },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.postType === 'event') {
      throw new BadRequestException('活动帖随活动取消自动处理，不可单独删除');
    }
    if (actor.role === AdminRole.STUDENT_UNION) {
      const own = this.adminScope.requireUnionSchool(actor);
      // school 为 null 的帖（跨校官方帖等）不属于任何一校，学生会一律拒绝
      if (post.school !== own.name) {
        throw new ForbiddenException('仅可删除本校帖子');
      }
    }
    await this.prisma.squarePost.delete({ where: { id: postId } });
    return { ok: true };
  }

  // ─── 评论管理（GET posts/:id/comments / DELETE comments/:id）──
  async listPostComments(actor: AdminActor, postId: string, q: ListQueryDto) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const post = await this.prisma.squarePost.findUnique({
      where: { id: postId },
      select: { id: true, school: true },
    });
    if (!post) throw new NotFoundException('帖子不存在');
    if (actor.role === AdminRole.STUDENT_UNION) {
      const own = this.adminScope.requireUnionSchool(actor);
      if (post.school !== own.name) {
        throw new ForbiddenException('仅可查看本校帖子评论');
      }
    }
    const where: Prisma.SquarePostCommentWhereInput = { postId };
    const [comments, total] = await Promise.all([
      this.prisma.squarePostComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        select: {
          id: true,
          content: true,
          imageUrl: true,
          parentCommentId: true,
          createdAt: true,
          // 匿名评论对审核员仍露真实身份（要处置就必须知道是谁），但要带上标记，
          // 否则审核员不知道这条在用户侧其实是匿名显示的——与帖子侧口径一致
          // （shapeAdminPost：匿名帖对管理员显示真名 + anonymous 标记随行）
          anonymous: true,
          user: {
            select: { id: true, email: true, profile: { select: { nickname: true } } },
          },
        },
      }),
      this.prisma.squarePostComment.count({ where }),
    ]);
    // 评论者可能来自外校（用户侧评论不限同校）：email 属跨校个人信息，
    // 学生会一律脱敏——全站其余后管面对学生会也只露 nickname（users-admin 强制本校才见 email）
    const items =
      actor.role === AdminRole.STUDENT_UNION
        ? comments.map((c) => ({ ...c, user: { ...c.user, email: null as string | null } }))
        : comments;
    return paginated(items, total, q);
  }

  async deleteComment(actor: AdminActor, commentId: string) {
    this.adminScope.assertRole(actor, AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION);
    const comment = await this.prisma.squarePostComment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, post: { select: { school: true } } },
    });
    if (!comment) throw new NotFoundException('评论不存在');
    if (actor.role === AdminRole.STUDENT_UNION) {
      const own = this.adminScope.requireUnionSchool(actor);
      if (comment.post.school !== own.name) {
        throw new ForbiddenException('仅可删除本校帖子下的评论');
      }
    }
    // 删后按实况重算 commentCount 而非盲扣——盲扣在三种情况下漂移：
    // count 与 delete 之间并发新增回复被级联删掉、并发双删同帖楼层、历史孙级回复（一层化修复前入库）。
    // removed 按删前后差值计，级联多深都数得准。
    const removed = await this.prisma.$transaction(async (tx) => {
      const before = await tx.squarePostComment.count({ where: { postId: comment.postId } });
      await tx.squarePostComment.delete({ where: { id: commentId } });
      const after = await tx.squarePostComment.count({ where: { postId: comment.postId } });
      await tx.squarePost.update({
        where: { id: comment.postId },
        data: { commentCount: after },
      });
      return before - after;
    });
    return { ok: true, removed };
  }
}
