import { Module } from '@nestjs/common';
import { SponsorWalletAdminController } from './sponsor-wallet-admin.controller';
import { SponsorWalletService } from './sponsor-wallet.service';

// PrismaModule 全局注册无需 import；@CurrentAdmin 只读 req.user，不依赖 AdminCoreModule
@Module({
  controllers: [SponsorWalletAdminController],
  providers: [SponsorWalletService],
  exports: [SponsorWalletService],
})
export class SponsorWalletModule {}
