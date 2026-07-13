import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { fromMatchMode } from '../mode.util';

// 与 matching-ml/feedback/schemas.py 的 BehaviorType 一一对应，值不可改（训练侧按字符串匹配）
export type BehaviorType =
  | 'viewed'
  | 'openedProfile'
  | 'firstMessage'
  | 'message'
  | 'confirmed'
  | 'rejected'
  | 'dissolved'
  | 'reported'
  | 'blocked';

// 客户端可直接上报的仅限「看过类」事件；confirmed/message 等由服务端在权威动作处落库，
// 防止客户端刷事件污染训练标签（mutualConfirmed / mutualConversation 等，train_ranker.py）
export const CLIENT_BEHAVIOR_TYPES = ['viewed', 'openedProfile'] as const;

interface BehaviorEventInput {
  matchId?: string | null;
  exposureId?: string | null;
  mode: string; // 'romantic' | 'friend'
  userAId: string;
  userBId: string;
  actorId: string;
  type: BehaviorType;
  meta?: Record<string, any>;
}

/**
 * 匹配反馈埋点（BACKLOG P0-2）：曝光 + 行为事件，喂给 matching-ml/feedback 训练管线。
 * 所有写入绝不抛错——埋点失败只告警，不允许影响匹配 / 聊天主流程。
 */
@Injectable()
export class MatchFeedbackService {
  private readonly logger = new Logger(MatchFeedbackService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 匹配公布后逐对落一条曝光（与 feedback/emit.py 同构：pair 级一条，shownToUserId=userAId）。
   * 唯一键 (matchJobId, matchId) 保证 Bull 重试不重复落曝光。
   * featureSnapshot 必须取自模型返回的 pair.metadata（展示时刻冻结，之后绝不重算）。
   */
  async logExposure(input: {
    matchJobId: string;
    matchId: string;
    mode: string;
    userAId: string;
    userBId: string;
    position: number;
    score: number;
    metadata?: Record<string, any> | null;
  }): Promise<void> {
    try {
      const md = (input.metadata ?? {}) as Record<string, any>;
      await this.prisma.matchExposure.upsert({
        where: {
          matchJobId_matchId: { matchJobId: input.matchJobId, matchId: input.matchId },
        },
        update: {},
        create: {
          matchJobId: input.matchJobId,
          matchId: input.matchId,
          mode: input.mode,
          userAId: input.userAId,
          userBId: input.userBId,
          shownToUserId: input.userAId,
          position: input.position,
          algorithmVersion: typeof md.algorithm === 'string' ? md.algorithm : '',
          constitutionVersion:
            typeof md.constitutionVersion === 'string' ? md.constitutionVersion : '',
          modelVersions: md.modelVersions ?? {},
          featureSnapshot: md.featureSnapshot ?? {},
          finalScore: input.score,
        },
      });
    } catch (e: any) {
      this.logger.warn(`logExposure failed (match ${input.matchId}): ${e.message}`);
    }
  }

  /** 行为事件落库（服务端权威动作处调用）。 */
  async logEvent(input: BehaviorEventInput): Promise<void> {
    try {
      await this.prisma.matchBehaviorEvent.create({
        data: {
          matchId: input.matchId ?? null,
          exposureId: input.exposureId ?? null,
          mode: input.mode,
          userAId: input.userAId,
          userBId: input.userBId,
          actorId: input.actorId,
          type: input.type,
          meta: input.meta ?? {},
        },
      });
    } catch (e: any) {
      this.logger.warn(`logEvent(${input.type}) failed: ${e.message}`);
    }
  }

  /**
   * 客户端批量上报 viewed/openedProfile（H5 接入为 P1-6，端点先行）。
   * 不属于该用户的 matchId 与非白名单类型静默忽略（与广告事件同款容忍策略）。
   * 按 (matchId, actorId, type) 去重：训练侧只看「有没有」（attribution.py 二值化），
   * 重复行零信号；不去重则认证用户可无限刷 INSERT 撑爆事件表（对抗性审查确认项）。
   */
  async ingestClientEvents(
    userId: string,
    events: Array<{ matchId: string; type: string }>,
  ): Promise<{ accepted: number }> {
    const ids = Array.from(new Set(events.map((e) => e.matchId)));
    const matches = await this.prisma.match.findMany({
      where: { id: { in: ids }, OR: [{ userAId: userId }, { userBId: userId }] },
      select: { id: true, mode: true, userAId: true, userBId: true },
    });
    const byId = new Map(matches.map((m) => [m.id, m]));

    const existing = await this.prisma.matchBehaviorEvent.findMany({
      where: {
        actorId: userId,
        matchId: { in: ids },
        type: { in: CLIENT_BEHAVIOR_TYPES as unknown as string[] },
      },
      select: { matchId: true, type: true },
    });
    const seen = new Set(existing.map((e) => `${e.matchId}:${e.type}`));

    let accepted = 0;
    for (const ev of events) {
      const m = byId.get(ev.matchId);
      if (!m) continue;
      if (!(CLIENT_BEHAVIOR_TYPES as readonly string[]).includes(ev.type)) continue;
      const key = `${ev.matchId}:${ev.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await this.logEvent({
        matchId: m.id,
        mode: fromMatchMode(m.mode),
        userAId: m.userAId,
        userBId: m.userBId,
        actorId: userId,
        type: ev.type as BehaviorType,
      });
      accepted++;
    }
    return { accepted };
  }
}
