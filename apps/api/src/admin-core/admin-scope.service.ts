import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActor, AdminUserLike } from './admin-actor';

const ACTOR_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  schoolId: true,
  organizationName: true,
  sourcedBySchoolId: true,
  contactName: true,
  contactPhone: true,
  isActive: true,
  isSuperAdmin: true,
} as const;

/**
 * 管理端身份解析与范围校验的唯一实现（取代散落在 admin/finance/schools/ads/square/events
 * 的 7 套独立范围校验）。两条旧数据兜底只允许存在于此：
 *   ① role ?? (isSuperAdmin ? SUPER : null) —— 旧超管行 role 为空；
 *   ② schoolId 按 id 查不到 School 时按 name 再查一次 —— 旧数据 schoolId 存的是校名。
 */
@Injectable()
export class AdminScopeService {
  constructor(private prisma: PrismaService) {}

  /**
   * 加载 + 归一化。传 id 时查一次 AdminUser；传预加载行时零查询。
   * 不校验 isActive（JWT 策略负责 401；账号管理需要能操作已停用行）。
   */
  async resolveActor(adminOrId: string | AdminUserLike): Promise<AdminActor> {
    const row =
      typeof adminOrId === 'string'
        ? await this.prisma.adminUser.findUnique({
            where: { id: adminOrId },
            select: ACTOR_SELECT,
          })
        : adminOrId;
    if (!row) throw new NotFoundException('管理员账号不存在');

    const role = row.role ?? (row.isSuperAdmin ? AdminRole.SUPER : null);

    let schoolId = row.schoolId ?? null;
    let schoolName: string | null = null;
    if (schoolId) {
      const byId = await this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true, name: true },
      });
      if (byId) {
        schoolName = byId.name;
      } else {
        const byName = await this.prisma.school.findUnique({
          where: { name: schoolId },
          select: { id: true, name: true },
        });
        if (byName) {
          schoolId = byName.id;
          schoolName = byName.name;
        } else {
          // School 行彻底缺失：原始值当名字用，名字空间比对维持旧行为，id 空间比对自然失配
          schoolName = row.schoolId;
        }
      }
    }

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role,
      schoolId,
      schoolName,
      sourcedBySchoolId: row.sourcedBySchoolId ?? null,
      organizationName: row.organizationName ?? null,
      contactName: row.contactName ?? null,
      contactPhone: row.contactPhone ?? null,
      isActive: row.isActive,
      isSuperAdmin: row.isSuperAdmin,
    };
  }

  isSuper(actor: AdminActor): boolean {
    return actor.role === AdminRole.SUPER;
  }

  /** 平台侧（SUPER 或 TEAM） */
  isPlatform(actor: AdminActor): boolean {
    return actor.role === AdminRole.SUPER || actor.role === AdminRole.TEAM;
  }

  assertRole(actor: AdminActor, ...roles: AdminRole[]): void {
    if (!actor.role || !roles.includes(actor.role)) {
      throw new ForbiddenException('当前角色无权访问该功能');
    }
  }

  /** 学生会专用：返回绑定学校（id + 解析后的名字）；未绑定则拒绝 */
  requireUnionSchool(actor: AdminActor): { id: string; name: string } {
    if (actor.role !== AdminRole.STUDENT_UNION) {
      throw new ForbiddenException('当前角色无权访问该功能');
    }
    if (!actor.schoolId || !actor.schoolName) {
      throw new BadRequestException('学生会账号未绑定学校');
    }
    return { id: actor.schoolId, name: actor.schoolName };
  }

  /** id 空间范围校验：SUPER/TEAM 放行；学生会仅本校（替代 finance/schools 的 assertUnionScope） */
  assertSchoolIdInScope(actor: AdminActor, schoolId: string): void {
    if (actor.role !== AdminRole.STUDENT_UNION) return;
    if (!actor.schoolId) throw new BadRequestException('学生会账号未绑定学校');
    if (actor.schoolId !== schoolId) {
      throw new ForbiddenException('学生会只能访问本校数据');
    }
  }

  /** 名字空间范围校验：比对 Profile.school / SquarePost.school / Event.school 等校名字符串 */
  assertSchoolNameInScope(actor: AdminActor, name: string | null | undefined): void {
    if (actor.role !== AdminRole.STUDENT_UNION) return;
    if (!actor.schoolName) throw new BadRequestException('学生会账号未绑定学校');
    if (!name || name !== actor.schoolName) {
      throw new ForbiddenException('仅可管理本校内容');
    }
  }

  /** 官方发帖资格：启用中的 TEAM / STUDENT_UNION / SPONSOR（SUPER 不直接发帖，与现行为一致） */
  canPublishOfficial(actor: AdminActor): boolean {
    return (
      actor.isActive &&
      (actor.role === AdminRole.TEAM ||
        actor.role === AdminRole.STUDENT_UNION ||
        actor.role === AdminRole.SPONSOR)
    );
  }
}
