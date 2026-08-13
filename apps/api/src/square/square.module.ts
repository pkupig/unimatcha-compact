import { Module } from '@nestjs/common';
import { SquareController } from './square.controller';
import { SquareService } from './square.service';
import { PrismaModule } from '../prisma/prisma.module';
// 广场统一搜索要同时出「帖子 + 用户」两组结果，人的检索复用 DiscoveryService
import { DiscoveryModule } from '../discovery/discovery.module';

@Module({
  imports: [PrismaModule, DiscoveryModule],
  controllers: [SquareController],
  providers: [SquareService],
  exports: [SquareService],
})
export class SquareModule {}
