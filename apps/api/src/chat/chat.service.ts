/* Interface outline: implementation bodies removed. */
import {
  Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchFeedbackService } from '../matching/feedback/match-feedback.service';
import {
  ALL_CHATTABLE,
  CONFIRM_WINDOW_MS,
  fromMatchMode,
  isConfirmedStatus,
  isTempStatus,
  toMatchMode,
  type ModeStr,
} from '../matching/mode.util';

type ModeStr,
type SessionMode = ModeStr | 'all';
@Injectable()
export class ChatService {
  constructor(...);
  private async verifyMatchAccess(matchId: string, userId: string);
  async getMessages(...);
  async sendMessage(...);
  isTempStatus(match.status) &&;
  async getConversationSessions(...);
  async setChatBackground(matchId: string, userId: string, imageUrl: string | null);
  async nudge(matchId: string, userId: string);
  async setNudgeSuffix(userId: string, suffix: string);
  async markRead(matchId: string, userId: string);
  async getUnreadCount(matchId: string, userId: string);
  async pollMessages(...);
