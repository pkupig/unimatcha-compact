import { Module } from '@nestjs/common';
import { SponsorInviteService } from './sponsor-invite.service';
import { SponsorInviteAdminController } from './sponsor-invite-admin.controller';
import { AdminCoreModule } from '../admin-core/admin-core.module';

/**
 * 学生会邀请码 + 商家公开自注册（B5）。
 * 公开端点（invite-info / register-sponsor）挂在 auth 模块的 AdminAuthController 上，
 * 故 export SponsorInviteService 供 AuthModule 注入（PrismaModule 为 @Global 无需引入）。
 */
@Module({
  imports: [AdminCoreModule],
  controllers: [SponsorInviteAdminController],
  providers: [SponsorInviteService],
  exports: [SponsorInviteService],
})
export class SponsorInviteModule {}
