import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
  ) {}

  async getDashboardStats() {
    const [totalUsers, activeUsers, bannedUsers, totalMatches, pendingJobs] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'BANNED' } }),
      this.prisma.match.count(),
      this.prisma.matchJob.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } }),
    ]);

    const inRelationship = await this.prisma.user.count({ where: { mode: 'RELATIONSHIP_MODE' } });
    const inMatchMode = await this.prisma.user.count({ where: { mode: 'MATCH_MODE' } });

    return {
      users: { total: totalUsers, active: activeUsers, banned: bannedUsers, inMatchMode, inRelationship },
      matching: { totalMatches, pendingJobs },
    };
  }

  async listUsers(params: { page?: number; limit?: number; search?: string; status?: string }) {
    return this.usersService.findAll(params);
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        answers: {
          include: {
            question: { select: { title: true, type: true } },
            questionnaireVersion: { select: { version: true, title: true } },
          },
          orderBy: { submittedAt: 'desc' },
          take: 50,
        },
        matchesAsUserA: {
          include: {
            userB: { select: { email: true, profile: { select: { nickname: true } } } },
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        matchesAsUserB: {
          include: {
            userA: { select: { email: true, profile: { select: { nickname: true } } } },
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return user;
  }

  async updateUserStatus(userId: string, status: 'ACTIVE' | 'BANNED') {
    return this.usersService.updateStatus(userId, status);
  }

  async resetUserMode(userId: string) {
    return this.usersService.resetUserMode(userId);
  }

  async getSystemConfig(key: string) {
    return this.prisma.systemConfig.findUnique({ where: { key } });
  }

  async updateSystemConfig(key: string, value: any) {
    return this.prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async getAllConfigs() {
    return this.prisma.systemConfig.findMany();
  }
}
