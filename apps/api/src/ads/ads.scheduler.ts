import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AdCampaignStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdsService } from './ads.service';

/**
 * 广告生命周期调度（docs/ADMIN-REDESIGN.md §3）：
 * - SCHEDULED → ACTIVE：到 startDate 自动开始投放
 * - ACTIVE/PAUSED → COMPLETED：过 endDate（含当日）自动完成，并触发分成结算（settle 幂等）
 * 预算耗尽的 COMPLETED 由事件上报路径（AdsService.reportEvents）实时触发，此处兜底到期场景。
 */
@Injectable()
export class AdsScheduler implements OnModuleInit {
  private readonly logger = new Logger(AdsScheduler.name);

  constructor(
    private prisma: PrismaService,
    private adsService: AdsService,
  ) {}

  // 启动即追一次生命周期（@Interval 首次触发在 10 分钟后，避免重启导致状态/摊销滞后）
  async onModuleInit() {
    await this.tick();
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  // 每 10 分钟推进一次生命周期
  @Interval(10 * 60 * 1000)
  async tick() {
    try {
      await this.activateDueCampaigns();
      // BUYOUT 日消耗摊销（报表口径，幂等），在到期完成之前推进
      await this.adsService.accrueBuyoutSpend();
      await this.completeExpiredCampaigns();
    } catch (e: any) {
      this.logger.error('广告生命周期调度失败：' + (e?.message ?? e));
    }
  }

  // SCHEDULED → ACTIVE（已付款且到 startDate）
  private async activateDueCampaigns() {
    const res = await this.prisma.adCampaign.updateMany({
      where: { status: AdCampaignStatus.SCHEDULED, startDate: { lte: new Date() } },
      data: { status: AdCampaignStatus.ACTIVE },
    });
    if (res.count > 0) this.logger.log(`广告开始投放（SCHEDULED→ACTIVE）：${res.count} 个`);
  }

  // ACTIVE/PAUSED → COMPLETED（endDate 含当日：endDate < 今日 UTC 零点即已过投放期）
  private async completeExpiredCampaigns() {
    const today = this.todayUtc();
    const expired = await this.prisma.adCampaign.findMany({
      where: {
        status: { in: [AdCampaignStatus.ACTIVE, AdCampaignStatus.PAUSED] },
        endDate: { lt: today },
      },
      select: { id: true },
    });

    for (const campaign of expired) {
      // 条件更新防并发重复流转（多实例/与事件路径竞争时败者 count=0）
      const res = await this.prisma.adCampaign.updateMany({
        where: {
          id: campaign.id,
          status: { in: [AdCampaignStatus.ACTIVE, AdCampaignStatus.PAUSED] },
        },
        data: { status: AdCampaignStatus.COMPLETED, completedAt: new Date() },
      });
      if (res.count === 0) continue;

      // 结算前补齐该单全部投放日的 BUYOUT 摊销（自愈停机漏 tick），再触发结算
      try {
        await this.adsService.accrueBuyoutSpend(campaign.id, undefined);
        await this.adsService.settleCampaign(campaign.id);
      } catch (e: any) {
        this.logger.error(`广告 ${campaign.id} 分成结算失败：` + (e?.message ?? e));
      }
    }
    if (expired.length > 0) {
      this.logger.log(`广告到期完成（→COMPLETED）：${expired.length} 个`);
    }
  }
}
