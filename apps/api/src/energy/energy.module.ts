import { Module } from '@nestjs/common';
import { EnergyService } from './energy.service';
import { EnergyController } from './energy.controller';

/**
 * 能量模块（§10）：增强模式付费能量账户 + 消耗/退还/充值/领取。
 * PrismaService 经全局 PrismaModule 注入；EnergyService 导出供 MatchingService 注入（§3.4）。
 */
@Module({
  controllers: [EnergyController],
  providers: [EnergyService],
  exports: [EnergyService],
})
export class EnergyModule {}
