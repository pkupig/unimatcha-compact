import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, mode: true, status: true, createdAt: true,
        profile: {
          select: {
            nickname: true, school: true, grade: true, gender: true,
            genderPref: true, age: true, city: true, interests: true,
            bio: true, avatarUrl: true, profileCompleteness: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async getMyMatchStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mode: true, status: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    // Get active match config for next match time
    const matchConfig = await this.prisma.matchConfig.findFirst({
      where: { isEnabled: true },
    });

    // Get current active match
    const activeMatch = await this.prisma.match.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: { in: ['MATCHED', 'RELATIONSHIP_MODE'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      mode: user.mode,
      matchConfig: matchConfig
        ? { cronExpr: matchConfig.cronExpr, description: matchConfig.description }
        : null,
      currentMatch: activeMatch ? { id: activeMatch.id, status: activeMatch.status } : null,
    };
  }

  async findAll(params: { page?: number; limit?: number; search?: string; status?: string }) {
    const { page = 1, limit = 20, search, status } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { profile: { nickname: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, mode: true, status: true, createdAt: true,
          profile: {
            select: { nickname: true, school: true, profileCompleteness: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateStatus(userId: string, status: 'ACTIVE' | 'BANNED') {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, email: true, status: true },
    });
  }

  async resetUserMode(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { mode: 'MATCH_MODE' },
      select: { id: true, email: true, mode: true },
    });
  }
}
