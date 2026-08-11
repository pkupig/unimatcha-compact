import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, AdminUser, Prisma, SponsorInviteCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AdminScopeService } from '../admin-core/admin-scope.service';
import { AdminActor } from '../admin-core/admin-actor';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { paginated, skipTake } from '../common/utils/pagination';
import {
  CreateInviteDto,
  ListInvitesQueryDto,
  RegisterSponsorDto,
  ToggleInviteDto,
} from './dto/sponsor-invite.dto';

/** 邀请码预校验结果（注册页展示用；恒正常返回，不抛错） */
export interface InviteInfo {
  valid: boolean;
  schoolName?: string;
  reason?: 'NOT_FOUND' | 'DISABLED' | 'EXPIRED' | 'EXHAUSTED';
}

/**
 * 学生会邀请码 + 商家公开自注册（B5）。
 *   学生会：生成/停用本校邀请码、查看经码注册的商家；
 *   平台侧（SUPER/TEAM）：全量查看，SUPER 可停用任意码；
 *   商家：拿码在 /admin/auth/register-sponsor 自注册（sourcedBySchoolId 恒为邀请学校）。
 */
@Injectable()
export class SponsorInviteService {
  constructor(
    private prisma: PrismaService,
    private adminScope: AdminScopeService,
  ) {}

  // ── 后管侧（/admin/sponsor-invites）──────────────────────────

  /** 创建邀请码：schoolId 恒为当前学生会绑定学校，不接受入参 */
  async createInvite(actor: AdminActor, dto: CreateInviteDto) {
    const school = this.adminScope.requireUnionSchool(actor);

    // 码撞车概率极低（31^12 空间），但仍捕获 P2002 唯一冲突重试 ≤3 次
    const MAX_RETRY = 3;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.sponsorInviteCode.create({
          data: {
            code: this.generateInviteCode(),
            schoolId: school.id,
            createdByAdminId: actor.id,
            note: dto.note ?? null,
            maxUses: dto.maxUses ?? null,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          },
          include: { school: { select: { id: true, name: true } } },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          attempt < MAX_RETRY
        ) {
          continue;
        }
        throw e;
      }
    }
  }

  /** 邀请码列表：学生会强制本校（忽略 schoolId 参数）；平台侧可按校筛 */
  async listInvites(actor: AdminActor, q: ListInvitesQueryDto) {
    const where: Prisma.SponsorInviteCodeWhereInput = {};
    if (actor.role === AdminRole.STUDENT_UNION) {
      where.schoolId = this.adminScope.requireUnionSchool(actor).id;
    } else if (q.schoolId) {
      where.schoolId = q.schoolId;
    }
    if (q.isActive === 'true' || q.isActive === 'false') {
      where.isActive = q.isActive === 'true';
    }

    const [rows, total] = await Promise.all([
      this.prisma.sponsorInviteCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: { school: { select: { id: true, name: true } } },
      }),
      this.prisma.sponsorInviteCode.count({ where }),
    ]);

    // createdByAdmin 无外键 → 手动二查拼装（同 admin.service listSubmissions 的 convertedAdmin）
    const creatorIds = [...new Set(rows.map((r) => r.createdByAdminId))];
    const creators = creatorIds.length
      ? await this.prisma.adminUser.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        })
      : [];
    const creatorById = new Map(creators.map((a) => [a.id, a]));

    const items = rows.map((r) => ({
      ...r,
      createdByAdmin: creatorById.get(r.createdByAdminId) ?? null,
    }));
    return paginated(items, total, q);
  }

  /** 启用/停用：学生会仅本校码，SUPER 任意 */
  async toggleInvite(actor: AdminActor, id: string, dto: ToggleInviteDto) {
    await this.getScopedInvite(actor, id);
    return this.prisma.sponsorInviteCode.update({
      where: { id },
      data: { isActive: dto.isActive },
      include: { school: { select: { id: true, name: true } } },
    });
  }

  /** 某码的注册记录（经该码自注册的商家账号，分页；范围校验同 toggle） */
  async listInviteUses(actor: AdminActor, id: string, q: ListQueryDto) {
    await this.getScopedInvite(actor, id);

    const where: Prisma.AdminUserWhereInput = { invitedByCodeId: id };
    const [items, total] = await Promise.all([
      this.prisma.adminUser.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        select: {
          id: true,
          email: true,
          name: true,
          organizationName: true,
          contactName: true,
          isActive: true,
          createdAt: true,
        },
      }),
      this.prisma.adminUser.count({ where }),
    ]);
    return paginated(items, total, q);
  }

  // ── 公开侧（经 /admin/auth 暴露）────────────────────────────

  /** 注册页预校验：恒正常返回不抛错；学校停用视同码停用 */
  async getInviteInfo(code: string): Promise<InviteInfo> {
    const invite = code
      ? await this.prisma.sponsorInviteCode.findUnique({
          where: { code },
          include: { school: { select: { name: true, isActive: true } } },
        })
      : null;
    if (!invite) return { valid: false, reason: 'NOT_FOUND' };
    if (!invite.isActive || !invite.school.isActive) return { valid: false, reason: 'DISABLED' };
    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
      return { valid: false, reason: 'EXPIRED' };
    }
    if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
      return { valid: false, reason: 'EXHAUSTED' };
    }
    return { valid: true, schoolName: invite.school.name };
  }

  /**
   * 商家经码自注册：校验码 → 邮箱预检 → 事务内乐观锁自增 usedCount + 建号。
   * 返回完整 AdminUser 行（供 AdminAuthService.issueFor 注册即登录）。
   */
  async registerViaCode(dto: RegisterSponsorDto): Promise<AdminUser> {
    // ① 查码逐项校验（错误消息区分原因，注册页可直接展示）
    const invite = await this.prisma.sponsorInviteCode.findUnique({
      where: { code: dto.code },
      include: { school: { select: { id: true, isActive: true } } },
    });
    if (!invite) throw new BadRequestException('邀请码无效');
    if (!invite.isActive || !invite.school.isActive) {
      throw new BadRequestException('该邀请码已停用');
    }
    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('该邀请码已过期');
    }
    if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
      throw new BadRequestException('该邀请码使用次数已达上限');
    }

    // ② 邮箱冲突预检（快路径友好报错；email 唯一约束仍兜底并发）
    const existing = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('该邮箱已被注册');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // ③ 事务：等值乐观锁防超发——usedCount 仍为读到的旧值才允许自增，
    //    并发注册/中途停用会使影响行数为 0 → 整个事务回滚。
    //    邮箱预检到建号之间的并发窗口由 email 唯一约束兜底（P2002 转中文 400，复查 ISSUE-5）
    return this.prisma.$transaction(async (tx) => {
      const bumped = await tx.sponsorInviteCode.updateMany({
        where: { id: invite.id, isActive: true, usedCount: invite.usedCount },
        data: { usedCount: { increment: 1 } },
      });
      if (bumped.count === 0) {
        throw new BadRequestException('邀请码状态已变化，请重试');
      }

      return tx.adminUser.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.organizationName, // 后台展示名默认取组织名
          role: AdminRole.SPONSOR, // 自注册恒为商家
          organizationName: dto.organizationName,
          sourcedBySchoolId: invite.schoolId, // 恒记邀请学校（自拉分成档位判定）
          invitedByCodeId: invite.id,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone ?? null,
          isActive: true,
          isSuperAdmin: false,
        },
      });
    }).catch((e) => {
      // 并发同邮箱穿过预检：email 唯一约束触发 P2002（usedCount 增量随事务回滚，无超发）
      if (e?.code === 'P2002') {
        throw new BadRequestException('该邮箱已被注册');
      }
      throw e;
    });
  }

  // ── 私有 ────────────────────────────────────────────────

  /** 按 id 取码并做归属校验：学生会仅本校，SUPER/TEAM 放行 */
  private async getScopedInvite(actor: AdminActor, id: string): Promise<SponsorInviteCode> {
    const invite = await this.prisma.sponsorInviteCode.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException('邀请码不存在');
    if (actor.role === AdminRole.STUDENT_UNION) {
      const school = this.adminScope.requireUnionSchool(actor);
      if (invite.schoolId !== school.id) {
        throw new ForbiddenException('仅可管理本校邀请码');
      }
    }
    return invite;
  }

  private generateInviteCode(): string {
    // INV-XXXXXXXXXXXX（大写 base32 风格，去易混淆字符；同 events 票码手法）
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(12);
    let s = '';
    for (let i = 0; i < 12; i++) s += alphabet[bytes[i] % alphabet.length];
    return `INV-${s}`;
  }
}
