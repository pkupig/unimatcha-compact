/* Interface outline: implementation bodies removed. */
import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SuggestionReason {
@Injectable()
export class DiscoveryService {
  constructor(...);
  private normalizeQuery(raw?: string): string | null;
  async searchUsers(...);
  similarity(COALESCE(pr.nickname, ''), $;
  GREATEST(...);
  AND(...);
  private async hydrateUsers(viewerId: string, ids: string[]);
  private async relationshipMap(viewerId: string, ids: string[]);
  async getSuggestions(...);
  bump(uid, 3.0 * Math.log2(1 + n),;
  bump(...);
  bump(...);
  bump(...);
  bump(c.userId, Math.min(1.6, 0.5 * shared),;
  bump(uid, Math.min(1.5, 0.35 * n),;
  async dismissSuggestion(viewerId: string, targetUserId: string);
  private async directContacts(userId: string): Promise<string[]>;
  private async excludedUserIds(userId: string): Promise<string[]>;
  private async recallTwoHop(userId: string): Promise<Map<string, number>>;
  private async recallSameSchool(...);
  private async recallCoEngagement(userId: string): Promise<Map<string, number>>;
  private readPrivacyFlag(settings: unknown, key: string, fallback: boolean): boolean;
  private overlap(a: string[], b: string[]): number;
  private reasonWeight(r: SuggestionReason): number;
