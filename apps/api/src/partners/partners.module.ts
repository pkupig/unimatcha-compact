import { Module } from '@nestjs/common';
import { AdminCoreModule } from '../admin-core/admin-core.module';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

/**
 * 跨校合作消息线程模块（B6）：商家 × 学校洽谈通道。
 * PrismaModule 为 @Global 无需显式引入；身份/范围校验来自 AdminCoreModule。
 */
@Module({
  imports: [AdminCoreModule],
  controllers: [PartnersController],
  providers: [PartnersService],
})
export class PartnersModule {}
