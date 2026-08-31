import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, Inject,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CronJob } from 'cron';
import { Prisma, MatchMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { NotificationService } from '../notifications/notification.service';
import { RealtimeService } from '../realtime/realtime.service';
import { EnergyService, ENERGY_COST_ROMANTIC } from '../energy/energy.service';
import { MatchFeedbackService } from './feedback/match-feedback.service';
import {
  MATCH_MODEL_PROVIDER,
  MatchModelProvider,
  CandidateProfile,
  MatchConstraints,
} from './providers/match-model.interface';
import { UpdateMatchConfigDto } from './dto/matching.dto';
import {
  ModeStr,
  normalizeMode,
  toMatchMode,
  toQType,
  fromMatchMode,
  isTempStatus,
  CONFIRM_WINDOW_MS,
  matchedStatusOf,
  confirmingStatusOf,
  confirmedStatusOf,
  MAX_FRIEND_CANDIDATES,
  MAX_ROMANTIC_CANDIDATES,
} from './mode.util';

export const MATCH_QUEUE = 'match-queue';
export const MATCH_JOB = 'run-match';

// 朋友临时/永久状态子集（§3.5 recompute 用）
const FRIEND_TEMP = ['MATCHED_FRIEND', 'FRIEND_CONFIRMING'];
const FRIEND_CONFIRMED = ['FRIEND_CONFIRMED'];
// 各模式「活跃」状态集（用于状态查询）
const ROMANTIC_ACTIVE = ['MATCHED_ROMANTIC', 'ROMANTIC_CONFIRMING', 'RELATIONSHIP_ROMANTIC'];
const FRIEND_ACTIVE = ['MATCHED_FRIEND', 'FRIEND_CONFIRMING', 'FRIEND_CONFIRMED'];
// 恋人独占态（B 规则：已有恋人不再匹配新恋人）
const ROMANTIC_OCCUPIED_STATES = ['matched', 'confirming', 'relationship'];

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  // 旧提议（PENDING_CONFIRM）兼容清理窗口：48h
  private static readonly PROPOSAL_TTL_MS = 48 * 3600 * 1000;

  constructor(
    private prisma: PrismaService,
    private profilesService: ProfilesService,
    @Inject(MATCH_MODEL_PROVIDER) private matchModelProvider: MatchModelProvider,
    @InjectQueue(MATCH_QUEUE) private matchQueue: Queue,
    private notificationService: NotificationService,
    private energyService: EnergyService,
    private matchFeedback: MatchFeedbackService,
    private realtime: RealtimeService,
  ) {}

  // ─── Config ───────────────────────────────────────────────
  async getMatchConfig() {
    return this.prisma.matchConfig.findFirst({ orderBy: { createdAt: 'asc' } });
  }

  async updateMatchConfig(dto: UpdateMatchConfigDto) {
    // 落库前校验 cron 表达式合法：非法表达式若被持久化，syncCronFromDB 构造 CronJob 时会抛错，
    // 旧调度虽因「先建后删」得以保留，但脏配置仍会留在 DB 并在下次重启 onModuleInit 时使调度停摆。
    // 故此处直接拒绝（§3.5）。
    if (dto.cronExpr !== undefined) {
      this.assertValidCron(dto.cronExpr, dto.timezone);
    }

    const existing = await this.prisma.matchConfig.findFirst();
    if (existing) {
      return this.prisma.matchConfig.update({
        where: { id: existing.id },
        data: dto,
      });
    }
    return this.prisma.matchConfig.create({ data: { cronExpr: dto.cronExpr, ...dto } });
  }

  // 尝试构造一个 CronJob 来校验表达式（+ 时区）；非法则抛 400，避免脏配置落库（§3.5）
  private assertValidCron(cronExpr: string, timezone?: string | null) {
    try {
      const job = timezone
        ? new CronJob(cronExpr, () => {}, null, false, timezone)
        : new CronJob(cronExpr, () => {});
      // 触发一次 nextDate 解析，进一步确认表达式可被求值
      job.nextDate();
    } catch (e: any) {
      throw new BadRequestException(`无效的 cron 表达式或时区：${e?.message ?? e}`);
    }
  }

  // ─── 确保 per-mode 状态行存在（懒创建，§3.4） ───────────────────
  private async ensureModeState(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    mode: ModeStr,
  ) {
    return tx.userModeState.upsert({
      where: { userId_mode: { userId, mode } },
      create: { userId, mode, matchState: 'idle' },
      update: {},
    });
  }

  // ─── G 规则：校验该模式问卷是否已填（后端兜底） ────────────────
  // 该模式 active 问卷存在题目时，用户至少答过一题视为已填；无 active 问卷则放行（不阻断）。
  private async assertQuestionnaireCompleted(userId: string, mode: ModeStr) {
    const activeVersion = await this.prisma.questionnaireVersion.findFirst({
      where: { isActive: true, type: toQType(mode) },
      select: { id: true, _count: { select: { questions: true } } },
    });
    // 无该模式 active 问卷：放行（不阻断匹配，由前端引导）
    if (!activeVersion || activeVersion._count.questions === 0) return;

    const answered = await this.prisma.answer.count({
      where: { userId, questionnaireVersionId: activeVersion.id },
    });
    if (answered === 0) {
      throw new BadRequestException(`Please complete the ${mode === 'friend' ? 'friend' : 'partner'} questionnaire before matching`);
    }
  }

  // ─── 用户主动开始匹配（双模式 + 增强，§3.4 / §10.2） ──────────────
  async startMatchForUser(
    userId: string,
    mode: ModeStr = 'romantic',
    opts: { enhanced?: boolean; cells?: number } = {},
  ) {
    const enhanced = !!opts.enhanced;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status === 'BANNED') {
      throw new ForbiddenException('Account has been banned, cannot start matching');
    }

    // G 规则：该模式问卷必须已填
    await this.assertQuestionnaireCompleted(userId, mode);

    // 增强校验：能量必须充足（J 规则 4/7：加入池时预扣）
    // cost = 恋爱固定 3，朋友 = cells(1–5)
    let cost = 0;
    if (enhanced) {
      cost = mode === 'romantic'
        ? ENERGY_COST_ROMANTIC
        : Math.min(5, Math.max(1, opts.cells ?? 1));
      const available = await this.energyService.getAvailableEnergy(userId);
      if (available < cost) throw new BadRequestException('Not enough energy, please top up');
    }

    return this.prisma.$transaction(async (tx) => {
      const st = await this.ensureModeState(tx, userId, mode);
      if (st.matchState === 'searching') {
        // 已在池中（no_match 用户仍是 searching，等下一轮）：清掉本轮 no_match 标记，
        // 让「Match Again」把界面从「本轮无缘」切回「匹配中」。否则前端 reload 后又显示 no_match，
        // 按钮看起来没反应（下方 CAS 分支会清 weeklyMatchNote，但 searching 用户走不到那里）。
        if (st.weeklyMatchNote) {
          await tx.userModeState.update({
            where: { userId_mode: { userId, mode } },
            data: { weeklyMatchNote: null },
          });
        }
        return { status: 'SEARCHING', message: 'Already matching, please wait' };
      }
      // 恋人独占：matched/confirming/relationship 时不可重开（B 规则）
      // 朋友：以上状态均允许继续追加新候选（C 规则）
      if (mode === 'romantic' && ROMANTIC_OCCUPIED_STATES.includes(st.matchState)) {
        throw new BadRequestException('You already have an active or confirmed partner, partner matching has stopped');
      }

      // CAS：仅当不在 searching/(恋人独占态) 时写入 searching
      const blocked = mode === 'romantic'
        ? ['searching', 'matched', 'confirming', 'relationship']
        : ['searching'];
      const res = await tx.userModeState.updateMany({
        where: { userId, mode, matchState: { notIn: blocked } },
        data: { matchState: 'searching', matchSearchingSince: new Date(), weeklyMatchNote: null },
      });
      if (res.count === 0) {
        // 并发抢先：重读区分 SEARCHING / 冲突
        const latest = await tx.userModeState.findUnique({
          where: { userId_mode: { userId, mode } },
          select: { matchState: true },
        });
        if (latest?.matchState === 'searching') {
          return { status: 'SEARCHING', message: 'Already matching, please wait' };
        }
        throw new BadRequestException('You already have an active or confirmed partner, partner matching has stopped');
      }

      // 增强：① 写入本轮增强选择到 UMP（buildCandidates 匹配时读取）；② 预扣能量
      await tx.userMatchPreferences.upsert({
        where: { userId_mode: { userId, mode } },
        create: {
          userId,
          mode,
          enhancedModeEnabled: enhanced,
          ...(mode === 'friend' ? { friendEnhancedCells: enhanced ? cost : 1 } : {}),
        },
        update: {
          enhancedModeEnabled: enhanced,
          // 朋友模式始终显式写入档位（enhanced 时 = cost；否则归位为 1），避免残留旧值导致数据不一致
          ...(mode === 'friend' ? { friendEnhancedCells: enhanced ? cost : 1 } : {}),
        },
      });
      if (enhanced) {
        await this.energyService.consumeInTx(
          tx, userId, cost, mode, null,
          `${mode === 'friend' ? 'Friend' : 'Romantic'} enhanced pre-deduction of ${cost} cells`,
        );
      }

      return {
        status: 'SEARCHING',
        message: enhanced ? `Joined this round's matching pool (enhanced: pre-deducted ${cost} cells)` : "Joined this round's matching pool, results will be announced at the next match",
      };
    });
  }

  // ─── 用户主动停止匹配（§3.4） ──────────────────────────────────
  async stopMatchForUser(userId: string, mode: ModeStr = 'romantic') {
    const st = await this.prisma.userModeState.findUnique({
      where: { userId_mode: { userId, mode } },
    });
    if (!st || st.matchState !== 'searching') {
      throw new BadRequestException('You are not currently matching, cannot stop');
    }

    // 朋友模式：停止搜索不应无条件回到 idle——若仍有活跃朋友（临时 / 已确认），
    // 须重算为 matched / relationship，否则会把已确认朋友对应的 UMS 写坏（§3.4）。
    if (mode === 'friend') {
      const next = await this.prisma.$transaction(async (tx) => {
        // 先清掉 searching 标记（落到 idle + 清 searchingSince），再按现存朋友会话重算
        await tx.userModeState.update({
          where: { userId_mode: { userId, mode } },
          data: { matchState: 'idle', matchSearchingSince: null, weeklyMatchNote: null },
        });
        await this.recomputeModeStateAfterExpire(tx, [userId], 'friend');
        const fresh = await tx.userModeState.findUnique({
          where: { userId_mode: { userId, mode } },
          select: { matchState: true },
        });
        return fresh?.matchState ?? 'idle';
      });
      return {
        status: next.toUpperCase(),
        message: next === 'idle' ? 'Matching stopped' : 'Stopped searching for new friends; existing friends kept',
      };
    }

    await this.prisma.userModeState.update({
      where: { userId_mode: { userId, mode } },
      data: { matchState: 'idle', matchSearchingSince: null },
    });
    return { status: 'IDLE', message: 'Matching stopped' };
  }

  // ─── 获取完整匹配状态（按 mode 分支，§3.4） ──────────────────────
  async getFullMatchStatus(userId: string, mode: ModeStr = 'romantic') {
    const st = await this.ensureModeState(this.prisma, userId, mode);
    const cfg = await this.prisma.matchConfig.findFirst({ where: { isEnabled: true } });
    const nextRunAt = this.computeNextRunAt(cfg?.cronExpr, cfg?.timezone);
    const base = {
      mode,
      matchConfig: cfg ? { cronExpr: cfg.cronExpr, description: cfg.description } : null,
      nextRunAt,
    };

    if (mode === 'friend') {
      // 朋友：返回多候选 / 多朋友数组（含临时 + 已确认；临时带 remainingMs）。
      // 即使本方正在搜索新朋友（searching），仍须照常加载并返回已有活跃朋友（含 FRIEND_CONFIRMED），
      // 否则「再次发起朋友匹配」会把已确认朋友从视图里抹掉（§3.4）。
      const ms = await this.prisma.match.findMany({
        where: {
          mode: MatchMode.FRIEND,
          status: { in: FRIEND_ACTIVE as any },
          OR: [{ userAId: userId }, { userBId: userId }],
          dissolvedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });
      // 批量加载所有 partner 的公开资料，避免在循环内逐个 getPublicProfile 造成 N+1 查询
      const partnerIds = ms.map((m) => (m.userAId === userId ? m.userBId : m.userAId));
      const profileMap = await this.profilesService.getPublicProfilesByIds(partnerIds);
      const matches = ms.map((m) => {
        const isA = m.userAId === userId;
        const pid = isA ? m.userBId : m.userAId;
        const temp = isTempStatus(m.status);
        return {
          matchId: m.id,
          status: m.status,
          score: m.score,
          myConfirmed: isA ? m.userAConfirmed : m.userBConfirmed,
          partnerConfirmed: isA ? m.userBConfirmed : m.userAConfirmed,
          remainingMs: temp
            ? Math.max(0, m.createdAt.getTime() + CONFIRM_WINDOW_MS - Date.now())
            : null,
          matchedAt: m.createdAt,
          partner: profileMap.get(pid) ?? null,
        };
      });

      // searching 时 state 反映搜索态（no_match / searching），但 matches 仍携带已确认朋友
      if (st.matchState === 'searching') {
        return {
          ...base,
          state: st.weeklyMatchNote === 'no_match' ? 'no_match' : 'searching',
          searchingSince: st.matchSearchingSince,
          matches,
        };
      }
      return {
        ...base,
        state: matches.length ? 'matched' : (st.matchState as string),
        matches,
      };
    }

    // 恋人：单对象（matched/confirming/relationship 都返回 partner+match；临时态附 remainingMs）
    const m = await this.prisma.match.findFirst({
      where: {
        mode: MatchMode.ROMANTIC,
        status: { in: ROMANTIC_ACTIVE as any },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!m) {
      if (st.matchState === 'searching') {
        return {
          ...base,
          state: st.weeklyMatchNote === 'no_match' ? 'no_match' : 'searching',
          searchingSince: st.matchSearchingSince,
          match: null,
          partner: null,
        };
      }
      return { ...base, state: 'idle', match: null, partner: null };
    }
    const isA = m.userAId === userId;
    const pid = isA ? m.userBId : m.userAId;
    const stateMap: Record<string, string> = {
      MATCHED_ROMANTIC: 'matched',
      ROMANTIC_CONFIRMING: 'confirming',
      RELATIONSHIP_ROMANTIC: 'relationship',
    };
    const temp = isTempStatus(m.status);
    return {
      ...base,
      state: stateMap[m.status] ?? 'idle',
      match: {
        id: m.id,
        status: m.status,
        myConfirmed: isA ? m.userAConfirmed : m.userBConfirmed,
        partnerConfirmed: isA ? m.userBConfirmed : m.userAConfirmed,
        remainingMs: temp
          ? Math.max(0, m.createdAt.getTime() + CONFIRM_WINDOW_MS - Date.now())
          : null,
        score: m.score,
        matchedAt: m.createdAt,
        relationshipStartedAt: m.relationshipStartedAt,
        confirmedAt: m.confirmedAt,
      },
      partner: await this.profilesService.getPublicProfile(pid),
    };
  }

  // ─── 辅助：根据 cron 表达式 + 时区计算下次执行时间（UTC ISO 字符串） ──────
  // 必须传入配置时区（默认 Asia/Shanghai），否则 CronJob 按 UTC 解析表达式，
  // 算出的 nextRunAt 与 scheduler 实际触发时刻（按时区）不一致（§3.4）。
  private computeNextRunAt(cronExpr?: string | null, timezone?: string | null): string | null {
    if (!cronExpr) return null;
    try {
      const job = timezone
        ? new CronJob(cronExpr, () => {}, null, false, timezone)
        : new CronJob(cronExpr, () => {});
      return job.nextDate().toJSDate().toISOString();
    } catch (e: any) {
      this.logger.warn(`computeNextRunAt: 无效的 cron 表达式 "${cronExpr}": ${e?.message ?? e}`);
      return null;
    }
  }

  // ─── Trigger（加 mode，§3.4） ─────────────────────────────────
  async triggerMatchJob(triggeredBy: string = 'manual', mode: ModeStr = 'romantic') {
    // 「正在运行」检查按 mode 维度：triggeredBy 写入 `${by}:${mode}`，用 endsWith 过滤本模式 job。
    // 否则 scheduler 串行触发 romantic→friend 时，romantic job 还在 PENDING/RUNNING 就会让 friend
    // 触发被全局检查拒绝并被 scheduler catch 吞掉，导致 cron 的朋友批次实际几乎从不执行。
    const running = await this.prisma.matchJob.findFirst({
      where: { status: { in: ['PENDING', 'RUNNING'] }, triggeredBy: { endsWith: `:${mode}` } },
    });
    if (running) {
      throw new BadRequestException(`${mode === 'friend' ? '朋友' : '恋人'}模式已有匹配任务在运行，请等待完成`);
    }

    const job = await this.prisma.matchJob.create({
      data: { triggeredBy: `${triggeredBy}:${mode}`, status: 'PENDING' },
    });

    await this.matchQueue.add(MATCH_JOB, { jobId: job.id, mode }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.log(`Match job ${job.id} queued (mode=${mode}, triggered by: ${triggeredBy})`);
    return job;
  }

  // ─── Execute（加 mode，含增强强配 + 空池退款，§3.4 / §3.6 / §10.3） ──
  async executeMatchJob(jobId: string, mode: ModeStr = 'romantic') {
    this.logger.log(`Executing match job: ${jobId} (mode=${mode})`);

    // 重试幂等：已完成的任务直接跳过
    const matchJob = await this.prisma.matchJob.findUnique({ where: { id: jobId } });
    if (matchJob?.status === 'COMPLETED') {
      this.logger.log(`Match job ${jobId} already completed, skip`);
      return;
    }

    await this.prisma.matchJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    const matchedCount = new Map<string, number>(); // userId -> 本轮该用户落入的 created match 数
    let totalMatched = 0;
    let skippedPairs = 0;
    const matchMode = toMatchMode(mode);
    const initStatus = matchedStatusOf(mode);

    try {
      const activeVersion = await this.prisma.questionnaireVersion.findFirst({
        where: { isActive: true, type: toQType(mode) },
      });

      const candidates = await this.buildCandidates(mode, activeVersion?.id);

      await this.prisma.matchJob.update({
        where: { id: jobId },
        data: { totalCandidates: candidates.length },
      });

      // 仅当候选池「真正为空」(=== 0) 时短路：无人可配，无需调用模型。
      // 恰好 1 人（含增强用户）不在此短路——交由 generateMatches 走正常流程，
      // 单独的增强用户会被归入 emptyPoolUserIds 并在下方统一退款（含通知），
      // 避免在此处以「不足 2 人」名义误退/漏发通知。
      if (candidates.length === 0) {
        await this.prisma.matchJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            totalMatched: 0,
            errorMessage: 'No candidate users this round, skipping this match',
          },
        });
        return;
      }

      const constraints: MatchConstraints = {
        mode,
        maxMatchesPerUser: mode === 'romantic' ? MAX_ROMANTIC_CANDIDATES : MAX_FRIEND_CANDIDATES,
        excludeRelationshipMode: true,
      };

      const result = await this.matchModelProvider.generateMatches(candidates, constraints);

      // 增强候选 userId 集合：用于在创建 Match 时判定哪一方是增强发起方（退款收款方）
      const enhancedCandidateIds = new Set(
        candidates.filter((c) => c.enhanced).map((c) => c.userId),
      );

      // ── 逐对创建 Match（临时对话，立即可聊；48h 从 createdAt 起算）──
      let exposurePosition = 0;
      for (const pair of result.pairs) {
        const createdMatch = await this.prisma.$transaction(async (tx) => {
          if (mode === 'romantic') {
            // 恋人：跳过任一方已有进行中或已确认的 ROMANTIC 匹配
            const existing = await tx.match.findFirst({
              where: {
                mode: MatchMode.ROMANTIC,
                status: { in: ROMANTIC_ACTIVE as any },
                OR: [
                  { userAId: { in: [pair.userAId, pair.userBId] } },
                  { userBId: { in: [pair.userAId, pair.userBId] } },
                ],
              },
            });
            if (existing) {
              skippedPairs++;
              return null;
            }
          } else {
            // 朋友：跳过这一对在该模式下已有活跃 Match（避免重复配同一对）
            const existing = await tx.match.findFirst({
              where: {
                mode: MatchMode.FRIEND,
                status: { in: FRIEND_ACTIVE as any },
                OR: [
                  { userAId: pair.userAId, userBId: pair.userBId },
                  { userAId: pair.userBId, userBId: pair.userAId },
                ],
              },
            });
            if (existing) {
              skippedPairs++;
              return null;
            }
          }

          // 增强发起方判定（退款收款方）：优先取本对中开启了增强的那一方；
          // 双方都增强时取 pair.userAId。结果写入 metadata.enhancedUserId，
          // expireUnconfirmedMatches 据此退款，避免假设「发起方恒为 userA」造成错退。
          let enhancedUserId: string | null = null;
          if (pair.enhanced) {
            enhancedUserId = enhancedCandidateIds.has(pair.userAId)
              ? pair.userAId
              : enhancedCandidateIds.has(pair.userBId)
                ? pair.userBId
                : pair.userAId;
          }

          // 增强字段：enhanced 时写入，否则显式清零（避免 upsert 复用旧行时残留上一轮的增强标记）
          const enhancedData = pair.enhanced
            ? {
                enhancedMode: mode,
                enhancedUserEnergy: pair.enhancedCost ?? null,
                enhancedAttemptedAt: new Date(),
              }
            : { enhancedMode: null, enhancedUserEnergy: null, enhancedAttemptedAt: null };

          // 用 upsert 而非 create：schema 为 @@unique([userAId, userBId, mode])，同一对用户
          // 在该模式下仅允许一条 Match。若该对此前已被配过并已进入终态（EXPIRED/DISSOLVED/
          // REJECTED），再次被配会触发 P2002 唯一约束异常使整个 job 失败。upsert 在命中旧行时
          // 将其重置回初始临时态（清确认标志、清 confirmedAt/relationshipStartedAt/dissolve*），
          // 等价于「重新匹配该对」，支持跨轮次重新配对。注意：唯一键含顺序，反序 (B,A) 为不同键，
          // 故仅同序旧行会命中 update 分支。
          const match = await tx.match.upsert({
            where: {
              userAId_userBId_mode: {
                userAId: pair.userAId,
                userBId: pair.userBId,
                mode: matchMode,
              },
            },
            create: {
              matchJobId: jobId,
              userAId: pair.userAId,
              userBId: pair.userBId,
              mode: matchMode,
              status: initStatus as any,
              score: pair.score,
              compatibilityScore: pair.score,
              metadata: pair.enhanced
                ? { ...(pair.metadata ?? {}), enhancedUserId }
                : pair.metadata,
              userAConfirmed: false,
              userBConfirmed: false,
              ...(pair.enhanced ? enhancedData : {}),
            },
            update: {
              matchJobId: jobId,
              // 重置 createdAt：48h 确认窗口与前端倒计时都锚定 createdAt，重匹配旧行(终态)时若不重置，
              // 原 createdAt 早于 48h 的对会「一出生即过期」，下一次扫描立即被置 EXPIRED。
              createdAt: new Date(),
              status: initStatus as any,
              score: pair.score,
              compatibilityScore: pair.score,
              metadata: pair.enhanced
                ? { ...(pair.metadata ?? {}), enhancedUserId }
                : (pair.metadata ?? Prisma.JsonNull),
              userAConfirmed: false,
              userBConfirmed: false,
              confirmedAt: null,
              relationshipStartedAt: null,
              dissolvedBy: null,
              dissolvedAt: null,
              dissolveReason: null,
              ...enhancedData,
            },
          });

          // 双方 UMS -> matched
          await tx.userModeState.updateMany({
            where: { userId: { in: [pair.userAId, pair.userBId] }, mode },
            data: { matchState: 'matched', matchSearchingSince: null, weeklyMatchNote: null },
          });

          await tx.notification.createMany({
            data: [pair.userAId, pair.userBId].map((uid) => ({
              userId: uid,
              type: 'match_result',
              title: mode === 'friend' ? 'New friend match' : 'Your match is here',
              body: mode === 'friend'
                ? "We found a friend who's on your wavelength. Head to Chat and say hi!"
                : 'Great news! We found a match for you. Head to Chat and start the conversation!',
              metadata: { matchId: match.id, mode },
              isRead: false,
            })),
          });

          matchedCount.set(pair.userAId, (matchedCount.get(pair.userAId) ?? 0) + 1);
          matchedCount.set(pair.userBId, (matchedCount.get(pair.userBId) ?? 0) + 1);
          totalMatched++;
          return match;
        });

        // 曝光埋点（P0-2）：公布即曝光。事务提交后落库（埋点失败只告警，不影响匹配）；
        // (matchJobId, matchId) 唯一键保证 Bull 重试不重复。featureSnapshot 冻结自模型 metadata。
        if (createdMatch) {
          // SSE：match_result 通知已随上方事务落库、事务已提交，给双方推失效事件
          this.realtime.emitToUser(pair.userAId, { type: 'notification' });
          this.realtime.emitToUser(pair.userBId, { type: 'notification' });
          await this.matchFeedback.logExposure({
            matchJobId: jobId,
            matchId: createdMatch.id,
            mode,
            userAId: pair.userAId,
            userBId: pair.userBId,
            position: exposurePosition++,
            score: pair.score,
            metadata: pair.metadata,
          });
        }
      }

      if (skippedPairs > 0) {
        this.logger.log(`Match job ${jobId}: skipped ${skippedPairs} pairs (already active)`);
      }

      // ── 本轮未匹配到的 searching 用户：标 weeklyMatchNote='no_match' + 通知 ──
      const unmatchedSearchingIds = (result.unmatched || []).filter((id) => !matchedCount.has(id));
      if (unmatchedSearchingIds.length > 0) {
        await this.prisma.userModeState.updateMany({
          where: { userId: { in: unmatchedSearchingIds }, mode, matchState: 'searching' },
          data: { weeklyMatchNote: 'no_match' },
        });
        await this.notificationService.createManyNotifications(
          unmatchedSearchingIds.map((uid) => ({
            userId: uid,
            type: 'no_match',
            title: 'No match this round',
            body: "We couldn't find a great match for you this round. Hang tight and check back next round!",
            metadata: { mode },
          })),
        );
      }

      // ── 增强退款（J 规则 6/7）：空池 + 落库阶段被 skip + 朋友未达保证数 ──
      // refund 内部已发 energy_refunded 通知；dedupeKey=`${jobId}:${userId}` 保证 job 重试不重复退。
      const emptyPoolIds = new Set<string>();
      for (const ep of result.emptyPoolUserIds ?? []) {
        emptyPoolIds.add(ep.userId);
        await this.energyService.refund(
          ep.userId, ep.mode, ep.cost, null, '本轮无可配对象', 'empty_pool',
          `${jobId}:${ep.userId}`,
        );
      }
      // 增强但最终未落入足额 created match 的用户：恋爱配到 ≥1 即不退、否则退全部；
      // 朋友退「未满足的格数」(cells - 实际匹配数)。覆盖 provider 配上了但 DB 落库被 skip、
      // 以及朋友池不足导致部分满足的情形——否则增强能量被白扣 / 超额扣（J 规则 4/5/6/7）。
      let supplementaryRefunds = 0;
      for (const c of candidates) {
        if (!c.enhanced || emptyPoolIds.has(c.userId)) continue;
        const cost = c.enhancedCost ?? (mode === 'romantic' ? ENERGY_COST_ROMANTIC : 1);
        const got = matchedCount.get(c.userId) ?? 0;
        const refundCells = mode === 'romantic'
          ? (got >= 1 ? 0 : cost)
          : Math.max(0, cost - got);
        if (refundCells <= 0) continue;
        await this.energyService.refund(
          c.userId, mode, refundCells, null,
          got > 0 ? '增强匹配未达保证数，退还差额' : '增强匹配本轮未配对，退还能量',
          'empty_pool', `${jobId}:${c.userId}`,
        );
        supplementaryRefunds++;
      }
      if (supplementaryRefunds > 0) {
        this.logger.log(`Match job ${jobId}: ${supplementaryRefunds} supplementary enhanced refunds`);
      }

      // 增强是「按轮」付费（startMatchForUser 每次预扣）：本轮处理完后清掉所有增强候选的
      // enhancedModeEnabled，否则用户付一次费后，enhancedModeEnabled 长期为 true，之后每轮都被
      // buildCandidates 当增强用户免费强配（未匹配还每轮重复退款）。清零后须再次经 /matching/start
      // 付费才恢复增强。expireUnconfirmedMatches 的退款读 Match.enhancedMode（冻结值），不受影响。
      const enhancedIds = candidates.filter((c) => c.enhanced).map((c) => c.userId);
      if (enhancedIds.length > 0) {
        await this.prisma.userMatchPreferences.updateMany({
          where: { userId: { in: enhancedIds }, mode },
          data: { enhancedModeEnabled: false, ...(mode === 'friend' ? { friendEnhancedCells: 1 } : {}) },
        });
      }

      await this.prisma.matchJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', completedAt: new Date(), totalMatched },
      });

      this.logger.log(
        `Match job ${jobId} (mode=${mode}) completed: ${totalMatched} pairs, ` +
        `${unmatchedSearchingIds.length} unmatched, ${(result.emptyPoolUserIds ?? []).length} refunds`,
      );
    } catch (error: any) {
      if (totalMatched > 0 || skippedPairs > 0) {
        this.logger.error(
          `Match job ${jobId} failed mid-run: ${totalMatched} committed, ${skippedPairs} skipped`,
        );
      }
      this.logger.error(`Match job ${jobId} failed:`, error);
      await this.prisma.matchJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', completedAt: new Date(), totalMatched, errorMessage: error.message },
      });
      throw error;
    }
  }

  // ─── 候选池（buildCandidates 加 mode，§3.4 / §3.6） ───────────────
  private async buildCandidates(mode: ModeStr, activeVersionId?: string): Promise<CandidateProfile[]> {
    const states = await this.prisma.userModeState.findMany({
      where: {
        mode,
        matchState: 'searching',
        user: { status: 'ACTIVE', profile: { isNot: null } },
      },
      select: { userId: true },
    });
    const ids = states.map((s) => s.userId);
    if (ids.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      include: {
        profile: true,
        matchPreferences: { where: { mode } },
        answers: activeVersionId
          ? {
              where: { questionnaireVersionId: activeVersionId },
              include: { question: { select: { type: true, order: true, group: true, code: true, semantics: true, hardness: true, weight: true, target: true } } },
            }
          : { include: { question: { select: { type: true, order: true, group: true, code: true, semantics: true, hardness: true, weight: true, target: true } } } },
      },
    });

    // 恋人：要求 gender/genderPref/age 齐全；朋友：放宽，profile 存在即可
    const validUsers = users.filter((u) => {
      if (!u.profile) return false;
      if (mode === 'romantic') {
        return !!u.profile.gender && !!u.profile.genderPref && u.profile.age != null;
      }
      return true;
    });

    const profiles: CandidateProfile[] = validUsers.map((u) => {
      const prefs = u.matchPreferences[0] ?? null;
      const enhanced = !!prefs?.enhancedModeEnabled;
      const enhancedCost = mode === 'romantic'
        ? ENERGY_COST_ROMANTIC
        : Math.min(5, Math.max(1, prefs?.friendEnhancedCells ?? 1));
      return {
        userId: u.id,
        gender: u.profile!.gender || '',
        genderPref: u.profile!.genderPref || 'any',
        age: u.profile!.age ?? 0,
        city: u.profile!.city || '',
        school: u.profile!.school || '',
        grade: u.profile!.grade || '',
        interests: u.profile!.interests || [],
        // v2 契约的 S8：签名/自我介绍走 profile 而不落问卷题——那就必须真的送过去。
        // ML 的 extractor 一直声明了 bio 字段，此前 NestJS 从未发送（审计发现的死路）。
        bio: [u.profile!.bio, u.profile!.signature].filter(Boolean).join(' ') || undefined,
        activities: (prefs?.preferredActivities as string[]) || [],
        answers: u.answers.map((a) => ({
          questionId: a.questionId,
          questionType: a.question.type,
          value: a.value,
          questionOrder: a.question.order,
          questionGroup: a.question.group ?? undefined,
          // 问卷 v2 元数据：打分器按 semantics/weight 定权，硬门按 code 找题。
          // v1 老题这些字段是缺省值（code=null / similar / soft / 1），行为不变。
          questionCode: a.question.code ?? undefined,
          semantics: a.question.semantics,
          hardness: a.question.hardness,
          weight: a.question.weight,
          target: a.question.target,
        })),
        _prefs: prefs,
        enhanced,
        enhancedCost: enhanced ? enhancedCost : undefined,
      };
    });

    // E 规则（拉黑跨两模式）：当前 schema 无拉黑表，过滤为 no-op；
    // 接入拉黑表后，在此剔除「任一方拉黑对方」的候选对（两模式共用同一名单）。
    return this.filterBlacklisted(profiles);
  }

  // 拉黑过滤占位（E 规则）：当前无拉黑表，原样返回。
  private filterBlacklisted(profiles: CandidateProfile[]): CandidateProfile[] {
    return profiles;
  }

  // ─── 通用确认：成为恋人 / 朋友（双确认语义，§3.4） ───────────────
  async confirmRelationship(userId: string, matchId: string) {
    // 行为埋点（P0-2）：CAS 生效才记 confirmed；事务提交后落库，失败不影响确认
    let confirmedEvt: { mode: ModeStr; userAId: string; userBId: string } | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const m = await tx.match.findUnique({ where: { id: matchId } });
      if (!m) throw new NotFoundException('Match not found');
      if (m.userAId !== userId && m.userBId !== userId) {
        throw new ForbiddenException('You do not belong to this match');
      }

      const isFriend = m.mode === MatchMode.FRIEND;
      const modeStr: ModeStr = fromMatchMode(m.mode);
      const TEMP = isFriend ? FRIEND_TEMP : ['MATCHED_ROMANTIC', 'ROMANTIC_CONFIRMING'];
      const CONFIRMING = confirmingStatusOf(modeStr);
      const FINAL = confirmedStatusOf(modeStr);

      if (!TEMP.includes(m.status)) throw new BadRequestException('Cannot confirm in the current status');
      // 兜底：48h 已过的临时对话不允许再确认（应已被 scheduler 置 EXPIRED）
      if (Date.now() > m.createdAt.getTime() + CONFIRM_WINDOW_MS) {
        throw new BadRequestException('Confirmation window has expired');
      }
      // 恋人独占（B 规则）：确认前再校验本方没有其它已确认恋人，关闭 rematch/skip 残留的双恋人缺口
      if (!isFriend) {
        const existingRel = await tx.match.findFirst({
          where: {
            id: { not: matchId },
            mode: MatchMode.ROMANTIC,
            status: 'RELATIONSHIP_ROMANTIC',
            OR: [{ userAId: userId }, { userBId: userId }],
          },
          select: { id: true },
        });
        if (existingRel) throw new BadRequestException('You already have a partner, cannot confirm a new partner match');
      }
      const isA = m.userAId === userId;
      if (isA ? m.userAConfirmed : m.userBConfirmed) {
        return { status: 'WAITING', message: 'You have confirmed, waiting for the other party to confirm...' };
      }

      // CAS：带 status 守卫更新本方确认 + 推进到 CONFIRMING
      const res = await tx.match.updateMany({
        where: { id: matchId, status: { in: TEMP as any } },
        data: {
          ...(isA ? { userAConfirmed: true } : { userBConfirmed: true }),
          status: CONFIRMING as any,
        },
      });
      if (res.count === 0) throw new BadRequestException('Cannot confirm in the current status');
      confirmedEvt = { mode: modeStr, userAId: m.userAId, userBId: m.userBId };

      // 本方 UMS -> confirming。朋友：已有已确认朋友者保持 relationship 不降级；
      // 恋人：无条件推进（恋人独占，不存在「保留其它已确认恋人」语义，误用该守卫会留下不一致状态）。
      await tx.userModeState.updateMany({
        where: {
          userId,
          mode: modeStr,
          ...(isFriend ? { matchState: { notIn: ['relationship'] } } : {}),
        },
        data: { matchState: 'confirming' },
      });

      const u = await tx.match.findUnique({ where: { id: matchId } });
      if (u && u.userAConfirmed && u.userBConfirmed) {
        const now = new Date();
        await tx.match.update({
          where: { id: matchId },
          data: {
            status: FINAL as any,
            confirmedAt: now,
            ...(isFriend ? {} : { relationshipStartedAt: now }),
          },
        });
        await tx.userModeState.updateMany({
          where: { userId: { in: [m.userAId, m.userBId] }, mode: modeStr },
          data: { matchState: 'relationship' },
        });
        // 双方通知：关系/朋友确立
        await tx.notification.createMany({
          data: [m.userAId, m.userBId].map((uid) => ({
            userId: uid,
            type: 'relationship_confirmed',
            title: isFriend ? "You're now friends" : "You're now a couple",
            body: isFriend
              ? "You've both confirmed — you're friends now!"
              : "You've both confirmed — your relationship is official!",
            metadata: { matchId, mode: modeStr },
            isRead: false,
          })),
        });
        return {
          status: FINAL,
          message: isFriend ? "You've both confirmed — you're friends now!" : "You've both confirmed — your relationship is official!",
        };
      }
      return { status: 'WAITING', message: 'You have confirmed, waiting for the other party to confirm...' };
    });

    if (confirmedEvt) {
      // SSE：relationship_confirmed 通知（事务已提交）
      this.realtime.emitToUser(confirmedEvt.userAId, { type: 'notification' });
      this.realtime.emitToUser(confirmedEvt.userBId, { type: 'notification' });
      void this.matchFeedback.logEvent({
        matchId,
        mode: confirmedEvt.mode,
        userAId: confirmedEvt.userAId,
        userBId: confirmedEvt.userBId,
        actorId: userId,
        type: 'confirmed',
      });
    }
    return result;
  }

  // ─── 通用解除（删除关系，恋人 / 朋友 + 发通知 E 规则，§3.4） ────────
  async dissolveMatch(userId: string, matchId: string, reason?: string) {
    const dissolvableStatuses = [
      'MATCHED_ROMANTIC', 'ROMANTIC_CONFIRMING', 'RELATIONSHIP_ROMANTIC',
      'MATCHED_FRIEND', 'FRIEND_CONFIRMING', 'FRIEND_CONFIRMED',
    ];

    const outcome = await this.prisma.$transaction(async (tx) => {
      const m = await tx.match.findUnique({ where: { id: matchId } });
      if (!m) throw new NotFoundException('Match not found');
      if (m.userAId !== userId && m.userBId !== userId) {
        throw new ForbiddenException('You do not belong to this match');
      }
      if (!dissolvableStatuses.includes(m.status)) {
        throw new BadRequestException('Cannot end in the current status');
      }

      const modeStr: ModeStr = fromMatchMode(m.mode);
      // 埋点用：临时对话阶段的解除语义是「拒绝」，永久关系阶段才是「解除」
      const wasTemp = isTempStatus(m.status);
      await tx.match.update({
        where: { id: matchId },
        data: {
          status: 'DISSOLVED',
          dissolvedBy: userId,
          dissolvedAt: new Date(),
          dissolveReason: reason || null,
        },
      });

      // 对方收到通知：「X 解除了关系」
      const partnerId = m.userAId === userId ? m.userBId : m.userAId;
      const myNickname = await this.nicknameOf(tx, userId);
      await tx.notification.create({
        data: {
          userId: partnerId,
          type: 'relationship_dissolved',
          title: modeStr === 'friend' ? 'Friendship ended' : 'Relationship ended',
          body: `${myNickname} ended your ${modeStr === 'friend' ? 'friendship' : 'relationship'}.`,
          metadata: { matchId, mode: modeStr },
          isRead: false,
        },
      });

      // UMS 回收（复用 recompute 判定，保证一致）
      if (modeStr === 'romantic') {
        // 恋人：双方 mode='romantic' UMS -> idle（恋人匹配可再次主动开启）
        await tx.userModeState.updateMany({
          where: { userId: { in: [m.userAId, m.userBId] }, mode: 'romantic', matchState: { notIn: ['searching'] } },
          data: { matchState: 'idle', matchSearchingSince: null },
        });
      } else {
        // 朋友：仅解除这一条，重算双方 UMS（仍有朋友->保持，全空->idle）
        await this.recomputeModeStateAfterExpire(tx, [m.userAId, m.userBId], 'friend');
      }

      return { mode: modeStr, wasTemp, userAId: m.userAId, userBId: m.userBId };
    });

    // SSE：relationship_dissolved 通知发给对方（事务已提交）
    this.realtime.emitToUser(outcome.userAId === userId ? outcome.userBId : outcome.userAId, {
      type: 'notification',
    });
    // 行为埋点（P0-2）：事务提交后落库，失败不影响解除
    void this.matchFeedback.logEvent({
      matchId,
      mode: outcome.mode,
      userAId: outcome.userAId,
      userBId: outcome.userBId,
      actorId: userId,
      type: outcome.wasTemp ? 'rejected' : 'dissolved',
      meta: reason ? { reason } : {},
    });

    this.logger.log(`Match ${matchId} dissolved by ${userId} (mode=${outcome.mode})`);
    return {
      message: outcome.mode === 'friend' ? 'Friendship ended' : 'Relationship ended, you can start matching again',
    };
  }

  private async nicknameOf(tx: Prisma.TransactionClient, userId: string): Promise<string> {
    const p = await tx.profile.findUnique({ where: { userId }, select: { nickname: true } });
    return p?.nickname || 'Someone';
  }

  // ─── 48h 通用过期清理（恋人 + 朋友临时对话，§3.5） ────────────────
  async expireUnconfirmedMatches() {
    const cutoff = new Date(Date.now() - CONFIRM_WINDOW_MS);
    const stale = await this.prisma.match.findMany({
      where: {
        status: { in: ['MATCHED_ROMANTIC', 'ROMANTIC_CONFIRMING', 'MATCHED_FRIEND', 'FRIEND_CONFIRMING'] as any },
        createdAt: { lte: cutoff },
      },
      select: {
        id: true, mode: true, userAId: true, userBId: true, createdAt: true,
        enhancedMode: true, enhancedUserEnergy: true, metadata: true,
      },
    });
    if (stale.length === 0) return 0;

    // 退款开关在循环外读一次（每条 match 一致），避免在每个事务内反复查 SystemConfig
    const refundOnExpire = await this.isRefundOnExpireEnabled();

    let expired = 0;
    for (const m of stale) {
      const modeStr: ModeStr = fromMatchMode(m.mode);
      const didExpire = await this.prisma.$transaction(async (tx) => {
        // 1. 置 EXPIRED（对话从 Chat 列表隐藏）；CAS 守卫避免与 confirm 竞态
        const res = await tx.match.updateMany({
          where: {
            id: m.id,
            status: { in: ['MATCHED_ROMANTIC', 'ROMANTIC_CONFIRMING', 'MATCHED_FRIEND', 'FRIEND_CONFIRMING'] as any },
          },
          data: { status: 'EXPIRED' },
        });
        if (res.count === 0) return false; // 已被并发确认，跳过

        // 2. 双方各发一条「未确认已过期」通知
        await tx.notification.createMany({
          data: [m.userAId, m.userBId].map((uid) => ({
            userId: uid,
            type: 'match_expired',
            title: 'Match expired',
            body: 'This match expired because it was not confirmed by both of you within 48 hours.',
            metadata: { mode: modeStr },
            isRead: false,
          })),
        });

        // 3. UMS 回收
        await this.recomputeModeStateAfterExpire(tx, [m.userAId, m.userBId], modeStr);

        // 4. 增强配对 48h 未确认退款（可选开关，默认不退；§3.5 / §10.3）
        //    与 EXPIRED + 双方通知在同一事务内原子执行（§10.3）：避免退款执行中途
        //    crash 导致「已 EXPIRED 但能量未退」，并保证 match_expired 与
        //    energy_refunded 两条通知同批提交、同时到达前端。增强字段在 CAS 成功后
        //    于本事务内重读，规避与并发 confirmRelationship 的读写竞态。
        if (refundOnExpire) {
          const fresh = await tx.match.findUnique({
            where: { id: m.id },
            select: { enhancedMode: true, enhancedUserEnergy: true, metadata: true },
          });
          if (fresh?.enhancedMode && fresh.enhancedUserEnergy) {
            // 退款收款方 = 增强发起方：取 executeMatchJob 写入的 metadata.enhancedUserId；
            // 历史数据（无该字段）回退到 userAId，并校验必须属于本 match 双方之一。
            const recordedId = (fresh.metadata as any)?.enhancedUserId;
            const refundUserId =
              recordedId === m.userAId || recordedId === m.userBId ? recordedId : m.userAId;
            // 退款额度：恋人一对一，过期即退全部预扣（=enhancedUserEnergy，通常 3）；
            // 朋友按「每个朋友 1 格」——enhancedUserEnergy 存的是本轮总格数 N（=保证朋友数），
            // 每条朋友 Match 都带 N，若按 N 退，K 条过期就退 K×N（最多 5×）超退。故朋友固定退 1 格。
            const refundAmount = modeStr === 'romantic' ? fresh.enhancedUserEnergy : 1;
            // 去重键锚定到本次配对尝试（createdAt 每轮重配时被 upsert 重置）：Match 行按
            // @@unique(userA,userB,mode) 跨轮复用同一 id，若仅按 matchId 去重，第二轮同对再过期的
            // 合法退款会被第一轮的 REFUND 流水挡掉。带轮次锚点后跨轮可退、同轮重扫仍幂等。
            const dedupeKey = `expire:${m.id}:${m.createdAt.getTime()}`;
            await this.energyService.refundInTx(
              tx, refundUserId, modeStr, refundAmount, m.id,
              '增强匹配 48 小时内未确认，退还能量', 'unconfirmed_48h', dedupeKey,
            );
          }
        }
        return true;
      });
      if (didExpire) {
        expired++;
        // SSE：match_expired（+可能的退款）通知，事务已提交
        this.realtime.emitToUser(m.userAId, { type: 'notification' });
        this.realtime.emitToUser(m.userBId, { type: 'notification' });
      }
    }

    if (expired > 0) this.logger.log(`已过期 ${expired} 个超 48h 未确认的临时对话`);
    return expired;
  }

  // SystemConfig 开关：energy.refundOnExpire（默认 false，§10.3）
  private async isRefundOnExpireEnabled(): Promise<boolean> {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { key: 'energy.refundOnExpire' } });
    return cfg?.value === true || (cfg?.value as any) === 'true';
  }

  // ─── UMS 回收判定（恋人 / 朋友分支，§3.5） ───────────────────────
  private async recomputeModeStateAfterExpire(
    tx: Prisma.TransactionClient,
    userIds: string[],
    mode: ModeStr,
  ) {
    for (const userId of userIds) {
      if (mode === 'romantic') {
        // 恋人：过期/解除后若 UMS 处于 matched/confirming（非 relationship）-> idle
        await tx.userModeState.updateMany({
          where: { userId, mode: 'romantic', matchState: { in: ['matched', 'confirming'] } },
          data: { matchState: 'idle', matchSearchingSince: null },
        });
        continue;
      }
      // 朋友：扫描是否仍有任何活跃朋友会话（临时 + 永久）
      const confirmedCount = await tx.match.count({
        where: {
          mode: MatchMode.FRIEND, dissolvedAt: null, status: { in: FRIEND_CONFIRMED as any },
          OR: [{ userAId: userId }, { userBId: userId }],
        },
      });
      const tempCount = await tx.match.count({
        where: {
          mode: MatchMode.FRIEND, dissolvedAt: null, status: { in: FRIEND_TEMP as any },
          OR: [{ userAId: userId }, { userBId: userId }],
        },
      });
      const next = confirmedCount > 0 ? 'relationship' : (tempCount > 0 ? 'matched' : 'idle');
      await tx.userModeState.updateMany({
        where: { userId, mode: 'friend', matchState: { notIn: ['searching'] } },
        data: { matchState: next, ...(next === 'idle' ? { matchSearchingSince: null } : {}) },
      });
    }
  }

  // ─── 旧提议（PENDING_CONFIRM）兼容清理（§3.6，只清历史脏数据） ─────
  async expireStaleProposals() {
    const cutoff = new Date(Date.now() - MatchingService.PROPOSAL_TTL_MS);
    const expired = await this.prisma.match.updateMany({
      where: { status: 'PENDING_CONFIRM', createdAt: { lte: cutoff } },
      data: { status: 'EXPIRED' },
    });
    if (expired.count > 0) {
      this.logger.log(`已过期 ${expired.count} 个超 48h 的旧 PENDING_CONFIRM 提议（兼容清理）`);
    }
    return expired.count;
  }

  // ─── 获取匹配偏好（按 mode，§3.4） ──────────────────────────────
  async getMatchPreferences(userId: string, mode: ModeStr = 'romantic') {
    const prefs = await this.prisma.userMatchPreferences.findUnique({
      where: { userId_mode: { userId, mode } },
    });
    if (!prefs) {
      return {
        mode,
        requireSameCity: false,
        requireSameUniversity: false,
        requireSameMajor: false,
        preferredNationalities: [],
        preferredMbti: [],
        preferredGender: null,
        ageMin: null,
        ageMax: null,
        universityStage: null,
        preferredInterests: [],
        preferredActivities: [],
        friendRequirements: null,
        enhancedModeEnabled: false,
        friendEnhancedCells: 1,
        matchBasis: 'both',
        extraMatchInfo: null,
      };
    }
    return prefs;
  }

  // ─── 保存匹配偏好（按 mode，§3.4） ──────────────────────────────
  async setMatchPreferences(userId: string, dto: any) {
    const mode: ModeStr = normalizeMode(dto.mode);
    const data: any = { ...dto };
    delete data.mode;
    // 增强开关（enhancedModeEnabled / friendEnhancedCells）只能由 startMatchForUser 权威写入——
    // 那里会预扣能量。若允许经此端点持久化，用户不花能量就能让 buildCandidates 读到 enhanced=true，
    // 获得无视阈值的强配（免费白嫖付费功能）。此处一律剥离。
    delete data.enhancedModeEnabled;
    delete data.friendEnhancedCells;

    // universityStage 多值白名单过滤
    if (data.universityStage !== undefined) {
      if (typeof data.universityStage === 'string') {
        const allowed = ['undergraduate', 'master', 'doctor'];
        const filtered = Array.from(
          new Set(
            data.universityStage
              .split(',')
              .map((s: string) => s.trim())
              .filter((s: string) => allowed.includes(s)),
          ),
        );
        data.universityStage = filtered.length > 0 ? filtered.join(',') : null;
      } else {
        data.universityStage = null;
      }
    }

    const prefs = await this.prisma.userMatchPreferences.upsert({
      where: { userId_mode: { userId, mode } },
      create: { userId, mode, ...data },
      update: data,
    });

    // 用户调整偏好 = 想重新参与匹配：清除本轮 no_match 标记（仅该模式）
    await this.prisma.userModeState.updateMany({
      where: { userId, mode, weeklyMatchNote: 'no_match' },
      data: { weeklyMatchNote: null },
    });

    return prefs;
  }

  // ─── 获取我的匹配结果（按 mode 兼容前端，§3.4） ──────────────────
  async getMyMatchResult(userId: string, mode: ModeStr = 'romantic') {
    const status = await this.getFullMatchStatus(userId, mode);
    if (mode === 'friend') {
      const matches = (status as any).matches ?? [];
      return { matched: matches.length > 0, mode, state: (status as any).state, matches };
    }
    const m = (status as any).match;
    if (!m) return { matched: false, mode, status: 'NO_MATCH', state: (status as any).state };
    return {
      matched: true,
      mode,
      matchId: m.id,
      status: m.status,
      state: (status as any).state,
      myConfirmed: m.myConfirmed,
      partnerConfirmed: m.partnerConfirmed,
      score: m.score,
      matchedAt: m.matchedAt,
      relationshipStartedAt: m.relationshipStartedAt,
      confirmedAt: m.confirmedAt,
      remainingMs: m.remainingMs,
      partner: (status as any).partner,
    };
  }

  // ─── 恋爱里程碑（改读 RELATIONSHIP_ROMANTIC，§3.4） ──────────────
  async getMilestones(userId: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        mode: MatchMode.ROMANTIC,
        status: 'RELATIONSHIP_ROMANTIC',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!match) return { state: 'none' };

    const startedAt = match.relationshipStartedAt || match.createdAt;
    const daysTogether = Math.max(
      1,
      Math.floor((Date.now() - startedAt.getTime()) / 86400000) + 1,
    );

    const [messageCount, postCount, profiles] = await Promise.all([
      this.prisma.message.count({ where: { matchId: match.id } }),
      this.prisma.squarePost.count({ where: { coupleMatchId: match.id } }),
      this.prisma.profile.findMany({
        where: { userId: { in: [match.userAId, match.userBId] } },
        select: { userId: true, interests: true },
      }),
    ]);

    const myInterests = profiles.find((p) => p.userId === userId)?.interests || [];
    const partnerInterests = profiles.find((p) => p.userId !== userId)?.interests || [];
    const partnerSet = new Set(partnerInterests);
    const sharedInterests = myInterests.filter((i) => partnerSet.has(i));

    return {
      state: 'relationship',
      daysTogether,
      messageCount,
      postCount,
      sharedInterests,
      matchScore: match.score,
      startedAt,
    };
  }

  // ─── 兼容别名（旧端点：不含 matchId 的 confirm/reject/dissolve） ──────
  // 旧前端调用 confirmMatch/rejectMatch/dissolveRelationship 时，定位用户当前恋人临时对话后转发。

  /** @deprecated 旧端点兼容：定位恋人临时对话后调 confirmRelationship */
  async confirmMatch(userId: string) {
    const m = await this.findActiveRomanticTemp(userId);
    return this.confirmRelationship(userId, m.id);
  }

  /** @deprecated 旧端点兼容：拒绝 = 解除当前恋人临时对话 */
  async rejectMatch(userId: string) {
    const m = await this.findActiveRomanticTemp(userId);
    return this.dissolveMatch(userId, m.id, 'User rejected the match');
  }

  /** @deprecated 旧端点兼容（带 proposalId）：转发 confirmRelationship */
  async confirmProposal(userId: string, proposalId: string) {
    return this.confirmRelationship(userId, proposalId);
  }

  /** @deprecated 旧端点兼容（带 proposalId）：转发 dissolveMatch */
  async rejectProposal(userId: string, proposalId: string) {
    return this.dissolveMatch(userId, proposalId, 'User rejected the match');
  }

  /** @deprecated 旧端点兼容：解除当前恋人关系 */
  async dissolveRelationship(userId: string, reason?: string) {
    const m = await this.prisma.match.findFirst({
      where: {
        mode: MatchMode.ROMANTIC,
        status: { in: ROMANTIC_ACTIVE as any },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!m) throw new NotFoundException('You have no active relationship at the moment');
    return this.dissolveMatch(userId, m.id, reason);
  }

  private async findActiveRomanticTemp(userId: string) {
    const m = await this.prisma.match.findFirst({
      where: {
        mode: MatchMode.ROMANTIC,
        status: { in: ['MATCHED_ROMANTIC', 'ROMANTIC_CONFIRMING'] as any },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!m) throw new NotFoundException('No match pending confirmation');
    return m;
  }

  // ─── 扫码加好友：按连接码建立已确认朋友会话（直接可聊）───────────────
  async connectByCode(userId: string, code: string) {
    const c = (code || '').trim();
    if (!c) throw new BadRequestException('Connection code cannot be empty');
    const target = await this.prisma.user.findUnique({
      where: { connectCode: c },
      select: { id: true, status: true },
    });
    if (!target) throw new NotFoundException('Invalid connection code');
    return this.connectByUserId(userId, target.id, target.status, 'qr-connect');
  }

  // 按 userId 直接加好友（搜索加好友 / 扫码加好友共用）——双方立即确认建立 FRIEND_CONFIRMED。
  async connectByUserId(
    userId: string,
    targetId: string,
    targetStatus?: string,
    source = 'search-connect',
  ) {
    if (!targetId) throw new BadRequestException('Invalid target user');
    if (targetId === userId) throw new BadRequestException('You cannot add yourself');
    let status = targetStatus;
    if (status === undefined) {
      const t = await this.prisma.user.findUnique({
        where: { id: targetId },
        select: { status: true },
      });
      if (!t) throw new NotFoundException('User not found');
      status = t.status;
    }
    if (status === 'BANNED') throw new BadRequestException('This user is unavailable');

    // 有序键，保证 (A,B) 与 (B,A) 命中同一条 Match
    const [aId, bId] = [userId, targetId].sort();
    const now = new Date();
    const match = await this.prisma.$transaction(async (tx) => {
      const m = await tx.match.upsert({
        where: { userAId_userBId_mode: { userAId: aId, userBId: bId, mode: MatchMode.FRIEND } },
        create: {
          userAId: aId, userBId: bId, mode: MatchMode.FRIEND,
          status: confirmedStatusOf('friend') as any,
          userAConfirmed: true, userBConfirmed: true, confirmedAt: now,
          score: null, metadata: { source },
        },
        update: {
          status: confirmedStatusOf('friend') as any,
          userAConfirmed: true, userBConfirmed: true, confirmedAt: now,
          dissolvedAt: null, dissolvedBy: null, dissolveReason: null,
        },
      });
      for (const uid of [aId, bId]) await this.ensureModeState(tx, uid, 'friend');
      await tx.userModeState.updateMany({
        where: { userId: { in: [aId, bId] }, mode: 'friend' },
        data: { matchState: 'relationship' },
      });
      await tx.notification.create({
        data: {
          userId: targetId,
          type: 'friend_added',
          title: 'New friend',
          body: 'Someone connected with you — open the chat and say hi!',
          metadata: { matchId: m.id, mode: 'friend' },
          isRead: false,
        },
      });
      return m;
    });
    // SSE：friend_added 通知（事务已提交）
    this.realtime.emitToUser(targetId, { type: 'notification' });
    const partner = await this.profilesService.getPublicProfile(targetId);
    return { matchId: match.id, message: 'Added — start chatting!', partner };
  }

  // ─── Jobs & Admin ─────────────────────────────────────────
  async listJobs(params: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      this.prisma.matchJob.findMany({
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { matches: true } } },
      }),
      this.prisma.matchJob.count(),
    ]);

    // 分页列表统一 { items }（管理端契约）
    return { items: jobs, total, page, limit };
  }

  async getJobResult(jobId: string) {
    const job = await this.prisma.matchJob.findUnique({
      where: { id: jobId },
      include: {
        matches: {
          include: {
            userA: { select: { email: true, profile: { select: { nickname: true } } } },
            userB: { select: { email: true, profile: { select: { nickname: true } } } },
          },
        },
      },
    });
    if (!job) throw new NotFoundException('匹配任务不存在');
    return job;
  }

  async retryFailedJob(jobId: string) {
    const job = await this.prisma.matchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('匹配任务不存在');
    if (job.status !== 'FAILED') throw new BadRequestException('仅失败任务可重试');

    await this.prisma.matchJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', errorMessage: null },
    });

    // 从 triggeredBy 还原 mode（triggerMatchJob 写入 `${by}:${mode}`）
    const mode: ModeStr = job.triggeredBy?.endsWith(':friend') ? 'friend' : 'romantic';
    await this.matchQueue.add(MATCH_JOB, { jobId, mode }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
    return { message: 'Task has been re-queued' };
  }

  async listAllMatches(params: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const [matches, total] = await Promise.all([
      this.prisma.match.findMany({
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          userA: { select: { email: true, profile: { select: { nickname: true } } } },
          userB: { select: { email: true, profile: { select: { nickname: true } } } },
          matchJob: { select: { id: true, status: true } },
        },
      }),
      this.prisma.match.count(),
    ]);

    // 分页列表统一 { items }（管理端契约）
    return { items: matches, total, page, limit };
  }
}
