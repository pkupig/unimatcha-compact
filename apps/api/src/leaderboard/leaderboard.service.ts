import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type LeaderboardType =
  | 'duration'
  | 'score'
  | 'streak'
  | 'compatibility'
  | 'shared_interests'
  | 'popular'
  | 'growth'
  | 'empathy';

const VALID_TYPES: LeaderboardType[] = [
  'duration', 'score', 'streak', 'compatibility',
  'shared_interests', 'popular', 'growth', 'empathy',
];

// 实时计算类榜单的候选集上限：先粗排取前 N 对再精算，避免对全表做 N+1 查询
const CANDIDATE_LIMIT = 50;

// 情侣榜单仅统计已确认恋人关系（RELATIONSHIP_MODE 为旧数据兼容）
const RELATIONSHIP_STATUSES = ['RELATIONSHIP_ROMANTIC', 'RELATIONSHIP_MODE'] as any;

// Reusable include shape for both users + their profiles
const COUPLE_INCLUDE = {
  userA: { select: { id: true, profile: { select: { nickname: true, avatarUrl: true, school: true } } } },
  userB: { select: { id: true, profile: { select: { nickname: true, avatarUrl: true, school: true } } } },
} as const;

const COUPLE_INCLUDE_WITH_SCORE = {
  userA: { select: { id: true, profile: { select: { nickname: true, avatarUrl: true, school: true, relationshipScore: true } } } },
  userB: { select: { id: true, profile: { select: { nickname: true, avatarUrl: true, school: true, relationshipScore: true } } } },
} as const;

const COUPLE_INCLUDE_WITH_INTERESTS = {
  userA: { select: { id: true, profile: { select: { nickname: true, avatarUrl: true, school: true, interests: true } } } },
  userB: { select: { id: true, profile: { select: { nickname: true, avatarUrl: true, school: true, interests: true } } } },
} as const;

@Injectable()
export class LeaderboardService {
  constructor(private prisma: PrismaService) {}

  async getLeaderboard(type: string, limit = 20) {
    if (!VALID_TYPES.includes(type as LeaderboardType)) {
      throw new BadRequestException(
        `Unsupported leaderboard type: ${type}. Options: ${VALID_TYPES.join(', ')}`,
      );
    }

    switch (type as LeaderboardType) {
      case 'duration':        return this.getDurationLeaderboard(limit);
      case 'score':           return this.getScoreLeaderboard(limit);
      case 'streak':          return this.getStreakLeaderboard(limit);
      case 'compatibility':   return this.getCompatibilityLeaderboard(limit);
      case 'shared_interests':return this.getSharedInterestsLeaderboard(limit);
      case 'popular':         return this.getPopularLeaderboard(limit);
      case 'growth':          return this.getGrowthLeaderboard(limit);
      case 'empathy':         return this.getEmpathyLeaderboard(limit);
      default:                return this.getDurationLeaderboard(limit);
    }
  }

  // ─── 恋爱时长排行榜 ─────────────────────────────────────
  private async getDurationLeaderboard(limit: number) {
    const matches = await this.prisma.match.findMany({
      where: { status: { in: RELATIONSHIP_STATUSES }, relationshipStartedAt: { not: null } },
      orderBy: { relationshipStartedAt: 'asc' },
      take: limit,
      include: COUPLE_INCLUDE,
    });
    const now = new Date();
    return matches.map((m, i) => {
      const startedAt = m.relationshipStartedAt || m.confirmedAt || m.createdAt;
      const durationDays = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 86400000);
      return { rank: i + 1, matchId: m.id, metric: durationDays, label: `${durationDays} days`, ...this.coupleInfo(m) };
    });
  }

  // ─── 恋爱分排行榜 ──────────────────────────────────────
  private async getScoreLeaderboard(limit: number) {
    // 恋爱分 = 双方 profile.relationshipScore 的均值，须先取更宽的候选集再按均值精排，
    // 否则 take: limit 只是「任取 limit 行再内部排序」，得到的并非真正 Top N（粗排候选后 slice）。
    const matches = await this.prisma.match.findMany({
      where: { status: { in: RELATIONSHIP_STATUSES } },
      orderBy: { relationshipStartedAt: 'asc' },
      take: CANDIDATE_LIMIT,
      include: COUPLE_INCLUDE_WITH_SCORE,
    });
    const ranked = matches.map((m) => {
      const scoreA = m.userA?.profile?.relationshipScore || 0;
      const scoreB = m.userB?.profile?.relationshipScore || 0;
      const avg = Math.round(((scoreA + scoreB) / 2) * 10) / 10;
      return { matchId: m.id, metric: avg, label: `${avg} pts`, ...this.coupleInfo(m) };
    });
    ranked.sort((a, b) => b.metric - a.metric);
    return ranked.slice(0, limit).map((item, i) => ({ rank: i + 1, ...item }));
  }

  // ─── 互动连续天数排行榜 ─────────────────────────────────
  // 口径：连击 = 该 match 的消息按自然天去重后，从今天起往回连续有消息的天数（仅统计近 90 天）
  private async getStreakLeaderboard(limit: number) {
    // 粗排候选：按 relationshipStartedAt 取前 N 对，再逐对精算
    const matches = await this.prisma.match.findMany({
      where: { status: { in: RELATIONSHIP_STATUSES } },
      orderBy: { relationshipStartedAt: 'asc' },
      take: CANDIDATE_LIMIT,
      include: COUPLE_INCLUDE,
    });
    const since = new Date(Date.now() - 90 * 86400000);
    const messages = await this.prisma.message.findMany({
      where: { matchId: { in: matches.map((m) => m.id) }, createdAt: { gte: since } },
      select: { matchId: true, createdAt: true },
    });
    // 每个 match 有消息的「天」集合
    const daysByMatch = new Map<string, Set<string>>();
    for (const msg of messages) {
      const set = daysByMatch.get(msg.matchId) ?? new Set<string>();
      set.add(this.dayKey(msg.createdAt));
      daysByMatch.set(msg.matchId, set);
    }
    const ranked = matches.map((m) => {
      const streak = this.countStreak(daysByMatch.get(m.id));
      return { matchId: m.id, metric: streak, label: `${streak} days`, ...this.coupleInfo(m) };
    });
    ranked.sort((a, b) => b.metric - a.metric);
    return ranked.slice(0, limit).map((item, i) => ({ rank: i + 1, ...item }));
  }

  // ─── 契合度排行榜 ──────────────────────────────────────
  // 口径：契合度 = match.compatibilityScore ?? match.score（匹配算法 0-100 评分），查询时实时取值不落库
  private async getCompatibilityLeaderboard(limit: number) {
    // 粗排候选：compatibilityScore、score 依次降序（null 排后）取前 N，再按合并值精排
    const matches = await this.prisma.match.findMany({
      where: { status: { in: RELATIONSHIP_STATUSES } },
      orderBy: [
        { compatibilityScore: { sort: 'desc', nulls: 'last' } },
        { score: { sort: 'desc', nulls: 'last' } },
      ],
      take: CANDIDATE_LIMIT,
      include: COUPLE_INCLUDE,
    });
    const ranked = matches.map((m) => {
      const score = Math.round((m.compatibilityScore ?? m.score ?? 0) * 10) / 10;
      return { matchId: m.id, metric: score, label: `${score}%`, ...this.coupleInfo(m) };
    });
    ranked.sort((a, b) => b.metric - a.metric);
    return ranked.slice(0, limit).map((item, i) => ({ rank: i + 1, ...item }));
  }

  // ─── 共同兴趣排行榜 ────────────────────────────────────
  private async getSharedInterestsLeaderboard(limit: number) {
    // 粗排候选：按 relationshipStartedAt 取前 N 对，再逐对精算，避免全表遍历
    const matches = await this.prisma.match.findMany({
      where: { status: { in: RELATIONSHIP_STATUSES } },
      orderBy: { relationshipStartedAt: 'asc' },
      take: CANDIDATE_LIMIT,
      include: COUPLE_INCLUDE_WITH_INTERESTS,
    });
    const ranked = matches.map((m) => {
      const intA: string[] = m.userA?.profile?.interests || [];
      const intB: string[] = m.userB?.profile?.interests || [];
      const shared = intA.filter((i) => intB.includes(i)).length;
      return { matchId: m.id, metric: shared, label: `${shared} shared`, ...this.coupleInfo(m) };
    });
    ranked.sort((a, b) => b.metric - a.metric);
    return ranked.slice(0, limit).map((item, i) => ({ rank: i + 1, ...item }));
  }

  // ─── 人气排行榜（动态被赞/评论最多的情侣） ────────────────
  // 广场改版后，情侣动态迁入 SquarePost（按 coupleMatchId 关联）
  private async getPopularLeaderboard(limit: number) {
    // 粗排候选：按 relationshipStartedAt 取前 N 对，再逐对精算，避免全表遍历
    const matches = await this.prisma.match.findMany({
      where: { status: { in: RELATIONSHIP_STATUSES } },
      orderBy: { relationshipStartedAt: 'asc' },
      take: CANDIDATE_LIMIT,
      include: COUPLE_INCLUDE,
    });
    // 一次性聚合候选集的 SquarePost 点赞/评论数，按 coupleMatchId 分组
    const postAgg = await this.prisma.squarePost.groupBy({
      by: ['coupleMatchId'],
      where: { coupleMatchId: { in: matches.map((m) => m.id) } },
      _sum: { likeCount: true, commentCount: true },
    });
    const popularityMap = new Map(
      postAgg.map((p) => [p.coupleMatchId, (p._sum.likeCount ?? 0) + (p._sum.commentCount ?? 0)]),
    );
    const ranked = matches.map((m) => {
      const popularity = popularityMap.get(m.id) ?? 0;
      return { matchId: m.id, metric: popularity, label: `${popularity} heat`, ...this.coupleInfo(m) };
    });
    ranked.sort((a, b) => b.metric - a.metric);
    return ranked.slice(0, limit).map((item, i) => ({ rank: i + 1, ...item }));
  }

  // ─── 成长排行榜 ────────────────────────────────────────
  // 口径：成长分 = (消息数 + 帖子数×5 + 收到评论数×3) / 在一起周数（不足 1 周按 1 周计），保留 1 位小数
  private async getGrowthLeaderboard(limit: number) {
    // 粗排候选：按 relationshipStartedAt 取前 N 对，再逐对精算
    const matches = await this.prisma.match.findMany({
      where: { status: { in: RELATIONSHIP_STATUSES } },
      orderBy: { relationshipStartedAt: 'asc' },
      take: CANDIDATE_LIMIT,
      include: {
        ...COUPLE_INCLUDE,
        _count: { select: { messages: true } },
      },
    });
    // 广场改版后情侣动态迁入 SquarePost：按 coupleMatchId 聚合帖子数与评论数
    const postAgg = await this.prisma.squarePost.groupBy({
      by: ['coupleMatchId'],
      where: { coupleMatchId: { in: matches.map((m) => m.id) } },
      _count: { _all: true },
      _sum: { commentCount: true },
    });
    const postCountMap = new Map(postAgg.map((p) => [p.coupleMatchId, p._count._all]));
    const commentCountMap = new Map(postAgg.map((p) => [p.coupleMatchId, p._sum.commentCount ?? 0]));
    const now = Date.now();
    const ranked = matches.map((m) => {
      const messageCount = m._count.messages;
      const postCount = postCountMap.get(m.id) ?? 0;
      const commentCount = commentCountMap.get(m.id) ?? 0;
      const startedAt = m.relationshipStartedAt || m.confirmedAt || m.createdAt;
      const weeks = Math.max(1, Math.floor((now - new Date(startedAt).getTime()) / (7 * 86400000)));
      const growth = Math.round(((messageCount + postCount * 5 + commentCount * 3) / weeks) * 10) / 10;
      return { matchId: m.id, metric: growth, label: `${growth} pts`, ...this.coupleInfo(m) };
    });
    ranked.sort((a, b) => b.metric - a.metric);
    return ranked.slice(0, limit).map((item, i) => ({ rank: i + 1, ...item }));
  }

  // ─── 共情力排行榜 ──────────────────────────────────────
  // 口径：共情分 = 100 × (1 − |a−b|/(a+b))，a/b 为双方各自发送的消息条数；无任何消息记 0
  private async getEmpathyLeaderboard(limit: number) {
    // 粗排候选：按 relationshipStartedAt 取前 N 对，再逐对精算
    const matches = await this.prisma.match.findMany({
      where: { status: { in: RELATIONSHIP_STATUSES } },
      orderBy: { relationshipStartedAt: 'asc' },
      take: CANDIDATE_LIMIT,
      include: COUPLE_INCLUDE,
    });
    const counts = await this.prisma.message.groupBy({
      by: ['matchId', 'senderId'],
      where: { matchId: { in: matches.map((m) => m.id) } },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [`${c.matchId}:${c.senderId}`, c._count._all]));
    const ranked = matches.map((m) => {
      const a = countMap.get(`${m.id}:${m.userAId}`) || 0;
      const b = countMap.get(`${m.id}:${m.userBId}`) || 0;
      const empathy = a + b === 0 ? 0 : Math.round(100 * (1 - Math.abs(a - b) / (a + b)) * 10) / 10;
      return { matchId: m.id, metric: empathy, label: `${empathy} pts`, ...this.coupleInfo(m) };
    });
    ranked.sort((a, b) => b.metric - a.metric);
    return ranked.slice(0, limit).map((item, i) => ({ rank: i + 1, ...item }));
  }

  // ─── Helpers ───────────────────────────────────────────
  // 按服务器本地时区生成「天」键，用于消息按天去重
  private dayKey(d: Date) {
    const t = new Date(d);
    return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
  }

  // 从今天起逐天往回数，遇到无消息的天即停（上限 90 天）
  private countStreak(days?: Set<string>) {
    if (!days || days.size === 0) return 0;
    let streak = 0;
    const cursor = new Date();
    while (streak < 90 && days.has(this.dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  private coupleInfo(m: any) {
    return {
      coupleA: {
        nickname: m.userA?.profile?.nickname || 'Anonymous',
        avatarUrl: m.userA?.profile?.avatarUrl || null,
        school: m.userA?.profile?.school || null,
      },
      coupleB: {
        nickname: m.userB?.profile?.nickname || 'Anonymous',
        avatarUrl: m.userB?.profile?.avatarUrl || null,
        school: m.userB?.profile?.school || null,
      },
    };
  }
}
