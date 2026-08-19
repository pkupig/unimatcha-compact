/* Interface outline: implementation bodies removed. */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/profile.dto';

function calcCompleteness(profile: any): number;
@Injectable()
export class ProfilesService {
  constructor(...);
  async upsertProfile(userId: string, dto: CreateProfileDto);
  async getMyProfile(userId: string);
  async getPublicProfile(userId: string);
  async getPublicProfilesByIds(userIds: string[]): Promise<Map<string, any>>;
  async getFullPublicProfile(userId: string);
