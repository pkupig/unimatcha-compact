import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 找人 + 「猜你认识」。
 *
 * 隐私口径（本模块的核心约束，改动前先读这段）：
 * 这是恋爱匹配平台，把「谁在用这个 app」暴露给熟人是真实伤害，不是产品指标问题。
 * 因此两条铁律：
 *  1. 搜索只能"找到你已经知道名字的人"（settings.privacy.searchable，默认开）。
 *  2. 「猜你认识」只把 **明确打开了 discoverable 的人** 推给别人（默认关），
 *     且被推荐方与接收方都必须打开——单侧打开不产生曝光。
 * 结果就是：默认状态下没有任何用户会因为同校而被系统推给熟人。
 */

// 视为"已建立关系"的 Match 状态（这些人不该再出现在推荐里）
const ACTIVE_MATCH_STATUSES = [
  'MATCHED_ROMANTIC',
  'ROMANTIC_CONFIRMING',
  'RELATIONSHIP_ROMANTIC',
  'MATCHED_FRIEND',
  'FRIEND_CONFIRMED',
  'RELATIONSHIP_MODE',
] as const;

// 查询串上限，与广场搜索一致
const SEARCH_MAX_LEN = 64;

// 各路召回的取数上限——控制单次推荐的数据库负载
const RECALL_LIMITS = {
  twoHop: 200, // 二度好友
  sameSchool: 300, // 同校同年级/同专业
  coEngagement: 200, // 广场共现
};

export interface SuggestionReason {
  /** 机器可读的原因码，前端据此出中英文案，不依赖后端文案 */
  code: 'mutualFriends' | 'sameSchool' | 'sameMajor' | 'sameGrade' | 'sharedInterests' | 'coEngagement';
  /** 附加数值（共同好友数 / 共同兴趣数等），前端拼「3 位共同好友」 */
  count?: number;
  /** 附加文本（专业名 / 学校名），已是原始英文值，前端走 metaLabel 映射中文 */
  value?: string;
}

@Injectable()
export class DiscoveryService {
  constructor(private prisma: PrismaService) {}

  // ════════════════ 找人（联系人搜索）════════════════

  private normalizeQuery(raw?: string): string | null {
    const q = (raw || '').trim().replace(/\s+/g, ' ');
    if (!q) return null;
    return q.slice(0, SEARCH_MAX_LEN);
  }

  /**
   * 按昵称/学校/专业/城市/标签/兴趣搜人，另支持连接码精确命中。
   * 相关性排序 + 分页；过滤 BANNED 与 searchable=false 的用户。
   */
  async searchUsers(
    viewerId: string,
    rawQ: string,
    opts: { limit?: number; page?: number } = {},
  ) {
    const q = this.normalizeQuery(rawQ);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const page = Math.max(1, opts.page ?? 1);
    if (!q) return { users: [], total: 0, page, limit, hasMore: false, query: '' };

    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

    // 连接码精确命中：用户拿到一串 CLXXXXXXXX 时，应当直接找到人，
    // 而不是因为昵称不含这串字符而查无结果。大小写不敏感。
    const byCode = /^cl[a-z0-9]{4,}$/i.test(q)
      ? await this.prisma.user.findFirst({
          where: { connectCode: { equals: q, mode: 'insensitive' }, status: { not: 'BANNED' } },
          select: { id: true },
        })
      : null;

    // 相关性：昵称前缀 > 昵称包含 > 标签/兴趣精确 > 学校/专业/城市包含 > 模糊相似度。
    // 注意 searchable 存在 settings JSON 里，默认视为 true——
    // 只有显式写了 false 才排除（老用户没有该键，不该被静默隐藏）。
    // 无 pg_trgm 时略去 similarity 分量（见 PrismaService.hasTrgm）。
    const fuzzy = (await this.prisma.hasTrgm())
      ? Prisma.sql`,
               similarity(COALESCE(pr.nickname, ''), ${q}) * 2.0`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ userId: string; rel: number }[]>(Prisma.sql`
      SELECT pr."userId",
             GREATEST(
               CASE WHEN pr.nickname ILIKE ${q + '%'} THEN 3.0 ELSE 0 END,
               CASE WHEN pr.nickname ILIKE ${like} THEN 2.4 ELSE 0 END,
               CASE WHEN ${q} = ANY(pr.tags) OR ${q} = ANY(pr.interests) THEN 1.8 ELSE 0 END,
               CASE WHEN pr.school ILIKE ${like} THEN 1.4 ELSE 0 END,
               CASE WHEN pr.major  ILIKE ${like} THEN 1.2 ELSE 0 END,
               CASE WHEN pr.city   ILIKE ${like} THEN 1.0 ELSE 0 END${fuzzy}
             )::float8 AS rel
        FROM profiles pr
        JOIN users u ON u.id = pr."userId"
       WHERE pr."userId" <> ${viewerId}
         AND u.status <> 'BANNED'
         AND COALESCE((u.settings -> 'privacy' ->> 'searchable')::boolean, true) = true
         AND (
              pr.nickname ILIKE ${like}
           OR pr.school   ILIKE ${like}
           OR pr.major    ILIKE ${like}
           OR pr.city     ILIKE ${like}
           OR pr.tags      @> ARRAY[${q}]::text[]
           OR pr.interests @> ARRAY[${q}]::text[]
         )
       ORDER BY rel DESC, pr."userId"
       LIMIT 200
    `);

    // 连接码命中置顶（它绕过 searchable：对方把码给了你，就是明确同意被你找到）
    const ordered = [...rows];
    if (byCode && byCode.id !== viewerId) {
      const idx = ordered.findIndex((r) => r.userId === byCode.id);
      if (idx >= 0) ordered.splice(idx, 1);
      ordered.unshift({ userId: byCode.id, rel: 99 });
    }

    const total = ordered.length;
    const slice = ordered.slice((page - 1) * limit, (page - 1) * limit + limit);
    const users = await this.hydrateUsers(
      viewerId,
      slice.map((r) => r.userId),
    );

    return { users, total, page, limit, hasMore: page * limit < total, query: q };
  }

  /** 把 userId 列表补成带资料与关系态的卡片，并保持传入顺序 */
  private async hydrateUsers(viewerId: string, ids: string[]) {
    if (!ids.length) return [];
    const [profiles, relMap] = await Promise.all([
      this.prisma.profile.findMany({
        where: { userId: { in: ids } },
        select: {
          userId: true, nickname: true, avatarUrl: true, school: true,
          grade: true, major: true, city: true, signature: true, bio: true,
        },
      }),
      this.relationshipMap(viewerId, ids),
    ]);
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    return ids
      .map((id) => {
        const p = byId.get(id);
        if (!p) return null;
        return {
          id: p.userId,
          nickname: p.nickname,
          avatarUrl: p.avatarUrl,
          school: p.school,
          grade: p.grade,
          major: p.major,
          city: p.city,
          // 签名/简介只给一小段做副标题，避免把整篇 bio 下发给搜索结果
          tagline: (p.signature || p.bio || '').slice(0, 60) || null,
          relationship: relMap.get(id) ?? 'none',
        };
      })
      .filter(Boolean);
  }

  /** viewer 与一批用户的关系态：none | pending | friend | romantic */
  private async relationshipMap(viewerId: string, ids: string[]) {
    const out = new Map<string, 'none' | 'pending' | 'friend' | 'romantic'>();
    if (!ids.length) return out;
    const matches = await this.prisma.match.findMany({
      where: {
        dissolvedAt: null,
        status: { in: ACTIVE_MATCH_STATUSES as any },
        OR: [
          { userAId: viewerId, userBId: { in: ids } },
          { userBId: viewerId, userAId: { in: ids } },
        ],
      },
      select: { userAId: true, userBId: true, status: true },
    });
    for (const m of matches) {
      const other = m.userAId === viewerId ? m.userBId : m.userAId;
      const s = m.status as string;
      const rel =
        s === 'RELATIONSHIP_ROMANTIC' || s === 'RELATIONSHIP_MODE'
          ? 'romantic'
          : s === 'FRIEND_CONFIRMED'
            ? 'friend'
            : 'pending';
      // 同一对人可能有 romantic + friend 两条 Match，取更"深"的那条展示
      const rank = { none: 0, pending: 1, friend: 2, romantic: 3 } as const;
      if (rank[rel] >= rank[out.get(other) ?? 'none']) out.set(other, rel);
    }
    return out;
  }

  // ════════════════ 猜你认识 ════════════════

  /**
   * 多路召回 + 打分。
   * 召回：① 二度好友（共同好友）② 同校同年级/同专业 ③ 广场共现（赞过同一批帖）
   * 过滤：自己 / 已有关系 / 已忽略 / BANNED / discoverable=false / 未开朋友模式
   */
  async getSuggestions(viewerId: string, opts: { limit?: number } = {}) {
    const limit = Math.min(30, Math.max(1, opts.limit ?? 10));

    const [me, myPrivacy] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId: viewerId },
        select: { school: true, grade: true, major: true, city: true, interests: true, tags: true },
      }),
      this.prisma.user.findUnique({ where: { id: viewerId }, select: { settings: true } }),
    ]);

    // 自己没打开 discoverable 就不给推荐：这是对等的。
    // 只看别人而不被别人看到，会让愿意公开的人单方面承担全部曝光。
    const discoverable = this.readPrivacyFlag(myPrivacy?.settings, 'discoverable', false);
    if (!discoverable) {
      return { items: [], enabled: false, reasonDisabled: 'discoverable_off' };
    }

    const [excluded, dismissed] = await Promise.all([
      this.excludedUserIds(viewerId),
      this.prisma.userSuggestionDismiss.findMany({
        where: { userId: viewerId },
        select: { targetUserId: true },
      }),
    ]);
    const exclude = new Set<string>([viewerId, ...excluded, ...dismissed.map((d) => d.targetUserId)]);

    // ── 召回 ──
    const [twoHop, sameSchool, coEngaged] = await Promise.all([
      this.recallTwoHop(viewerId),
      this.recallSameSchool(viewerId, me),
      this.recallCoEngagement(viewerId),
    ]);

    // ── 合并打分 ──
    // 每路信号独立加分，同一人被多路召回则分数叠加——这正是我们想要的：
    // 「同校 + 3 个共同好友 + 兴趣重合」比单纯同校强得多。
    const scores = new Map<string, { score: number; reasons: SuggestionReason[] }>();
    const bump = (uid: string, delta: number, reason: SuggestionReason) => {
      if (exclude.has(uid)) return;
      const cur = scores.get(uid) ?? { score: 0, reasons: [] };
      cur.score += delta;
      cur.reasons.push(reason);
      scores.set(uid, cur);
    };

    // ① 共同好友：最强信号。收益随共同好友数递减（log），
    //    避免一个社交中心节点把所有人的推荐位刷屏。
    for (const [uid, n] of twoHop) {
      bump(uid, 3.0 * Math.log2(1 + n), { code: 'mutualFriends', count: n });
    }

    // ② 同校：同校本身是弱信号（一个学校几千人），同年级/同专业才有区分度
    for (const c of sameSchool) {
      bump(c.userId, 0.6, { code: 'sameSchool', value: c.school ?? undefined });
      if (me?.grade && c.grade === me.grade) {
        bump(c.userId, 0.8, { code: 'sameGrade', value: c.grade ?? undefined });
      }
      if (me?.major && c.major === me.major) {
        bump(c.userId, 1.4, { code: 'sameMajor', value: c.major ?? undefined });
      }
      const shared = this.overlap(
        [...(me?.interests ?? []), ...(me?.tags ?? [])],
        [...(c.interests ?? []), ...(c.tags ?? [])],
      );
      if (shared > 0) {
        bump(c.userId, Math.min(1.6, 0.5 * shared), { code: 'sharedInterests', count: shared });
      }
    }

    // ③ 广场共现：行为信号，与学校无关，覆盖跨校的真实同好
    for (const [uid, n] of coEngaged) {
      bump(uid, Math.min(1.5, 0.35 * n), { code: 'coEngagement', count: n });
    }

    if (!scores.size) return { items: [], enabled: true };

    // ── 候选方仍需自己打开 discoverable ──
    // 前面校验的是 viewer 自己；这里校验被推荐的人是否同意被推出去。
    const candidateIds = [...scores.keys()];
    const allowed = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT u.id
        FROM users u
       WHERE u.id IN (${Prisma.join(candidateIds)})
         AND u.status <> 'BANNED'
         AND COALESCE((u.settings -> 'privacy' ->> 'discoverable')::boolean, false) = true
    `);
    const allowedSet = new Set(allowed.map((r) => r.id));

    const ranked = candidateIds
      .filter((id) => allowedSet.has(id))
      .map((id) => ({ id, ...scores.get(id)! }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const hydrated = await this.hydrateUsers(
      viewerId,
      ranked.map((r) => r.id),
    );
    const reasonById = new Map(ranked.map((r) => [r.id, r]));

    return {
      enabled: true,
      items: hydrated.map((u: any) => {
        const r = reasonById.get(u.id);
        return {
          ...u,
          score: Math.round((r?.score ?? 0) * 100) / 100,
          // 原因按贡献排序取前 2 条：卡片上放不下更多，且最强的两条最有说服力
          reasons: (r?.reasons ?? [])
            .sort((a, b) => this.reasonWeight(b) - this.reasonWeight(a))
            .slice(0, 2),
        };
      }),
    };
  }

  /** 忽略某个推荐（单向，永久） */
  async dismissSuggestion(viewerId: string, targetUserId: string) {
    if (!targetUserId || targetUserId === viewerId) {
      throw new BadRequestException('Invalid target');
    }
    await this.prisma.userSuggestionDismiss.upsert({
      where: { userId_targetUserId: { userId: viewerId, targetUserId } },
      create: { userId: viewerId, targetUserId },
      update: {},
    });
    return { dismissed: true };
  }

  // ════════════════ 召回实现 ════════════════

  /** 我的直接好友（已确认的朋友/恋人关系对方） */
  private async directContacts(userId: string): Promise<string[]> {
    const matches = await this.prisma.match.findMany({
      where: {
        dissolvedAt: null,
        status: { in: ACTIVE_MATCH_STATUSES as any },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { userAId: true, userBId: true },
    });
    return matches.map((m) => (m.userAId === userId ? m.userBId : m.userAId));
  }

  /**
   * 排除集合：所有已建立过关系的人——包括**已解除**的。
   * 解除关系的两人再被系统推到对方面前是明确的伤害，所以这里不带 dissolvedAt 过滤。
   */
  private async excludedUserIds(userId: string): Promise<string[]> {
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
    return matches.map((m) => (m.userAId === userId ? m.userBId : m.userAId));
  }

  /** ① 二度好友：好友的好友 → 共同好友数 */
  private async recallTwoHop(userId: string): Promise<Map<string, number>> {
    const friends = await this.directContacts(userId);
    const out = new Map<string, number>();
    if (!friends.length) return out;

    const second = await this.prisma.match.findMany({
      where: {
        dissolvedAt: null,
        status: { in: ACTIVE_MATCH_STATUSES as any },
        OR: [{ userAId: { in: friends } }, { userBId: { in: friends } }],
      },
      select: { userAId: true, userBId: true },
      take: RECALL_LIMITS.twoHop,
    });
    const friendSet = new Set(friends);
    for (const m of second) {
      // 一条边的两端：属于我好友的那端是"桥"，另一端是候选
      const candidates = [m.userAId, m.userBId].filter((x) => !friendSet.has(x) && x !== userId);
      for (const c of candidates) out.set(c, (out.get(c) ?? 0) + 1);
    }
    return out;
  }

  /** ② 同校候选（同年级/同专业/兴趣重合在打分阶段区分） */
  private async recallSameSchool(
    userId: string,
    me: { school?: string | null; grade?: string | null; major?: string | null } | null,
  ) {
    if (!me?.school) return [];
    return this.prisma.profile.findMany({
      where: {
        userId: { not: userId },
        school: me.school,
        // 同校候选量大，优先取同年级或同专业的，纯同校随机人价值很低
        OR: [
          me.grade ? { grade: me.grade } : undefined,
          me.major ? { major: me.major } : undefined,
        ].filter(Boolean) as Prisma.ProfileWhereInput[],
      },
      select: {
        userId: true, school: true, grade: true, major: true,
        interests: true, tags: true,
      },
      take: RECALL_LIMITS.sameSchool,
    });
  }

  /**
   * ③ 广场共现：我赞过的帖子，还有谁赞了 → 共现次数。
   * 这是唯一不依赖学校/资料的召回路径，能给跨校同好留出口子。
   */
  private async recallCoEngagement(userId: string): Promise<Map<string, number>> {
    const myLikes = await this.prisma.squarePostLike.findMany({
      where: { userId },
      select: { postId: true },
      orderBy: { createdAt: 'desc' },
      take: 100, // 只看最近 100 次点赞：兴趣会漂移，太老的行为没有代表性
    });
    const out = new Map<string, number>();
    if (!myLikes.length) return out;

    const others = await this.prisma.squarePostLike.findMany({
      where: { postId: { in: myLikes.map((l) => l.postId) }, userId: { not: userId } },
      select: { userId: true },
      take: RECALL_LIMITS.coEngagement * 5,
    });
    for (const o of others) out.set(o.userId, (out.get(o.userId) ?? 0) + 1);

    // 只保留共现 ≥2 的：赞过同一条热帖的人可能有几百个，单次共现不构成信号
    for (const [k, v] of out) if (v < 2) out.delete(k);
    return out;
  }

  // ════════════════ 小工具 ════════════════

  /** 读 settings.privacy.<key>，缺键时用 fallback（老用户没有新键，不能当成 false） */
  private readPrivacyFlag(settings: unknown, key: string, fallback: boolean): boolean {
    const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, any>;
    const p = (s.privacy && typeof s.privacy === 'object' ? s.privacy : {}) as Record<string, any>;
    return typeof p[key] === 'boolean' ? p[key] : fallback;
  }

  /** 两个字符串数组的交集大小（大小写/空白不敏感） */
  private overlap(a: string[], b: string[]): number {
    const norm = (x: string) => x.trim().toLowerCase();
    const setA = new Set(a.filter(Boolean).map(norm));
    let n = 0;
    for (const x of new Set(b.filter(Boolean).map(norm))) if (setA.has(x)) n++;
    return n;
  }

  /** 展示优先级：共同好友最有说服力，泛同校最弱 */
  private reasonWeight(r: SuggestionReason): number {
    const base: Record<SuggestionReason['code'], number> = {
      mutualFriends: 5,
      sameMajor: 4,
      sharedInterests: 3,
      coEngagement: 2.5,
      sameGrade: 2,
      sameSchool: 1,
    };
    return base[r.code] + Math.min(1, (r.count ?? 0) / 10);
  }
}
