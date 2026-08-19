/* Interface outline: implementation bodies removed. */
import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SquareModule } from '../square/square.module';

@Module({
export class EventsModule {
