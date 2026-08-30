import { Module } from '@nestjs/common';
import { SquareController } from './square.controller';
import { SquareAdminController } from './square-admin.controller';
import { SquareService } from './square.service';
import { SquareAdminService } from './square-admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminCoreModule } from '../admin-core/admin-core.module';

@Module({
  imports: [PrismaModule, AdminCoreModule],
  controllers: [SquareController, SquareAdminController],
  providers: [SquareService, SquareAdminService],
  exports: [SquareService],
})
export class SquareModule {}
