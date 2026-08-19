/* Interface outline: implementation bodies removed. */
import { Module } from '@nestjs/common';
import { RelationshipsController } from './relationships.controller';
import { RelationshipsService } from './relationships.service';
import { ProfilesModule } from '../profiles/profiles.module';

@Module({
export class RelationshipsModule {
