/* Interface outline: implementation bodies removed. */
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ProfilesModule } from '../profiles/profiles.module';
import { DiscoveryModule } from '../discovery/discovery.module';

@Module({
export class UsersModule {
