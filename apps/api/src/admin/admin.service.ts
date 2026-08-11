import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminRole,
  Prisma,
  PublicSubmissionStatus,
  PublicSubmissionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActor } from '../admin-core/admin-actor';
import { FinanceService } from '../finance/finance.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-user.dto';
import { ConvertSubmissionDto, UpdateSubmissionDto } from './dto/submission.dto';
import { CONFIG_KEY_ALLOWLIST, REDIRECTED_CONFIG_KEYS } from './dto/system-config.dto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private financeService: FinanceService,
  ) {}

  // ─── 角色/范围工具（ADMIN-REDESIGN §1）──────────────────────
  // 学生会 scope：actor.schoolId/schoolName 已由 AdminScopeService 在鉴权层解析，零查询
  private resolveUnionSchool(actor: AdminActor): { id: string; name: string } {
    if (!actor.schoolId || !actor.schoolName) {
      throw new BadRequestException('学生会账号未绑定学校');
    }
    return { id: actor.schoolId, name: actor.schoolName };
  }

  // ─── 仪表盘（角色化 payload，ADMIN-REDESIGN §4）──────────────
  async getDashboardStats(actor: AdminActor) {
    const role = actor.role;

    // 学生会：本校用户 / 余额 / 待审广告
    if (role === AdminRole.STUDENT_UNION) {
      const school = this.resolveUnionSchool(actor);
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const [total, newThisWeek, balanceInfo, pendingReviewCount, activeCampaignsInSchool] =
        await Promise.all([
          this.prisma.user.count({ where: { profile: { school: school.name } } }),
          this.prisma.user.count({
            where: { createdAt: { gte: weekAgo }, profile: { school: school.name } },
          }),
          // 余额规范实现（FinanceService.computeBalance，§1.4 单源）
          this.financeService.computeBalance(this.prisma, school.id),
          this.prisma.adCampaign.count({
            where: { status: 'PENDING_UNION_REVIEW', sourcedBySchoolId: school.id },
          }),
          this.prisma.adCampaign.count({
            where: { status: 'ACTIVE', placements: { some: { schoolId: school.id } } },
          }),
        ]);
      return {
        school: { id: school.id, name: school.name },
        users: { total, newThisWeek },
        balanceCents: balanceInfo.balance,
        // 字段名与 ads/overview 归一（原 pendingUnionReview）
        pendingReviewCount,
        activeCampaignsInSchool,
      };
    }

    // 广告商：自己的投放汇总
    if (role === AdminRole.SPONSOR) {
      const [activeCampaigns, spendAgg, statAgg] = await Promise.all([
        this.prisma.adCampaign.count({ where: { advertiserId: actor.id, status: 'ACTIVE' } }),
        this.prisma.adCampaign.aggregate({
          where: { advertiserId: actor.id },
          _sum: { spendCents: true },
        }),
        this.prisma.adDailyStat.aggregate({
          where: { campaign: { advertiserId: actor.id } },
          _sum: { impressions: true, clicks: true },
        }),
      ]);
      return {
        activeCampaigns,
        totalSpendCents: spendAgg._sum.spendCents ?? 0,
        impressionsTotal: statAgg._sum.impressions ?? 0,
        clicksTotal: statAgg._sum.clicks ?? 0,
      };
    }

    // SUPER/TEAM：平台全量（保留原 payload）＋ 学校/广告/财务汇总
    const [totalUsers, activeUsers, bannedUsers, totalMatches, pendingJobs] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'BANNED' } }),
      this.prisma.match.count(),
      this.prisma.matchJob.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } }),
    ]);

    // mode/matchState 已迁入 UserModeState：按 per-mode 状态机统计
    // relationship = 任一模式处于已确认关系；searching = 任一模式正在匹配
    const [inRelationship, inMatchMode] = await Promise.all([
      this.prisma.userModeState
        .findMany({ where: { matchState: 'relationship' }, select: { userId: true }, distinct: ['userId'] })
        .then((rows) => rows.length),
      this.prisma.userModeState
        .findMany({ where: { matchState: 'searching' }, select: { userId: true }, distinct: ['userId'] })
        .then((rows) => rows.length),
    ]);

    // 广告商业化汇总：平台 30 天广告流水（毛收入）= Σ AdDailyStat.spendCents
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [totalSchools, adRevenueAgg, pendingWithdrawals, pendingPlatformReview, pendingSubmissions] =
      await Promise.all([
        this.prisma.school.count(),
        this.prisma.adDailyStat.aggregate({
          where: { date: { gte: thirtyDaysAgo } },
          _sum: { spendCents: true },
        }),
        this.prisma.withdrawalRequest.count({ where: { status: 'PENDING' } }),
        this.prisma.adCampaign.count({ where: { status: 'PENDING_PLATFORM_REVIEW' } }),
        // 官网待处理赞助申请（ADMIN-REDESIGN §5.6）
        this.prisma.publicSubmission.count({
          where: { type: PublicSubmissionType.SPONSOR, status: PublicSubmissionStatus.PENDING },
        }),
      ]);

    return {
      users: { total: totalUsers, active: activeUsers, banned: bannedUsers, inMatchMode, inRelationship },
      matching: { totalMatches, pendingJobs },
      schools: totalSchools,
      // 字段名与 ads/overview 归一（原 adRevenue30dCents / gross30dCents）
      adSpend30dCents: adRevenueAgg._sum.spendCents ?? 0,
      pendingWithdrawals,
      pendingPlatformReview,
      pendingSubmissions,
    };
  }

  // ─── 后管账号管理（§8.1.3 + ADMIN-REDESIGN §4 分级权限）──────────────
  // SUPER：全量；TEAM：创建/查看广告商+学生会；学生会：创建/停启本校自拉广告商
  private isSuper(admin: AdminActor): boolean {
    return admin.role === AdminRole.SUPER || admin.isSuperAdmin;
  }

  // 统计除 targetId 外仍处于启用状态的超级管理员数量，
  // 用于防止禁用 / 降权掉最后一个 SUPER 导致后台彻底失管。
  private async countOtherActiveSuperAdmins(targetId: string): Promise<number> {
    return this.prisma.adminUser.count({
      where: {
        id: { not: targetId },
        isActive: true,
        OR: [{ role: AdminRole.SUPER }, { isSuperAdmin: true }],
      },
    });
  }

  private readonly adminSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    schoolId: true,
    school: { select: { id: true, name: true } },
    organizationName: true,
    sourcedBySchoolId: true,
    sourcedBySchool: { select: { id: true, name: true } },
    contactName: true,
    contactPhone: true,
    isActive: true,
    isSuperAdmin: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.AdminUserSelect;

  // 校验 School.id 存在（schoolId/sourcedBySchoolId 现均指向 School 表）
  private async assertSchoolExists(schoolId: string, label: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });
    if (!school) throw new BadRequestException(`${label}不存在，请先在学校管理中创建`);
  }

  async createAdminUser(actor: AdminActor, dto: CreateAdminUserDto) {
    const actorRole = actor.role;

    // 分级创建权限（ADMIN-REDESIGN §1/§4）：
    //   SUPER：任意角色；TEAM：SPONSOR/STUDENT_UNION；学生会：仅本校自拉 SPONSOR
    let role: AdminRole;
    let sourcedBySchoolId: string | null = null;

    if (this.isSuper(actor)) {
      if (!dto.role) throw new BadRequestException('必须指定角色');
      role = dto.role;
      sourcedBySchoolId = role === AdminRole.SPONSOR ? (dto.sourcedBySchoolId ?? null) : null;
    } else if (actorRole === AdminRole.TEAM) {
      if (!dto.role) throw new BadRequestException('必须指定角色');
      if (dto.role !== AdminRole.SPONSOR && dto.role !== AdminRole.STUDENT_UNION) {
        throw new ForbiddenException('团队成员只能创建广告商/学生会账号');
      }
      role = dto.role;
      // TEAM 可代学生会创建自拉广告商（显式指定来源学校）
      sourcedBySchoolId = role === AdminRole.SPONSOR ? (dto.sourcedBySchoolId ?? null) : null;
    } else if (actorRole === AdminRole.STUDENT_UNION) {
      // 学生会：强制 role=SPONSOR、来源锁定本校（忽略 dto.role / dto.sourcedBySchoolId）
      const school = this.resolveUnionSchool(actor);
      role = AdminRole.SPONSOR;
      sourcedBySchoolId = school.id;
    } else {
      throw new ForbiddenException('当前角色无权创建后管账号');
    }

    // 学生会账号必须绑定已存在的 School.id；其他角色可选携带（同样须存在，防外键违约）
    let schoolId: string | null = null;
    if (role === AdminRole.STUDENT_UNION) {
      if (!dto.schoolId) throw new BadRequestException('学生会账号必须绑定 schoolId');
      await this.assertSchoolExists(dto.schoolId, '绑定的学校');
      schoolId = dto.schoolId;
    } else if (dto.schoolId) {
      await this.assertSchoolExists(dto.schoolId, '绑定的学校');
      schoolId = dto.schoolId;
    }

    // 自拉广告商的来源学校必须存在
    if (sourcedBySchoolId) {
      await this.assertSchoolExists(sourcedBySchoolId, '来源学校');
    }

    const existing = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('该邮箱已被注册');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const admin = await this.prisma.adminUser.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role,
        schoolId,
        organizationName: dto.organizationName ?? null,
        sourcedBySchoolId,
        contactName: dto.contactName ?? null,
        contactPhone: dto.contactPhone ?? null,
        // role=SUPER 时同步 isSuperAdmin 兼容旧字段
        isSuperAdmin: role === AdminRole.SUPER,
      },
      select: this.adminSelect,
    });
    return admin;
  }

  async listAdminUsers(
    actor: AdminActor,
    params: { page?: number; limit?: number; role?: string; schoolId?: string; isActive?: string },
  ) {
    const { page = 1, limit = 20, role, schoolId, isActive } = params;
    const take = Number(limit) > 0 ? Number(limit) : 20;
    const skip = (Number(page) > 0 ? Number(page) - 1 : 0) * take;

    const where: Prisma.AdminUserWhereInput = {};
    if (role) where.role = role as AdminRole;
    if (schoolId) where.schoolId = schoolId;
    if (typeof isActive === 'string') where.isActive = isActive === 'true';

    // 角色化可见范围（ADMIN-REDESIGN §4）
    const actorRole = actor.role;
    if (this.isSuper(actor)) {
      // SUPER：全量
    } else if (actorRole === AdminRole.TEAM) {
      // 团队成员：只见广告商/学生会账号（SUPER/TEAM 账号管理为 SUPER 专属）
      const requested = role as AdminRole | undefined;
      if (requested && requested !== AdminRole.SPONSOR && requested !== AdminRole.STUDENT_UNION) {
        throw new ForbiddenException('团队成员只能查看广告商/学生会账号');
      }
      where.role = requested ?? { in: [AdminRole.SPONSOR, AdminRole.STUDENT_UNION] };
    } else if (actorRole === AdminRole.STUDENT_UNION) {
      // 学生会：只见自己来源的 SPONSOR 账号
      const school = this.resolveUnionSchool(actor);
      where.role = AdminRole.SPONSOR;
      where.sourcedBySchoolId = school.id;
      delete where.schoolId;
    } else {
      throw new ForbiddenException('当前角色无权访问账号管理');
    }

    const [admins, total] = await Promise.all([
      this.prisma.adminUser.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: this.adminSelect,
      }),
      this.prisma.adminUser.count({ where }),
    ]);

    // 统一列表形状（原 {admins,...,totalPages}）
    return { items: admins, total, page: Number(page) || 1, limit: take };
  }

  async updateAdminUser(actor: AdminActor, targetId: string, dto: UpdateAdminUserDto) {
    const target = await this.prisma.adminUser.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('后管账号不存在');

    const isSuper = this.isSuper(actor);
    const actorRole = actor.role;
    const isSelf = actor.id === targetId;

    // 学生会：仅可启用/停用本校来源的 SPONSOR 账号（其余字段一律不可改，ADMIN-REDESIGN §4）
    if (!isSuper && actorRole === AdminRole.STUDENT_UNION && !isSelf) {
      const school = this.resolveUnionSchool(actor);
      const isOwnSponsor =
        target.role === AdminRole.SPONSOR && target.sourcedBySchoolId === school.id;
      const onlyTogglesActive =
        dto.isActive !== undefined &&
        dto.name === undefined &&
        dto.password === undefined &&
        dto.role === undefined &&
        dto.schoolId === undefined &&
        dto.organizationName === undefined &&
        dto.contactName === undefined &&
        dto.contactPhone === undefined &&
        dto.sourcedBySchoolId === undefined;
      if (!isOwnSponsor || !onlyTogglesActive) {
        throw new ForbiddenException('学生会只能启用/停用本校来源的广告商账号');
      }
      return this.prisma.adminUser.update({
        where: { id: targetId },
        data: { isActive: dto.isActive },
        select: this.adminSelect,
      });
    }

    // 已禁用账号：非 SUPER 不可改自己的 name/password（防被禁用后自助改密复活）。
    // SUPER 仍可改（用于重新启用 / 重置等管理操作）。
    if (!isSuper && !target.isActive) {
      throw new ForbiddenException('该账号已被停用，无法修改');
    }

    // 权限字段（role/schoolId/sourcedBySchoolId/organizationName/isActive）仅 SUPER 可改，防提权
    const touchesPrivileged =
      dto.role !== undefined ||
      dto.schoolId !== undefined ||
      dto.sourcedBySchoolId !== undefined ||
      dto.organizationName !== undefined ||
      dto.isActive !== undefined;
    if (touchesPrivileged && !isSuper) {
      throw new ForbiddenException('仅超级管理员可修改角色/学校/启用状态');
    }
    // 非 SUPER 只能改自己的 name/password/联系方式
    if (!isSuper && !isSelf) {
      throw new ForbiddenException('无权修改其他账号');
    }

    // schoolId 现为 School.id 关系标量 → 用 Unchecked 输入直接写外键
    const data: Prisma.AdminUserUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);
    // 联系方式：本人或 SUPER 可改（广告商账户页自助维护）
    if (dto.contactName !== undefined) data.contactName = dto.contactName;
    if (dto.contactPhone !== undefined) data.contactPhone = dto.contactPhone;

    if (isSuper) {
      // 防止把最后一个超级管理员降权或禁用导致后台失管
      const targetIsSuper = target.role === AdminRole.SUPER || target.isSuperAdmin;
      const demoting = dto.role !== undefined && dto.role !== AdminRole.SUPER;
      const disabling = dto.isActive === false;
      if (targetIsSuper && target.isActive && (demoting || disabling)) {
        const others = await this.countOtherActiveSuperAdmins(targetId);
        if (others === 0) {
          throw new BadRequestException('不能停用/降权最后一个超级管理员');
        }
      }
      if (dto.role !== undefined) {
        // 改为学生会时必须有 schoolId（取新值或目标已有值）
        const nextSchoolId = dto.schoolId !== undefined ? dto.schoolId : target.schoolId;
        if (dto.role === AdminRole.STUDENT_UNION && !nextSchoolId) {
          throw new BadRequestException('学生会账号必须绑定学校');
        }
        data.role = dto.role;
        // 同步 isSuperAdmin 兼容字段
        data.isSuperAdmin = dto.role === AdminRole.SUPER;
      }
      if (dto.schoolId !== undefined) {
        // 绑定学校前校验 School.id 存在
        if (dto.schoolId) await this.assertSchoolExists(dto.schoolId, '绑定的学校');
        data.schoolId = dto.schoolId || null;
      }
      if (dto.sourcedBySchoolId !== undefined) {
        if (dto.sourcedBySchoolId) await this.assertSchoolExists(dto.sourcedBySchoolId, '来源学校');
        data.sourcedBySchoolId = dto.sourcedBySchoolId || null;
      }
      if (dto.organizationName !== undefined) data.organizationName = dto.organizationName;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
    }

    const updated = await this.prisma.adminUser.update({
      where: { id: targetId },
      data,
      select: this.adminSelect,
    });
    return updated;
  }

  async deleteAdminUser(actor: AdminActor, targetId: string) {
    if (!this.isSuper(actor)) {
      throw new ForbiddenException('仅超级管理员可停用后管账号');
    }
    if (actor.id === targetId) {
      throw new BadRequestException('不能停用自己的账号');
    }
    const target = await this.prisma.adminUser.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('后管账号不存在');

    // 不允许禁用最后一个超级管理员
    const targetIsSuper = target.role === AdminRole.SUPER || target.isSuperAdmin;
    if (targetIsSuper && target.isActive) {
      const others = await this.countOtherActiveSuperAdmins(targetId);
      if (others === 0) {
        throw new BadRequestException('不能停用/降权最后一个超级管理员');
      }
    }

    // 软删除：isActive=false（登录时拦截）
    const updated = await this.prisma.adminUser.update({
      where: { id: targetId },
      data: { isActive: false },
      select: this.adminSelect,
    });
    return updated;
  }

  // ─── 用户反馈举报队列（Report 表，SUPER/TEAM，§5.5）───────────
  async listReports(params: { status?: string; page?: number; limit?: number }) {
    const page = Number(params.page) > 0 ? Number(params.page) : 1;
    const limit = Number(params.limit) > 0 ? Number(params.limit) : 20;

    const where: Prisma.ReportWhereInput = {};
    if (params.status) where.status = params.status;

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { email: true, profile: { select: { nickname: true } } },
          },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // open → resolved（幂等：重复置同一状态直接生效）
  async updateReportStatus(id: string, status: 'open' | 'resolved') {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('举报记录不存在');
    return this.prisma.report.update({ where: { id }, data: { status } });
  }

  // ─── 官网提交联动（PublicSubmission，ADMIN-REDESIGN §5.6，SUPER/TEAM）──
  // 列表：newest first；search 模糊匹配 email/organization；
  // convertedAdmin 与 PublicSubmission 无外键关系 → 手动二次查询拼装
  async listSubmissions(params: {
    type?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(params.page) > 0 ? Number(params.page) : 1;
    const limit = Number(params.limit) > 0 ? Number(params.limit) : 20;

    const where: Prisma.PublicSubmissionWhereInput = {};
    if (params.type) {
      if (!Object.values(PublicSubmissionType).includes(params.type as PublicSubmissionType)) {
        throw new BadRequestException('type 参数无效（WAITLIST / SPONSOR）');
      }
      where.type = params.type as PublicSubmissionType;
    }
    if (params.status) {
      if (
        !Object.values(PublicSubmissionStatus).includes(params.status as PublicSubmissionStatus)
      ) {
        throw new BadRequestException('status 参数无效（PENDING / CONTACTED / APPROVED / REJECTED）');
      }
      where.status = params.status as PublicSubmissionStatus;
    }
    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: 'insensitive' } },
        { organization: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.publicSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.publicSubmission.count({ where }),
    ]);

    const convertedIds = [
      ...new Set(rows.map((r) => r.convertedAdminId).filter((v): v is string => !!v)),
    ];
    const convertedAdmins = convertedIds.length
      ? await this.prisma.adminUser.findMany({
          where: { id: { in: convertedIds } },
          select: { id: true, name: true, role: true, isActive: true },
        })
      : [];
    const adminById = new Map(convertedAdmins.map((a) => [a.id, a]));

    const items = rows.map((r) => ({
      ...r,
      convertedAdmin: (r.convertedAdminId && adminById.get(r.convertedAdminId)) || null,
    }));

    return { items, total, page, limit };
  }

  // 状态流转（CONTACTED / REJECTED / 回 PENDING）：记处理人与时间；
  // note 缺省 → 保留原备注，传值 → 覆盖。APPROVED 已被 DTO 层拒绝（只能经 convert）。
  async updateSubmission(actor: AdminActor, id: string, dto: UpdateSubmissionDto) {
    const submission = await this.prisma.publicSubmission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundException('提交记录不存在');

    return this.prisma.publicSubmission.update({
      where: { id },
      data: {
        status: dto.status,
        handledByAdminId: actor.id,
        handledAt: new Date(),
        ...(dto.note !== undefined ? { handleNote: dto.note } : {}),
      },
    });
  }

  // 一键开通后台账号：事务内（可选建校 →）建 AdminUser → 提交记录置 APPROVED。
  // 校验规则与 createAdminUser 同源（School.id 必须存在 / 学校名唯一 / bcrypt 12）。
  async convertSubmission(actor: AdminActor, id: string, dto: ConvertSubmissionDto) {
    const submission = await this.prisma.publicSubmission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundException('提交记录不存在');
    if (submission.status === PublicSubmissionStatus.APPROVED) {
      throw new BadRequestException('该申请已开通过账号');
    }

    const accountRole =
      dto.accountRole === 'STUDENT_UNION' ? AdminRole.STUDENT_UNION : AdminRole.SPONSOR;

    // 空串一律按缺省处理（前端表单可能提交 ''）
    const schoolId = dto.schoolId?.trim() || undefined;
    const newSchoolName = dto.newSchoolName?.trim() || undefined;
    const organizationName = dto.organizationName?.trim() || undefined;

    let sourcedBySchoolId: string | null = null;
    if (accountRole === AdminRole.STUDENT_UNION) {
      // 现有学校 / 新建学校 二选一
      if (!!schoolId === !!newSchoolName) {
        throw new BadRequestException('学生会账号需在「现有学校 / 新建学校」中二选一');
      }
      if (schoolId) await this.assertSchoolExists(schoolId, '绑定的学校');
      if (newSchoolName) {
        const dup = await this.prisma.school.findUnique({ where: { name: newSchoolName } });
        if (dup) throw new BadRequestException('该学校名已存在');
      }
    } else {
      if (!organizationName) throw new BadRequestException('广告商账号必须填写组织名');
      if (schoolId) {
        await this.assertSchoolExists(schoolId, '来源学校');
        sourcedBySchoolId = schoolId;
      }
    }

    // 登录邮箱：缺省用申请邮箱；与现有后管账号冲突则拒绝
    const email = dto.email ?? submission.email;
    const existing = await this.prisma.adminUser.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('该邮箱已有后台账号，请换一个登录邮箱');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      // 新建学校用 schema 默认分成（platform 1000 / selfSourced 3000 bps）
      let school: { id: string; name: string } | null = null;
      if (accountRole === AdminRole.STUDENT_UNION) {
        school = newSchoolName
          ? await tx.school.create({
              data: { name: newSchoolName, city: dto.newSchoolCity?.trim() || null },
              select: { id: true, name: true },
            })
          : await tx.school.findUniqueOrThrow({
              where: { id: schoolId! },
              select: { id: true, name: true },
            });
      } else if (sourcedBySchoolId) {
        school = await tx.school.findUniqueOrThrow({
          where: { id: sourcedBySchoolId },
          select: { id: true, name: true },
        });
      }

      const created = await tx.adminUser.create({
        data: {
          email,
          passwordHash,
          name: dto.name,
          role: accountRole,
          schoolId: accountRole === AdminRole.STUDENT_UNION ? school!.id : null,
          organizationName: accountRole === AdminRole.SPONSOR ? organizationName! : null,
          sourcedBySchoolId,
          contactName: dto.contactName?.trim() || null,
          contactPhone: dto.contactPhone?.trim() || null,
          isActive: true,
          isSuperAdmin: false,
        },
        select: { id: true, email: true, name: true, role: true, schoolId: true, organizationName: true },
      });

      await tx.publicSubmission.update({
        where: { id },
        data: {
          status: PublicSubmissionStatus.APPROVED,
          convertedAdminId: created.id,
          handledByAdminId: actor.id,
          handledAt: new Date(),
        },
      });

      return { admin: created, school };
    });

    // initialPassword 仅此响应一次性回显（前端凭据卡），不落库明文
    return { ...result, initialPassword: dto.password };
  }

  // ─── System Config ─────────────────────────────────────────
  async updateSystemConfig(key: string, value: unknown) {
    // 有专用写入口的配置键给出定向提示（计价 defaults / 分成 share-defaults）
    if (REDIRECTED_CONFIG_KEYS.includes(key)) {
      throw new BadRequestException('该配置有专用管理接口（广告计价/分成默认值），请在系统设置对应表单修改');
    }
    if (!CONFIG_KEY_ALLOWLIST.includes(key)) {
      throw new BadRequestException('不支持的配置项');
    }
    return this.prisma.systemConfig.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue },
      create: { key, value: value as Prisma.InputJsonValue },
    });
  }

  async getAllConfigs() {
    return { items: await this.prisma.systemConfig.findMany({ orderBy: { key: 'asc' } }) };
  }
}
