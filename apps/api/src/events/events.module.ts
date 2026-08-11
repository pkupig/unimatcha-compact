import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsAdminController } from './events-admin.controller';
import { EventsService } from './events.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminCoreModule } from '../admin-core/admin-core.module';
import { EnergyModule } from '../energy/energy.module';

@Module({
  // EnergyModule：门票能量计费（购票扣格 / 取消退格）注入 EnergyService
  imports: [PrismaModule, AdminCoreModule, EnergyModule],
  controllers: [EventsController, EventsAdminController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
