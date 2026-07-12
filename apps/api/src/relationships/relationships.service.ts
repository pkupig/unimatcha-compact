import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';

const DAY = 86400000;
// 已确认的“成功关系”：恋人 + 已确认好友（RELATIONSHIP_MODE 兼容旧数据）
const CONFIRMED = ['RELATIONSHIP_ROMANTIC', 'RELATIONSHIP_MODE', 'FRIEND_CONFIRMED'];

@Injectable()
export class RelationshipsService {
  constructor(
    private prisma: PrismaService,
    private profiles: ProfilesService,
  ) {}

  // 关系网图谱（本轮反馈3）：只含我的直接关系（恋人/好友）。
  // 节点=每个关系对象；边=我↔对方，粗细=亲密度（聊天频率+最近度+帖子互动）。
  async getGraph(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        dissolvedAt: null,
        status: { in: CONFIRMED as any },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { id: true, userAId: true, userBId: true, status: true },
    });

    const selfProfileMap = await this.profiles.getPublicProfilesByIds([userId]);
    const selfP = selfProfileMap.get(userId) || {};
    const self = { id: userId, nickname: selfP.nickname || 'You', avatarUrl: selfP.avatarUrl || '' };

    if (!matches.length) return { self, nodes: [], edges: [] };

    const friends = matches.map((m) => ({
      pid: m.userAId === userId ? m.userBId : m.userAId,
      matchId: m.id,
      kind:
        m.status === 'RELATIONSHIP_ROMANTIC' || m.status === 'RELATIONSHIP_MODE'
          ? 'romantic'
          : 'friend',
    }));
    const friendIds = friends.map((f) => f.pid);
    const matchIds = friends.map((f) => f.matchId);

    const profileMap = await this.profiles.getPublicProfilesByIds([userId, ...friendIds]);

    // 聊天：按 matchId 聚合数量 + 最近一条时间
    const msgGroups = await this.prisma.message.groupBy({
      by: ['matchId'],
      where: { matchId: { in: matchIds } },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const msgByMatch = new Map(
      msgGroups.map((g) => [g.matchId, { count: g._count._all, last: g._max.createdAt }]),
    );

    // 帖子互动：我↔好友（任一方向的点赞/评论）
    const inter = new Map<string, number>(friendIds.map((id) => [id, 0]));
    const add = (id: string | null, n: number) => {
      if (id && inter.has(id)) inter.set(id, (inter.get(id) || 0) + n);
    };

    const [myPosts, friendPosts] = await Promise.all([
      this.prisma.squarePost.findMany({ where: { authorUserId: userId }, select: { id: true } }),
      this.prisma.squarePost.findMany({
        where: { authorUserId: { in: friendIds } },
        select: { id: true, authorUserId: true },
      }),
    ]);
    const myPostIds = myPosts.map((p) => p.id);
    const friendPostIds = friendPosts.map((p) => p.id);
    const postAuthor = new Map(friendPosts.map((p) => [p.id, p.authorUserId]));

    if (myPostIds.length) {
      const [likesOnMine, commentsOnMine] = await Promise.all([
        this.prisma.squarePostLike.groupBy({
          by: ['userId'],
          where: { postId: { in: myPostIds }, userId: { in: friendIds } },
          _count: { _all: true },
        }),
        this.prisma.squarePostComment.groupBy({
          by: ['userId'],
          where: { postId: { in: myPostIds }, userId: { in: friendIds } },
          _count: { _all: true },
        }),
      ]);
      likesOnMine.forEach((g) => add(g.userId, g._count._all));
      commentsOnMine.forEach((g) => add(g.userId, 2 * g._count._all));
    }
    if (friendPostIds.length) {
      const [myLikes, myComments] = await Promise.all([
        this.prisma.squarePostLike.findMany({
          where: { postId: { in: friendPostIds }, userId },
          select: { postId: true },
        }),
        this.prisma.squarePostComment.findMany({
          where: { postId: { in: friendPostIds }, userId },
          select: { postId: true },
        }),
      ]);
      myLikes.forEach((l) => add(postAuthor.get(l.postId) || null, 1));
      myComments.forEach((c) => add(postAuthor.get(c.postId) || null, 2));
    }

    // 亲密度 raw = log1p(消息数)*1 + 最近度*2 + log1p(帖子互动)*1.5
    const now = Date.now();
    const raws = friends.map((f) => {
      const mm = msgByMatch.get(f.matchId) || { count: 0, last: null as Date | null };
      const recency = mm.last
        ? Math.exp(-((now - new Date(mm.last).getTime()) / DAY) / 14)
        : 0;
      const posts = inter.get(f.pid) || 0;
      const raw = Math.log1p(mm.count) * 1.0 + recency * 2.0 + Math.log1p(posts) * 1.5;
      return { ...f, msgCount: mm.count, posts, raw };
    });
    const maxRaw = Math.max(0.0001, ...raws.map((r) => r.raw));

    const nodes = raws.map((r) => {
      const p = profileMap.get(r.pid) || {};
      return {
        id: r.pid,
        nickname: p.nickname || 'Friend',
        avatarUrl: p.avatarUrl || '',
        school: p.school || '',
        kind: r.kind,
      };
    });
    const edges = raws.map((r) => ({
      a: userId,
      b: r.pid,
      weight: 1 + Math.round((r.raw / maxRaw) * 5), // 1..6 px
      raw: Number(r.raw.toFixed(3)),
      msgCount: r.msgCount,
      posts: r.posts,
    }));

    return { self, nodes, edges };
  }
}
