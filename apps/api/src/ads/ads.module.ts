import { Module } from '@nestjs/common';
import { AdsAdminController } from './ads-admin.controller';
import { AdsPublicController } from './ads-public.controller';
import { AdsService } from './ads.service';
import { AdsScheduler } from './ads.scheduler';

// 分成入账直接经 Prisma 写 SchoolLedgerEntry（settleCampaign），无需依赖 FinanceModule
@Module({
  controllers: [AdsAdminController, AdsPublicController],
  providers: [AdsService, AdsScheduler],
  exports: [AdsService],
})
export class AdsModule {}
