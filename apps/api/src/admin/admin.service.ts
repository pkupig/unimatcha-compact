import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SquareService } from '../square/square.service';
import { CreateOfficialPostDto } from '../square/dto/square.dto';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-user.dto';

// 当前登录后管（来自 admin-jwt 策略写入的 req.user）
type CurrentAdmin = {
  id: string;
  role: AdminRole | null;
  isSuperAdmin: boolean;
  schoolId?: string | null;
};

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private squareService: SquareService,
  ) {}

  // ─── 角色/范围工具（ADMIN-REDESIGN §1）──────────────────────
  // role 为权威；isSuperAdmin 仅向下兼容旧账号
  private effectiveRole(admin: CurrentAdmin): AdminRole | null {
    return admin.role ?? (admin.isSuperAdmin ? AdminRole.SUPER : null);
  }

  // 学生会 scope：解析本校 School（admin.schoolId 现为 School.id）
  private async resolveUnionSchool(actor: CurrentAdmin): Promise<{ id: string; name: string }> {
    if (!actor.schoolId) {
      throw new BadRequestException('学生会账号未绑定学校');
    }
    const school = await this.prisma.school.findUnique({
      where: { id: actor.schoolId },
      select: { id: true, name: true },
    });
    if (!school) throw new NotFoundException('学生会绑定的学校不存在');
    return school;
  }

  // 学校余额（ADMIN-REDESIGN §2）：
  // balance = Σ ledger.amountCents − Σ (PENDING/APPROVED 提现金额，冻结在途)
  private async getSchoolBalanceCents(schoolId: string): Promise<number> {
    const [ledger, frozen] = await Promise.all([
      this.prisma.schoolLedgerEntry.aggregate({
        where: { schoolId },
        _sum: { amountCents: true },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where: { schoolId, status: { in: ['PENDING', 'APPROVED'] } },
        _sum: { amountCents: true },
      }),
    ]);
    return (ledger._sum.amountCents ?? 0) - (frozen._sum.amountCents ?? 0);
  }

  // 用户管理 scope 校验（ADMIN-REDESIGN §4）：
  // SPONSOR 一律 403；学生会仅可操作本校用户（profile.school == School.name）
  private async assertUserScope(actor: CurrentAdmin, userId: string) {
    const role = this.effectiveRole(actor);
    if (role === AdminRole.SPONSOR) {
      throw new ForbiddenException('商家账号无权访问用户管理');
    }
    if (role !== AdminRole.STUDENT_UNION) return;
    const school = await this.resolveUnionSchool(actor);
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { school: true },
    });
    if (!profile || profile.school !== school.name) {
      throw new ForbiddenException('学生会只能操作本校用户');
    }
  }

  // ─── 仪表盘（角色化 payload，ADMIN-REDESIGN §4）──────────────
  async getDashboardStats(actor: CurrentAdmin) {
    const role = this.effectiveRole(actor);

    // 学生会：本校用户 / 余额 / 待审广告
    if (role === AdminRole.STUDENT_UNION) {
      const school = await this.resolveUnionSchool(actor);
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const [total, newThisWeek, balanceCents, pendingUnionReview, activeCampaignsInSchool] =
        await Promise.all([
          this.prisma.user.count({ where: { profile: { school: school.name } } }),
          this.prisma.user.count({
            where: { createdAt: { gte: weekAgo }, profile: { school: school.name } },
          }),
          this.getSchoolBalanceCents(school.id),
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
        balanceCents,
        pendingUnionReview,
        activeCampaignsInSchool,
      };
    }

    // 商家：自己的投放汇总
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
    const [totalSchools, adRevenueAgg, pendingWithdrawals, pendingPlatformReview] =
      await Promise.all([
        this.prisma.school.count(),
        this.prisma.adDailyStat.aggregate({
          where: { date: { gte: thirtyDaysAgo } },
          _sum: { spendCents: true },
        }),
        this.prisma.withdrawalRequest.count({ where: { status: 'PENDING' } }),
        this.prisma.adCampaign.count({ where: { status: 'PENDING_PLATFORM_REVIEW' } }),
      ]);

    return {
      users: { total: totalUsers, active: activeUsers, banned: bannedUsers, inMatchMode, inRelationship },
      matching: { totalMatches, pendingJobs },
      schools: totalSchools,
      adRevenue30dCents: adRevenueAgg._sum.spendCents ?? 0,
      pendingWithdrawals,
      pendingPlatformReview,
    };
  }

  async listUsers(
    actor: CurrentAdmin,
    params: { page?: number; limit?: number; search?: string; status?: string },
  ) {
    const role = this.effectiveRole(actor);
    if (role === AdminRole.SPONSOR) {
      throw new ForbiddenException('商家账号无权访问用户管理');
    }
    // 学生会：强制过滤 profile.school == 本校 School.name（ADMIN-REDESIGN §4）
    if (role === AdminRole.STUDENT_UNION) {
      const school = await this.resolveUnionSchool(actor);
      return this.usersService.findAll({ ...params, school: school.name });
    }
    return this.usersService.findAll(params);
  }

  async getUserDetail(actor: CurrentAdmin, userId: string) {
    await this.assertUserScope(actor, userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        // 双模式：每模式状态迁入 UserModeState
        modeStates: {
          select: { mode: true, matchState: true, matchSearchingSince: true, weeklyMatchNote: true },
        },
        answers: {
          include: {
            question: { select: { title: true, type: true } },
            questionnaireVersion: { select: { version: true, title: true } },
          },
          orderBy: { submittedAt: 'desc' },
          take: 50,
        },
        matchesAsUserA: {
          include: {
            userB: { select: { email: true, profile: { select: { nickname: true } } } },
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        matchesAsUserB: {
          include: {
            userA: { select: { email: true, profile: { select: { nickname: true } } } },
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUserStatus(actor: CurrentAdmin, userId: string, status: 'ACTIVE' | 'BANNED') {
    await this.assertUserScope(actor, userId);
    return this.usersService.updateStatus(userId, status);
  }

  async resetUserMode(actor: CurrentAdmin, userId: string) {
    await this.assertUserScope(actor, userId);
    return this.usersService.resetUserMode(userId);
  }

  async updateUserVerification(
    actor: CurrentAdmin,
    userId: string,
    status: 'unverified' | 'pending' | 'verified' | 'rejected',
  ) {
    await this.assertUserScope(actor, userId);
    return this.usersService.updateVerificationStatus(userId, status);
  }

  // ─── 后管账号管理（§8.1.3 + ADMIN-REDESIGN §4 分级权限）──────────────
  // SUPER：全量；TEAM：创建/查看商家+学生会；学生会：创建/停启本校自拉商家
  private isSuper(admin: CurrentAdmin): boolean {
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

  async createAdminUser(actor: CurrentAdmin, dto: CreateAdminUserDto) {
    const actorRole = this.effectiveRole(actor);

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
        throw new ForbiddenException('团队成员只能创建商家/学生会账号');
      }
      role = dto.role;
      // TEAM 可代学生会创建自拉商家（显式指定来源学校）
      sourcedBySchoolId = role === AdminRole.SPONSOR ? (dto.sourcedBySchoolId ?? null) : null;
    } else if (actorRole === AdminRole.STUDENT_UNION) {
      // 学生会：强制 role=SPONSOR、来源锁定本校（忽略 dto.role / dto.sourcedBySchoolId）
      const school = await this.resolveUnionSchool(actor);
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

    // 自拉商家的来源学校必须存在
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
    actor: CurrentAdmin,
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
    const actorRole = this.effectiveRole(actor);
    if (this.isSuper(actor)) {
      // SUPER：全量
    } else if (actorRole === AdminRole.TEAM) {
      // 团队成员：只见商家/学生会账号（SUPER/TEAM 账号管理为 SUPER 专属）
      const requested = role as AdminRole | undefined;
      if (requested && requested !== AdminRole.SPONSOR && requested !== AdminRole.STUDENT_UNION) {
        throw new ForbiddenException('团队成员只能查看商家/学生会账号');
      }
      where.role = requested ?? { in: [AdminRole.SPONSOR, AdminRole.STUDENT_UNION] };
    } else if (actorRole === AdminRole.STUDENT_UNION) {
      // 学生会：只见自己来源的 SPONSOR 账号
      const school = await this.resolveUnionSchool(actor);
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

    return { admins, total, page: Number(page) || 1, limit: take, totalPages: Math.ceil(total / take) };
  }

  async updateAdminUser(actor: CurrentAdmin, targetId: string, dto: UpdateAdminUserDto) {
    const target = await this.prisma.adminUser.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('Admin account not found');

    const isSuper = this.isSuper(actor);
    const actorRole = this.effectiveRole(actor);
    const isSelf = actor.id === targetId;

    // 学生会：仅可启用/停用本校来源的 SPONSOR 账号（其余字段一律不可改，ADMIN-REDESIGN §4）
    if (!isSuper && actorRole === AdminRole.STUDENT_UNION && !isSelf) {
      const school = await this.resolveUnionSchool(actor);
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
        throw new ForbiddenException('学生会只能启用/停用本校来源的商家账号');
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
      throw new ForbiddenException('This account has been disabled and cannot be modified');
    }

    // 权限字段（role/schoolId/sourcedBySchoolId/organizationName/isActive）仅 SUPER 可改，防提权
    const touchesPrivileged =
      dto.role !== undefined ||
      dto.schoolId !== undefined ||
      dto.sourcedBySchoolId !== undefined ||
      dto.organizationName !== undefined ||
      dto.isActive !== undefined;
    if (touchesPrivileged && !isSuper) {
      throw new ForbiddenException('Only super admins can modify role/school/active status');
    }
    // 非 SUPER 只能改自己的 name/password/联系方式
    if (!isSuper && !isSelf) {
      throw new ForbiddenException('Not authorized to modify other accounts');
    }

    // schoolId 现为 School.id 关系标量 → 用 Unchecked 输入直接写外键
    const data: Prisma.AdminUserUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);
    // 联系方式：本人或 SUPER 可改（商家账户页自助维护）
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
          throw new BadRequestException('Cannot disable/demote the last super admin');
        }
      }
      if (dto.role !== undefined) {
        // 改为学生会时必须有 schoolId（取新值或目标已有值）
        const nextSchoolId = dto.schoolId !== undefined ? dto.schoolId : target.schoolId;
        if (dto.role === AdminRole.STUDENT_UNION && !nextSchoolId) {
          throw new BadRequestException('Student union accounts must be bound to a schoolId');
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

  async deleteAdminUser(actor: CurrentAdmin, targetId: string) {
    if (!this.isSuper(actor)) {
      throw new ForbiddenException('Only super admins can disable admin accounts');
    }
    if (actor.id === targetId) {
      throw new BadRequestException('Cannot disable your own account');
    }
    const target = await this.prisma.adminUser.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('Admin account not found');

    // 不允许禁用最后一个超级管理员
    const targetIsSuper = target.role === AdminRole.SUPER || target.isSuperAdmin;
    if (targetIsSuper && target.isActive) {
      const others = await this.countOtherActiveSuperAdmins(targetId);
      if (others === 0) {
        throw new BadRequestException('Cannot disable/demote the last super admin');
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

  // 发帖权限范围（§8.1.3）：委托 SquareService（其内联读 AdminUser）
  async getAdminScope(adminId: string) {
    return this.squareService.getAdminScope(adminId);
  }

  // ─── 官方发帖 / 后管下架（§8.1.3，委托 SquareService 按 scope 校验 school） ─────
  async createOfficialPost(adminId: string, dto: CreateOfficialPostDto) {
    return this.squareService.createOfficialPost(adminId, dto);
  }

  async adminDeletePost(adminId: string, postId: string, reason?: string) {
    return this.squareService.adminDeletePost(adminId, postId, reason);
  }

  // ─── 广场管理与举报处理（ADMIN-REDESIGN §5.5）─────────────────
  // 帖子列表：学生会强制本校；reported=true 过滤被举报帖（含举报自动隐藏）
  async listSquarePosts(
    actor: CurrentAdmin,
    params: {
      board?: string;
      school?: string;
      status?: string;
      reported?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.squareService.adminListPosts(actor, params);
  }

  async adminRestorePost(adminId: string, postId: string) {
    return this.squareService.adminRestorePost(adminId, postId);
  }

  async adminDismissReports(adminId: string, postId: string) {
    return this.squareService.adminDismissReports(adminId, postId);
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

  // ─── System Config ─────────────────────────────────────────
  async getSystemConfig(key: string) {
    return this.prisma.systemConfig.findUnique({ where: { key } });
  }

  async updateSystemConfig(key: string, value: any) {
    return this.prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async getAllConfigs() {
    return this.prisma.systemConfig.findMany();
  }
}
