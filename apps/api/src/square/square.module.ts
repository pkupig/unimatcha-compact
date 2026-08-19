import { Module } from '@nestjs/common';
import { SquareController } from './square.controller';
import { SquareAdminController } from './square-admin.controller';
import { SquareService } from './square.service';
import { SquareAdminService } from './square-admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminCoreModule } from '../admin-core/admin-core.module';
// 广场统一搜索要同时出「帖子 + 用户」两组结果，人的检索复用 DiscoveryService
import { DiscoveryModule } from '../discovery/discovery.module';

@Module({
  imports: [PrismaModule, AdminCoreModule, DiscoveryModule],
  controllers: [SquareController, SquareAdminController],
  providers: [SquareService, SquareAdminService],
  exports: [SquareService],
})
export class SquareModule {}
