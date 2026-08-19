/* Interface outline: implementation bodies removed. */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { CreateProfileDto } from '../profiles/dto/profile.dto';

@Injectable()
export class UsersService {
  constructor(...);
  async findById(id: string);
  async updateMyProfile(userId: string, dto: CreateProfileDto);
  async getPublicProfile(viewerId: string, targetUserId: string);
  delete (profile as any).coverUrl;
  delete (profile as any).realPhotos;
  delete (profile as any).realName;
  private async getConfirmedMatch(viewerId: string, targetUserId: string);
  async searchUsers(viewerId: string, q: string, limit = 20);
  async getMyMatchStatus(userId: string, mode: 'romantic' | 'friend' = 'romantic');
  async getSettings(userId: string);
  async updateSettings(...);
  private mergeWithDefaults(stored: unknown);
  async getOrCreateConnectCode(userId: string);
  async setNote(userId: string, targetUserId: string, note: string);
  async findAll(...);
  async updateStatus(userId: string, status: 'ACTIVE' | 'BANNED');
  async resetUserMode(userId: string);
  async sendVerificationCode(userId: string, schoolEmail: string);
  async submitVerification(...);
  async updateVerificationStatus(...);
