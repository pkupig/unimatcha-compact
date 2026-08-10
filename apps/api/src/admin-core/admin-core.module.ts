import { Module } from '@nestjs/common';
import { AdminScopeService } from './admin-scope.service';

/**
 * 管理端共享基建：身份解析 + 范围校验（PrismaModule 为 @Global，无需显式引入）。
 * 由 auth 及各领域模块（admin/users/square/events/ads/finance/schools）引入。
 */
@Module({
  providers: [AdminScopeService],
  exports: [AdminScopeService],
})
export class AdminCoreModule {}
