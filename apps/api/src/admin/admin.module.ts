/* Interface outline: implementation bodies removed. */
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UsersModule } from '../users/users.module';
import { SquareModule } from '../square/square.module';
import { EventsModule } from '../events/events.module';

@Module({
export class AdminModule {
