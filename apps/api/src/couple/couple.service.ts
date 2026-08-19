/* Interface outline: implementation bodies removed. */
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoupleService {
  constructor(...);
  private async assertMember(userId: string, matchId: string);
  async getSpace(userId: string, matchId: string);
  async setCover(userId: string, matchId: string, imageUrl: string | null);
  async sendLoveYou(userId: string, matchId: string);
  async (tx) =>;
  async setStatus(userId: string, matchId: string, status: string);
  async addCraving(userId: string, matchId: string, text: string);
  async addSchedule(...);
  async deleteSchedule(userId: string, matchId: string, id: string);
  async addAnniversary(...);
  async updateAnniversary(...);
  async deleteAnniversary(userId: string, matchId: string, id: string);
  async addBucket(...);
  async toggleBucket(...);
  async deleteBucket(userId: string, matchId: string, id: string);
