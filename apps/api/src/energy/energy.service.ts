import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ModeStr } from '../matching/mode.util';
import type { EnergyClaimType, EnergyPackageId } from './dto/energy.dto';

// ─── 能量系统常量（§10.0 / §10.2） ──────────────────────────────
/** 恋爱增强固定消耗格数（J 规则 4） */
export const ENERGY_COST_ROMANTIC = 3;
/** 朋友增强可选档位下限（= 保证匹配 1 个朋友） */
export const FRIEND_CELLS_MIN = 1;
/** 朋友增强可选档位上限（= 保证匹配 5 个朋友） */
export const FRIEND_CELLS_MAX = 5;

// ─── 充值档位（§10.4，本期 mock） ──────────────────────────────
/** packageId -> 能量格数映射；价格仅前端展示，后端只认格数 */
export const ENERGY_PACKAGES: Record<EnergyPackageId, { cells: number; priceCny: number }> = {
  pkg_30: { cells: 30, priceCny: 30 },
  pkg_60: { cells: 60, priceCny: 58 },
  pkg_100: { cells: 100, priceCny: 88 },
};

// ─── 免费领取规则（§10.4） ─────────────────────────────────────
/** registration / daily-checkin 固定 1 格；task-complete 默认 1 格 */
const CLAIM_GRANT: Record<EnergyClaimType, number> = {
  registration: 1,
  'daily-checkin': 1,
  'task-complete': 1,
};

/** 可用余额视图（GET /energy/balance 返回结构） */
export interface BalanceView {
  totalEnergy: number;
  usedEnergy: number;
  availableEnergy: number;
}

/**
 * 能量服务（§10.2）：增强模式付费能量账户 + 消耗/退还/充值/领取。
 *
 * 核心不变量：availableEnergy = totalEnergy - usedEnergy >= 0 恒成立（应用层计算，不落库）。
 * 每笔变动写一条 EnergyTransaction（只增不改），balanceAfter 记录交易后可用余额快照供对账。
 */
@Injectable()
export class EnergyService {
  private readonly logger = new Logger(EnergyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────────
  // 账户基础
  // ──────────────────────────────────────────────────────────

  /** 懒创建账户（首次访问即 upsert 空账户）。可传入事务客户端在同一事务内执行。 */
  async getOrCreateBalance(
    userId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.energyBalance.upsert({
      where: { userId },
      create: { userId, totalEnergy: 0, usedEnergy: 0 },
      update: {},
    });
  }

  /** 当前可用能量（total - used）。 */
  async getAvailableEnergy(userId: string): Promise<number> {
    const b = await this.getOrCreateBalance(userId);
    return b.totalEnergy - b.usedEnergy;
  }

  /** 余额视图（GET /energy/balance）。 */
  async getBalanceView(userId: string): Promise<BalanceView> {
    const b = await this.getOrCreateBalance(userId);
    return {
      totalEnergy: b.totalEnergy,
      usedEnergy: b.usedEnergy,
      availableEnergy: b.totalEnergy - b.usedEnergy,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 消耗（CONSUME）
  // ──────────────────────────────────────────────────────────

  /**
   * 预扣能量——在 startMatch 的同一事务内调用（§3.4），由 MatchingService 注入使用。
   * available < cost 抛 BadRequestException；usedEnergy += cost，写 CONSUME 流水。
   */
  async consumeInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    cost: number,
    mode: ModeStr,
    matchId: string | null,
    reason: string,
  ): Promise<BalanceView> {
    const b = await this.getOrCreateBalance(userId, tx);
    // 原子守卫扣减：仅当「扣后 usedEnergy 不超过 totalEnergy」时才命中，杜绝并发双花 / 余额转负。
    // updateMany 是单条带 WHERE 的 UPDATE，DB 在行锁下串行求值 WHERE：后到者看到前者已增的
    // usedEnergy 而条件不再成立 → count=0 → 抛「能量不足」。（totalEnergy 只增不减，用读时快照做上界安全）
    const consumed = await tx.energyBalance.updateMany({
      where: { userId, usedEnergy: { lte: b.totalEnergy - cost } },
      data: { usedEnergy: { increment: cost } },
    });
    if (consumed.count === 0) {
      throw new BadRequestException('Not enough energy, please top up');
    }
    const updated = await this.getOrCreateBalance(userId, tx);
    const balanceAfter = updated.totalEnergy - updated.usedEnergy;
    await tx.energyTransaction.create({
      data: {
        userId,
        type: 'CONSUME',
        amountEnergy: cost,
        balanceAfter,
        relatedMatchId: matchId,
        relatedMatchMode: mode,
        reason,
      },
    });
    return {
      totalEnergy: updated.totalEnergy,
      usedEnergy: updated.usedEnergy,
      availableEnergy: balanceAfter,
    };
  }

  /** 自带事务的预扣（无外部事务时使用，如单独的消耗场景）。 */
  async consume(
    userId: string,
    cost: number,
    mode: ModeStr,
    matchId: string | null,
    reason: string,
  ): Promise<BalanceView> {
    return this.prisma.$transaction((tx) => this.consumeInTx(tx, userId, cost, mode, matchId, reason));
  }

  // ──────────────────────────────────────────────────────────
  // 退还（REFUND）
  // ──────────────────────────────────────────────────────────

  /**
   * 退还能量——空池（§3.6）或 48h 未确认（可选，§10.3）。
   * 幂等：同 matchId + REFUND 不重复退；dec = min(cost, usedEnergy) 防 usedEnergy 转负。
   * refundReason 区分两类场景，落入通知 metadata 供前端渲染不同文案（§6.6）。
   */
  async refund(
    userId: string,
    mode: ModeStr,
    cost: number,
    matchId: string | null,
    reason: string,
    refundReason: 'empty_pool' | 'unconfirmed_48h' = 'empty_pool',
    dedupeKey?: string,
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.refundInTx(tx, userId, mode, cost, matchId, reason, refundReason, dedupeKey),
    );
  }

  /**
   * 退还能量（事务内版本）——供 MatchingService.expireUnconfirmedMatches 在同一事务内
   * 与 EXPIRED + 双方通知原子执行（§10.3）。幂等去重依赖同 matchId + REFUND 流水。
   * 与 refund() 共享同一实现，避免逻辑分叉。
   */
  async refundInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    mode: ModeStr,
    cost: number,
    matchId: string | null,
    reason: string,
    refundReason: 'empty_pool' | 'unconfirmed_48h' = 'empty_pool',
    dedupeKey?: string,
  ): Promise<void> {
    // 幂等去重：有 matchId 按 matchId；否则（无 match 的批量退款，如 job 级空池/未达保证）按 dedupeKey。
    if (matchId) {
      const dup = await tx.energyTransaction.findFirst({
        where: { relatedMatchId: matchId, type: 'REFUND' },
      });
      if (dup) return;
    } else if (dedupeKey) {
      const dup = await tx.energyTransaction.findFirst({
        where: { userId, type: 'REFUND', metadata: { path: ['dedupeKey'], equals: dedupeKey } },
      });
      if (dup) return;
    }
    const b = await this.getOrCreateBalance(userId, tx);
    const dec = Math.min(cost, b.usedEnergy); // 不退超过已用，防 usedEnergy 转负
    if (dec <= 0) return; // 无可退（已用为 0 / 已退完）：不写 0 格流水与通知
    const updated = await tx.energyBalance.update({
      where: { userId },
      data: { usedEnergy: { decrement: dec } },
    });
    const balanceAfter = updated.totalEnergy - updated.usedEnergy;
    await tx.energyTransaction.create({
      data: {
        userId,
        type: 'REFUND',
        amountEnergy: dec,
        balanceAfter,
        relatedMatchId: matchId,
        relatedMatchMode: mode,
        reason,
        ...(dedupeKey ? { metadata: { dedupeKey } } : {}),
      },
    });
    // 退款通知：metadata.refundReason 供前端渲染「空池」/「48h 未确认」文案（§6.6）
    // 通知 body 用英文，按 refundReason 区分场景；reason 仍存入流水记录
    const refundBody =
      refundReason === 'unconfirmed_48h'
        ? `Your enhanced match wasn't confirmed within 48 hours, so ${dec} energy ${dec === 1 ? 'cell has' : 'cells have'} been refunded.`
        : `No match was available this round, so ${dec} energy ${dec === 1 ? 'cell has' : 'cells have'} been refunded.`;
    await tx.notification.create({
      data: {
        userId,
        type: 'energy_refunded',
        title: 'Energy refunded',
        body: refundBody,
        metadata: { mode, energy: dec, refundReason, matchId },
      },
    });
  }

  // ──────────────────────────────────────────────────────────
  // 充值（RECHARGE）
  // ──────────────────────────────────────────────────────────

  /**
   * 充值入账——支付回调验签成功后调用（§10.4 e）。
   * totalEnergy += cells，写 RECHARGE 流水，返回入账后可用余额。
   */
  async recharge(
    userId: string,
    cells: number,
    metadata?: Prisma.InputJsonValue,
    dedupeKey?: string,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await this.getOrCreateBalance(userId, tx);
      const updated = await tx.energyBalance.update({
        where: { userId },
        data: { totalEnergy: { increment: cells } },
      });
      const balanceAfter = updated.totalEnergy - updated.usedEnergy;
      await tx.energyTransaction.create({
        data: {
          userId,
          type: 'RECHARGE',
          amountEnergy: cells,
          balanceAfter,
          reason: `Top up ${cells} energy ${cells === 1 ? 'cell' : 'cells'}`,
          metadata: metadata ?? Prisma.JsonNull,
          ...(dedupeKey ? { dedupeKey } : {}),
        },
      });
      return balanceAfter;
    });
  }

  /**
   * 发起充值下单（POST /energy/purchase）。
   * 本期 mock：仅生成订单号 + 返回档位信息与 { mock: true } paymentIntent，
   * 不入账（入账在 confirmRecharge）。渠道对接期改为生成真实 paymentIntent。
   */
  async purchase(userId: string, packageId: EnergyPackageId) {
    const pkg = ENERGY_PACKAGES[packageId];
    if (!pkg) {
      throw new BadRequestException('Invalid top-up tier');
    }
    // 本期 mock 订单号；正式渠道接入后落 Order 表
    const orderId = `order_${userId.slice(0, 6)}_${Date.now()}`;
    return {
      orderId,
      packageId,
      cells: pkg.cells,
      priceCny: pkg.priceCny,
      paymentIntent: { mock: true },
    };
  }

  /**
   * 支付回调入账（POST /energy/purchase/confirm）。
   * 本期 mock：从 orderId 解析档位不可靠，故由前端在 confirm 时不再传 packageId——
   * 这里要求 confirm 必须能定位档位。为简化 mock，confirm 直接对 purchase 时记下的 packageId 入账。
   * 实际渠道接入后改为：验签 -> 查订单 -> recharge。
   */
  async confirmRecharge(
    userId: string,
    orderId: string,
    packageId: EnergyPackageId,
    transactionId?: string,
  ) {
    const pkg = ENERGY_PACKAGES[packageId];
    if (!pkg) {
      throw new BadRequestException('Invalid top-up tier');
    }
    if (!orderId) {
      throw new BadRequestException('Missing order number');
    }
    // 幂等结算守卫：同一订单的重复 confirm 不再入账（防重放刷免费能量）。
    // 已结算（存在该 orderId 的 RECHARGE 流水）→ 直接回当前余额，作 no-op。
    const dedupeKey = `recharge:${orderId}`;
    const settled = await this.prisma.energyTransaction.findUnique({
      where: { dedupeKey },
    });
    if (settled) {
      const availableEnergy = await this.getAvailableEnergy(userId);
      return { success: true, availableEnergy, transactionId: transactionId ?? orderId };
    }
    let availableEnergy: number;
    try {
      availableEnergy = await this.recharge(
        userId,
        pkg.cells,
        {
          rechargeMethod: 'mock',
          orderId,
          packageId,
          transactionId: transactionId ?? null,
        },
        dedupeKey,
      );
    } catch (e) {
      // 并发重复 confirm：唯一键冲突 → 已被另一次结算入账，回当前余额作 no-op。
      if ((e as any)?.code === 'P2002') {
        availableEnergy = await this.getAvailableEnergy(userId);
      } else {
        throw e;
      }
    }
    return { success: true, availableEnergy, transactionId: transactionId ?? orderId };
  }

  // ──────────────────────────────────────────────────────────
  // 免费领取（CLAIM）
  // ──────────────────────────────────────────────────────────

  /**
   * 免费领取能量（POST /energy/claim）。
   * 防重放：registration 仅一次；daily-checkin 当天仅一次；task-complete 按 taskKey 去重。
   * 命中已领取 -> BadRequestException。否则 totalEnergy += grant，写 CLAIM 流水。
   */
  async claim(userId: string, claimType: EnergyClaimType, taskKey?: string) {
    const grant = CLAIM_GRANT[claimType];
    if (!grant) {
      throw new BadRequestException('Invalid claim type');
    }
    // 确定性去重键（与 EnergyTransaction.dedupeKey 唯一约束配合，防 check-then-act 双领）：
    // registration 终身一次；daily-checkin 当天一次；task-complete 按 taskKey。
    const dedupeKey = this.claimDedupeKey(userId, claimType, taskKey);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 兼容历史流水（dedupeKey=NULL 的旧记录）：先按原语义快速校验，命中即抛友好错误。
        await this.assertNotClaimed(tx, userId, claimType, taskKey);
        // 再写 CLAIM 流水（带唯一 dedupeKey）。并发/重放时唯一约束冲突 → P2002，余额不会被自增。
        await tx.energyTransaction.create({
          data: {
            userId,
            type: 'CLAIM',
            amountEnergy: grant,
            balanceAfter: 0, // 占位，下方更新余额后回填
            reason: this.claimReason(claimType),
            metadata: { claimType, taskKey: taskKey ?? null },
            dedupeKey,
          },
        });
        const updated = await tx.energyBalance.upsert({
          where: { userId },
          create: { userId, totalEnergy: grant, usedEnergy: 0 },
          update: { totalEnergy: { increment: grant } },
        });
        const balanceAfter = updated.totalEnergy - updated.usedEnergy;
        // 回填交易后余额快照（同一事务内，仍原子）
        await tx.energyTransaction.update({
          where: { dedupeKey },
          data: { balanceAfter },
        });
        return { success: true, grantedEnergy: grant, availableEnergy: balanceAfter };
      });
    } catch (e) {
      if ((e as any)?.code === 'P2002') {
        throw new BadRequestException(this.claimAlreadyMessage(claimType));
      }
      throw e;
    }
  }

  /** 领取去重键：保证 registration 终身一次、daily-checkin 当天一次、task-complete 按 taskKey 唯一。 */
  private claimDedupeKey(userId: string, claimType: EnergyClaimType, taskKey?: string): string {
    if (claimType === 'registration') {
      return `claim:registration:${userId}`;
    }
    if (claimType === 'daily-checkin') {
      // 本地服务器日界（与原 startOfDay = setHours(0,0,0,0) 语义一致）：YYYY-MM-DD
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return `claim:daily-checkin:${userId}:${day}`;
    }
    if (!taskKey) {
      throw new BadRequestException('task-complete requires a taskKey');
    }
    return `claim:task-complete:${userId}:${taskKey}`;
  }

  /** 命中已领取时的提示文案（按类型区分，沿用原 assertNotClaimed 文案）。 */
  private claimAlreadyMessage(claimType: EnergyClaimType): string {
    switch (claimType) {
      case 'registration':
        return 'Registration energy bonus already claimed';
      case 'daily-checkin':
        return 'Already claimed today';
      case 'task-complete':
        return 'This task reward has already been claimed';
    }
  }

  /** 防重放校验：命中已领取记录则抛 BadRequestException。 */
  private async assertNotClaimed(
    tx: Prisma.TransactionClient,
    userId: string,
    claimType: EnergyClaimType,
    taskKey?: string,
  ): Promise<void> {
    const baseWhere: Prisma.EnergyTransactionWhereInput = {
      userId,
      type: 'CLAIM',
      metadata: { path: ['claimType'], equals: claimType },
    };

    if (claimType === 'registration') {
      const dup = await tx.energyTransaction.findFirst({ where: baseWhere });
      if (dup) throw new BadRequestException('Registration energy bonus already claimed');
      return;
    }

    if (claimType === 'daily-checkin') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const dup = await tx.energyTransaction.findFirst({
        where: { ...baseWhere, createdAt: { gte: startOfDay } },
      });
      if (dup) throw new BadRequestException('Already claimed today');
      return;
    }

    // task-complete：按 taskKey 去重
    if (!taskKey) {
      throw new BadRequestException('task-complete requires a taskKey');
    }
    const dup = await tx.energyTransaction.findFirst({
      where: {
        userId,
        type: 'CLAIM',
        AND: [
          { metadata: { path: ['claimType'], equals: 'task-complete' } },
          { metadata: { path: ['taskKey'], equals: taskKey } },
        ],
      },
    });
    if (dup) throw new BadRequestException('This task reward has already been claimed');
  }

  private claimReason(claimType: EnergyClaimType): string {
    switch (claimType) {
      case 'registration':
        return 'Registration bonus: 1 energy cell';
      case 'daily-checkin':
        return 'Daily check-in: 1 energy cell';
      case 'task-complete':
        return 'Task reward';
    }
  }

  // ──────────────────────────────────────────────────────────
  // 流水查询（GET /energy/transactions）
  // ──────────────────────────────────────────────────────────

  /** 分页流水（倒序，最新在前）。 */
  async getTransactions(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.energyTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          type: true,
          amountEnergy: true,
          balanceAfter: true,
          relatedMatchId: true,
          relatedMatchMode: true,
          reason: true,
          metadata: true,
          createdAt: true,
        },
      }),
      this.prisma.energyTransaction.count({ where: { userId } }),
    ]);

    return { items, total, page: safePage, limit: safeLimit };
  }
}
