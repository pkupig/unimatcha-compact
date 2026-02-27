import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private prisma: PrismaService) {}

  // 恋爱时长排行榜
  async getDurationLeaderboard(limit = 20) {
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'RELATIONSHIP_MODE',
        relationshipStartedAt: { not: null },
      },
      orderBy: { relationshipStartedAt: 'asc' }, // 越早开始 = 时长越长
      take: limit,
      include: {
        userA: {
          select: {
            id: true,
            profile: {
              select: { nickname: true, avatarUrl: true, school: true },
            },
          },
        },
        userB: {
          select: {
            id: true,
            profile: {
              select: { nickname: true, avatarUrl: true, school: true },
            },
          },
        },
      },
    });

    const now = new Date();
    return matches.map((m, index) => {
      const startedAt = m.relationshipStartedAt || m.confirmedAt || m.createdAt;
      const durationMs = now.getTime() - new Date(startedAt).getTime();
      const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));

      return {
        rank: index + 1,
        matchId: m.id,
        durationDays,
        startedAt,
        coupleA: {
          nickname: m.userA?.profile?.nickname || '匿名',
          avatarUrl: m.userA?.profile?.avatarUrl || null,
          school: m.userA?.profile?.school || null,
        },
        coupleB: {
          nickname: m.userB?.profile?.nickname || '匿名',
          avatarUrl: m.userB?.profile?.avatarUrl || null,
          school: m.userB?.profile?.school || null,
        },
      };
    });
  }

  // 恋爱分排行榜
  async getScoreLeaderboard(limit = 20) {
    // 查找所有在恋爱模式中的用户对，按双方平均恋爱分排序
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'RELATIONSHIP_MODE',
      },
      take: limit,
      include: {
        userA: {
          select: {
            id: true,
            profile: {
              select: {
                nickname: true, avatarUrl: true, school: true,
                relationshipScore: true,
              },
            },
          },
        },
        userB: {
          select: {
            id: true,
            profile: {
              select: {
                nickname: true, avatarUrl: true, school: true,
                relationshipScore: true,
              },
            },
          },
        },
      },
    });

    // 计算双方平均分并排序
    const ranked = matches.map((m) => {
      const scoreA = m.userA?.profile?.relationshipScore || 0;
      const scoreB = m.userB?.profile?.relationshipScore || 0;
      const avgScore = Math.round(((scoreA + scoreB) / 2) * 10) / 10;

      return {
        matchId: m.id,
        avgScore,
        coupleA: {
          nickname: m.userA?.profile?.nickname || '匿名',
          avatarUrl: m.userA?.profile?.avatarUrl || null,
          school: m.userA?.profile?.school || null,
          score: scoreA,
        },
        coupleB: {
          nickname: m.userB?.profile?.nickname || '匿名',
          avatarUrl: m.userB?.profile?.avatarUrl || null,
          school: m.userB?.profile?.school || null,
          score: scoreB,
        },
      };
    });

    ranked.sort((a, b) => b.avgScore - a.avgScore);

    return ranked.map((item, index) => ({
      rank: index + 1,
      ...item,
    }));
  }
}
