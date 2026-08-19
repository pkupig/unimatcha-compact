/* Interface outline: implementation bodies removed. */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminRole,
  Prisma,
  PublicSubmissionStatus,
  PublicSubmissionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SquareService } from '../square/square.service';
import { CreateOfficialPostDto } from '../square/dto/square.dto';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-user.dto';
import { ConvertSubmissionDto, UpdateSubmissionDto } from './dto/submission.dto';

type CurrentAdmin =
@Injectable()
export class AdminService {
  constructor(...);
  private effectiveRole(admin: CurrentAdmin): AdminRole | null;
  private async resolveUnionSchool(actor: CurrentAdmin): Promise<;
  private async getSchoolBalanceCents(schoolId: string): Promise<number>;
  private async assertUserScope(actor: CurrentAdmin, userId: string);
  async getDashboardStats(actor: CurrentAdmin);
  async listUsers(...);
  async getUserDetail(actor: CurrentAdmin, userId: string);
  async updateUserStatus(actor: CurrentAdmin, userId: string, status: 'ACTIVE' | 'BANNED');
  async resetUserMode(actor: CurrentAdmin, userId: string);
  async updateUserVerification(...);
  private isSuper(admin: CurrentAdmin): boolean;
  private async countOtherActiveSuperAdmins(targetId: string): Promise<number>;
  private async assertSchoolExists(schoolId: string, label: string);
  async createAdminUser(actor: CurrentAdmin, dto: CreateAdminUserDto);
  async listAdminUsers(...);
  async updateAdminUser(actor: CurrentAdmin, targetId: string, dto: UpdateAdminUserDto);
  async deleteAdminUser(actor: CurrentAdmin, targetId: string);
  async getAdminScope(adminId: string);
  async createOfficialPost(adminId: string, dto: CreateOfficialPostDto);
  async adminDeletePost(adminId: string, postId: string, reason?: string);
  async listSquarePosts(...);
  async adminRestorePost(adminId: string, postId: string);
  async listPolls(...);
  async reviewPoll(...);
  async adminDismissReports(adminId: string, postId: string);
  async listReports(...);
  async updateReportStatus(id: string, status: 'open' | 'resolved');
  async listSubmissions(...);
type?: string;
  async updateSubmission(actor: CurrentAdmin, id: string, dto: UpdateSubmissionDto);
  async convertSubmission(actor: CurrentAdmin, id: string, dto: ConvertSubmissionDto);
  async getSystemConfig(key: string);
  async updateSystemConfig(key: string, value: any);
  async getAllConfigs();
