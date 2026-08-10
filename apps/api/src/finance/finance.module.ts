import { Module } from '@nestjs/common';
import { FinanceAdminController } from './finance-admin.controller';
import { FinanceService } from './finance.service';

@Module({
  controllers: [FinanceAdminController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
