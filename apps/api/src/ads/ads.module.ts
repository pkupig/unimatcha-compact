/* Interface outline: implementation bodies removed. */
import { Module } from '@nestjs/common';
import { AdsAdminController } from './ads-admin.controller';
import { AdsPublicController } from './ads-public.controller';
import { AdsService } from './ads.service';
import { AdsScheduler } from './ads.scheduler';

@Module({
export class AdsModule {
