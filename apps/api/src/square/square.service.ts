/* Interface outline: implementation bodies removed. */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, SquareBoard, SquareAuthorType, AdminRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryService } from '../discovery/discovery.service';
import {
  CreatePostDto,
  CreateCommentDto,
  CreateOfficialPostDto,
} from './dto/square.dto';

interface TasteProfile {
@Injectable()
export class SquareService {
  constructor(...);
  private toBoard(b: 'recommend' | 'campus_wall'): SquareBoard;
  private async getUserSchool(userId: string): Promise<string | null>;
  async createPost(userId: string, dto: CreatePostDto);
  async votePoll(postId: string, userId: string, optionIndex: number);
  private async annotateMyVotes(items: any[], userId: string);
  async listPendingPolls(...);
  async reviewPoll(...);
  async createOfficialPost(adminId: string, dto: CreateOfficialPostDto);
  async getAdminScope(adminId: string): Promise<;
  private normalizeQuery(raw?: string): string | null;
  async searchPosts(...);
  AND(...);
  similarity(COALESCE(p.title, ''), $;
  similarity(LEFT(p.content, 500), $;
  GREATEST(...);
  AND(...);
  matches(x.post.content) ||;
  async searchAll(...);
  async listRecommend(...);
  async listCampusWall(...);
  async getPost(postId: string, userId?: string);
  private shapeComments(comments: any[]): any[];
  async createComment(userId: string, postId: string, dto: CreateCommentDto);
  async likeComment(commentId: string, userId: string);
  async likePost(postId: string, userId: string);
  async reportPost(postId: string, userId: string, reason?: string);
  private async getModerationScope(...);
  private assertPostInScope(...);
  async adminListPosts(...);
  private async adminListReportedPosts(...);
  private shapeAdminPost(post: any);
  async adminDeletePost(adminId: string, postId: string, reason?: string);
  async adminRestorePost(adminId: string, postId: string);
  async adminDismissReports(adminId: string, postId: string);
  async deleteOwnPost(userId: string, postId: string);
  private postInclude();
  private scorePersonalCard(...);
  private affinityOf(...);
  private async getTasteProfile(userId: string): Promise<TasteProfile | null>;
  add(authors, s.post.authorUserId, s.w);
  add(schools, s.post.school, s.w);
  private normalizeWeights(m: Map<string, number>, topN: number): Map<string, number>;
  private rememberTaste(userId: string, taste: TasteProfile | null);
  private invalidateTaste(userId: string);
  private metaPinned(...);
  private metaWeight(...);
  rollPage();
  rollPage();
  rollPage();
  rollPage();
  private hashStr(s: string): number;
  private shapeCard(post: any, viewerId: string | undefined, mySchool: string | null);
  private shapePost(post: any, viewerId: string | undefined);
  private authorToken(postId: string, userId: string): string;
  private funAlias(userId: string): string;
  private async anonymizeComments(post: any);
  private async getNickname(userId: string): Promise<string>;
