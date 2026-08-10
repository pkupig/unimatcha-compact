import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsAdminController } from './events-admin.controller';
import { EventsService } from './events.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminCoreModule } from '../admin-core/admin-core.module';

@Module({
  imports: [PrismaModule, AdminCoreModule],
  controllers: [EventsController, EventsAdminController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
