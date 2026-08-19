/* Interface outline: implementation bodies removed. */
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type LeaderboardType =
@Injectable()
export class LeaderboardService {
  constructor(...);
  async getLeaderboard(type: string, limit = 20);
  private async getDurationLeaderboard(limit: number);
  private async getScoreLeaderboard(limit: number);
  private async getStreakLeaderboard(limit: number);
  private async getCompatibilityLeaderboard(limit: number);
  private async getSharedInterestsLeaderboard(limit: number);
  private async getPopularLeaderboard(limit: number);
  private async getGrowthLeaderboard(limit: number);
  private async getEmpathyLeaderboard(limit: number);
  private dayKey(d: Date);
  private countStreak(days?: Set<string>);
  private coupleInfo(m: any);
