import { Module } from '@nestjs/common';
import { AdsAdminController } from './ads-admin.controller';
import { AdsPublicController } from './ads-public.controller';
import { AdsService } from './ads.service';
import { AdsScheduler } from './ads.scheduler';
import { SponsorWalletModule } from '../sponsor-wallet/sponsor-wallet.module';

// 分成入账直接经 Prisma 写 SchoolLedgerEntry（settleCampaign），无需依赖 FinanceModule；
// 能量经济（B2）：提交预扣/驳回退回/结余退回经 SponsorWalletService 读余额与在途净额
@Module({
  imports: [SponsorWalletModule],
  controllers: [AdsAdminController, AdsPublicController],
  providers: [AdsService, AdsScheduler],
  exports: [AdsService],
})
export class AdsModule {}
