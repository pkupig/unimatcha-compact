import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * 与 AdminJwtAuthGuard 组合使用（须排在其后）：
 *   @UseGuards(AdminJwtAuthGuard, RolesGuard)
 *   @Roles('SUPER', 'TEAM')
 * 未标注 @Roles 的路由放行（仅要求已登录 admin）；
 * 范围校验（学生会仅本校、商家仅自身）在服务层做。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    // 归一化旧超管（role 空但 isSuperAdmin=true）——与服务层口径一致；
    // admin-jwt 策略已做过归一化，此处为防御性兜底
    const role = user?.role ?? (user?.isSuperAdmin ? AdminRole.SUPER : null);
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('当前角色无权访问该功能');
    }
    return true;
  }
}
