import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminActor } from './admin-actor';

/**
 * 取当前管理员（AdminJwtStrategy 已把 resolveActor 结果写入 req.user）。
 * 刻意不提供取单字段的变体——只传 id 会迫使服务层重查 AdminUser，正是旧代码的病根。
 */
export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminActor =>
    ctx.switchToHttp().getRequest().user,
);
