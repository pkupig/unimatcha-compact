import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRole, Prisma, SponsorLedgerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActor } from '../admin-core/admin-actor';
import { paginated, skipTake } from '../common/utils/pagination';
import { AdjustWalletDto, ListLedgerQueryDto, TopupDto } from './dto/sponsor-wallet.dto';

/**
 * 广告商能量钱包服务（能量经济 2026-08，B1）。
 * - 1 元 = 100 分 = 100 能量，数值同构（amountCents 承载能量数）
 * - 账本只增不改（SponsorEnergyLedger），无余额行：余额 = Σ amountCents（唯一余额实现）
 * - 广告在途锁定按 refType='campaign' 净额汇总：预扣后为正、退完为 0，净额天然幂等
 * - MVP 充值为 mock 即时到账（无订单表），clientToken 幂等防连点
 */
@Injectable()
export class SponsorWalletService {
  constructor(private prisma: PrismaService) {}

  // 余额 = Σ amountCents（全系统唯一余额实现；tx 传入以便与业务写入同事务读取）
  async computeBalance(tx: Prisma.TransactionClient, adminId: string): Promise<number> {
    const agg = await tx.sponsorEnergyLedger.aggregate({
      where: { adminId },
      _sum: { amountCents: true },
    });
    return agg._sum.amountCents ?? 0;
  }

  // 某 campaign 的在途锁定净额 = −Σ(refType='campaign' 且 refId=campaignId 的 amountCents)
  // 预扣后为正、退完为 0；按净额退款天然幂等（重复退款只会退到 0 为止，不会双退）。
  // adminId 过滤（复查 ISSUE-2）：防止手工调整误挂他人单据的 campaignId 污染净额
  async outstandingForCampaign(
    tx: Prisma.TransactionClient,
    campaignId: string,
    adminId?: string,
  ): Promise<number> {
    const agg = await tx.sponsorEnergyLedger.aggregate({
      where: { refType: 'campaign', refId: campaignId, ...(adminId ? { adminId } : {}) },
      _sum: { amountCents: true },
    });
    return -(agg._sum.amountCents ?? 0);
  }

  // 钱包概览：余额 / 在途锁定 / 累计充值
  async getSummary(actor: AdminActor) {
    const [balanceCents, topupAgg, campaignGroups] = await Promise.all([
      this.computeBalance(this.prisma, actor.id),
      this.prisma.sponsorEnergyLedger.aggregate({
        where: { adminId: actor.id, type: SponsorLedgerType.TOPUP },
        _sum: { amountCents: true },
      }),
      // 按 campaign 分组净额，内存汇总正值（= 仍在途的锁定）
      this.prisma.sponsorEnergyLedger.groupBy({
        by: ['refId'],
        where: { adminId: actor.id, refType: 'campaign' },
        _sum: { amountCents: true },
      }),
    ]);
    const lockedCents = campaignGroups.reduce((acc, g) => {
      const net = -(g._sum.amountCents ?? 0); // 锁后为正、退完为 0
      return net > 0 ? acc + net : acc;
    }, 0);
    return {
      balanceCents,
      lockedCents,
      totalTopupCents: topupAgg._sum.amountCents ?? 0,
    };
  }

  // 流水列表（own，倒序；可按类型筛选）
  async listLedger(actor: AdminActor, q: ListLedgerQueryDto) {
    const where: Prisma.SponsorEnergyLedgerWhereInput = { adminId: actor.id };
    if (q.type) where.type = q.type;
    const [rows, total] = await Promise.all([
      this.prisma.sponsorEnergyLedger.findMany({
        where,
        ...skipTake(q),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sponsorEnergyLedger.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  // 充值（MVP mock 即时到账）：clientToken 幂等——同键重复请求直接返回既有行，不重复入账。
  // Serializable（复查 ISSUE-4）：读空+插入构成 SSI 危险结构，同 token 并发双请求
  // 必有一方序列化回滚，无唯一约束也不会双入账；接真支付网关时应再加条件唯一索引兜底
  async topup(actor: AdminActor, dto: TopupDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.sponsorEnergyLedger.findFirst({
          where: { adminId: actor.id, refType: 'topup', refId: dto.clientToken },
        });
        if (existing) return existing;
        return tx.sponsorEnergyLedger.create({
          data: {
            adminId: actor.id,
            type: SponsorLedgerType.TOPUP,
            amountCents: dto.amountCents,
            refType: 'topup',
            refId: dto.clientToken,
            note: `充值 ${dto.amountCents} 能量（mock 支付）`,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // 平台手工调整（SUPER/TEAM）：SUSPENDED 退款等人工通道，操作人留痕
  async adjust(actor: AdminActor, dto: AdjustWalletDto) {
    const target = await this.prisma.adminUser.findUnique({
      where: { id: dto.sponsorAdminId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('广告商账号不存在');
    if (target.role !== AdminRole.SPONSOR) {
      throw new BadRequestException('目标账号不是广告商（SPONSOR），不能调整钱包');
    }
    // 复查 ISSUE-2 加固：refId 关联单据必须归属该广告商（防误挂他人单污染净额）；
    // 仅正向退款计入 'campaign' 净额（负向罚扣若挂 campaign 会抬高 outstanding 造成超退）
    let refType: string = 'adjustment';
    if (dto.refId) {
      const campaign = await this.prisma.adCampaign.findUnique({
        where: { id: dto.refId },
        select: { advertiserId: true },
      });
      if (!campaign || campaign.advertiserId !== dto.sponsorAdminId) {
        throw new BadRequestException('关联广告不存在或不属于该广告商');
      }
      if (dto.amountCents > 0) refType = 'campaign';
    }
    return this.prisma.sponsorEnergyLedger.create({
      data: {
        adminId: dto.sponsorAdminId,
        type: SponsorLedgerType.ADJUSTMENT,
        amountCents: dto.amountCents,
        refType,
        refId: dto.refId ?? null,
        note: dto.note,
        createdByAdminId: actor.id,
      },
    });
  }
}
