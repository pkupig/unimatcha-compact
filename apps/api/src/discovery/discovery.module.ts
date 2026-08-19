/* Interface outline: implementation bodies removed. */
import { Module } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { DiscoveryController } from './discovery.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
export class DiscoveryModule {
