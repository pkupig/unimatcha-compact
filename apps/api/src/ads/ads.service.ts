import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AdCampaignStatus,
  AdminRole,
  AdPricingModel,
  LedgerEntryType,
  Prisma,
  SponsorLedgerType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SponsorWalletService } from '../sponsor-wallet/sponsor-wallet.service';
import { AdminActor } from '../admin-core/admin-actor';
import {
  ConfirmPaymentDto,
  CreateCampaignDto,
  ReportAdEventsDto,
  ReviewCampaignDto,
  SuspendCampaignDto,
  UpdateCampaignDto,
} from './dto/ads.dto';

// 单价快照结构（提交时锁定，{schoolId: {buyoutDaily, cpm, cpc}}，与设计文档 §2 一致）
type PriceSnapshotEntry = { buyoutDaily: number; cpm: number; cpc: number };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 全局计价兜底（SystemConfig ad_pricing_defaults 缺失时使用，§3）
const FALLBACK_PRICING = {
  buyoutDailyPriceCents: 20000, // 包断：每天每校
  cpmPriceCents: 5000, // 每 1000 次曝光
  cpcPriceCents: 200, // 每次点击
};

/**
 * 广告体系服务（docs/ADMIN-REDESIGN.md §3 计费与分成 / §4 ads 路由表）。
 * - 生命周期（能量经济 2026-08）：DRAFT → 提交（计价快照 + 能量预扣）→ 分级审核 →
 *   通过即 SCHEDULED/ACTIVE（预扣即付，不再进 PENDING_PAYMENT）
 *   → PAUSED/SUSPENDED → COMPLETED（到期或预算耗尽，触发分成结算 + CPM/CPC 结余退回）
 *   驳回/撤回按在途净额退回预扣；旧 PENDING_PAYMENT 仅兼容保留
 * - 范围校验在服务层：SPONSOR 仅自己的 campaign；STUDENT_UNION 仅本校相关；SUPER/TEAM 全量
 * - 金额一律以分（cents, Int）存储与计算
 */
@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(
    private prisma: PrismaService,
    private sponsorWallet: SponsorWalletService,
  ) {}

  // ─── 通用工具 ────────────────────────────────────────────────

  private isTeam(admin: AdminActor): boolean {
    return admin.role === AdminRole.SUPER || admin.role === AdminRole.TEAM || admin.isSuperAdmin;
  }

  // 学生会必须绑定学校（School.id），未绑定视为配置错误直接拒绝
  private requireUnionSchool(admin: AdminActor): string {
    if (!admin.schoolId) throw new ForbiddenException('学生会账号未绑定学校');
    return admin.schoolId;
  }

  // 解析日期字符串（ISO），归一到 UTC 零点（AdDailyStat.date 为 @db.Date，投放起止也按天粒度）
  private parseDateOnly(input: string, errorMessage: string): Date {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(errorMessage);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  // endDate 含当日：投放期最后一刻 = endDate（UTC 零点）+ 1 天 − 1ms
  private endOfDayUtc(endDate: Date): Date {
    return new Date(endDate.getTime() + MS_PER_DAY - 1);
  }

  // 天数按起止均含计（endDate - startDate + 1）
  private inclusiveDays(startDate: Date, endDate: Date): number {
    return Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
  }

  // 全局默认单价：SystemConfig ad_pricing_defaults → 硬编码兜底（§3）
  private async getPricingDefaults(): Promise<typeof FALLBACK_PRICING> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'ad_pricing_defaults' },
    });
    const value = (config?.value as Record<string, any> | null) ?? {};
    const pick = (full: any, short: any, fallback: number): number => {
      const n = Number(full ?? short);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    };
    return {
      buyoutDailyPriceCents: pick(
        value.buyoutDailyPriceCents,
        value.buyoutDaily,
        FALLBACK_PRICING.buyoutDailyPriceCents,
      ),
      cpmPriceCents: pick(value.cpmPriceCents, value.cpm, FALLBACK_PRICING.cpmPriceCents),
      cpcPriceCents: pick(value.cpcPriceCents, value.cpc, FALLBACK_PRICING.cpcPriceCents),
    };
  }

  // 列表/详情统一 include：广告主 + 投放学校
  private campaignInclude() {
    return {
      advertiser: { select: { id: true, name: true, organizationName: true } },
      placements: { include: { school: { select: { id: true, name: true } } } },
    };
  }

  // 输出整形：placements 展平出 schoolName，附 stats 汇总
  private shapeCampaign(
    campaign: any,
    stats?: { impressions?: number | null; clicks?: number | null; spendCents?: number | null } | null,
  ) {
    const { placements, ...rest } = campaign;
    return {
      ...rest,
      placements: (placements ?? []).map((p: any) => ({
        id: p.id,
        schoolId: p.schoolId,
        schoolName: p.school?.name ?? null,
        buyoutPriceCents: p.buyoutPriceCents ?? null,
      })),
      stats: {
        impressions: stats?.impressions ?? 0,
        clicks: stats?.clicks ?? 0,
        spendCents: stats?.spendCents ?? 0,
      },
    };
  }

  // 详情/统计可见范围：SPONSOR=own；UNION=来源本校或投放含本校；SUPER/TEAM=全部
  private assertCanView(
    admin: AdminActor,
    campaign: { advertiserId: string; sourcedBySchoolId: string | null; placements: { schoolId: string }[] },
  ) {
    if (this.isTeam(admin)) return;
    if (admin.role === AdminRole.SPONSOR) {
      if (campaign.advertiserId !== admin.id) throw new ForbiddenException('无权查看该广告');
      return;
    }
    if (admin.role === AdminRole.STUDENT_UNION) {
      const schoolId = this.requireUnionSchool(admin);
      if (
        campaign.sourcedBySchoolId === schoolId ||
        campaign.placements.some((p) => p.schoolId === schoolId)
      ) {
        return;
      }
      throw new ForbiddenException('无权查看该广告');
    }
    throw new ForbiddenException('当前角色无权访问该功能');
  }

  // 创建/编辑共用校验：日期、预算与计价模式匹配、学校存在且启用、自拉广告商仅可投本校
  private async validateCampaignPayload(advertiserId: string, dto: CreateCampaignDto) {
    const startDate = this.parseDateOnly(dto.startDate, '开始日期格式不正确');
    const endDate = this.parseDateOnly(dto.endDate, '结束日期格式不正确');
    if (startDate > endDate) throw new BadRequestException('开始日期不能晚于结束日期');
    if (endDate < this.todayUtc()) throw new BadRequestException('结束日期不能早于今天');
    // BUYOUT 按天计价：过去的日期无法投放却会被计入锁价，必须从今天起
    if (startDate < this.todayUtc()) throw new BadRequestException('开始日期不能早于今天');

    if (dto.pricingModel === AdPricingModel.BUYOUT) {
      if (dto.budgetCents != null) throw new BadRequestException('包断（BUYOUT）模式无需设置预算');
    } else if (dto.budgetCents == null || dto.budgetCents <= 0) {
      throw new BadRequestException('CPM/CPC 模式必须设置正数预算（分）');
    }

    const schoolIds = [...new Set(dto.schoolIds)];
    const schools = await this.prisma.school.findMany({
      where: { id: { in: schoolIds } },
      select: { id: true, isActive: true },
    });
    const schoolById = new Map(schools.map((s) => [s.id, s]));
    for (const sid of schoolIds) {
      const school = schoolById.get(sid);
      if (!school) throw new BadRequestException('投放学校不存在，请检查学校列表');
      if (!school.isActive) throw new BadRequestException('投放学校未启用，无法投放');
    }

    // req.user 不含 sourcedBySchoolId，重新查广告商行判定来源（自拉广告商仅可投本校）
    const advertiser = await this.prisma.adminUser.findUnique({
      where: { id: advertiserId },
      select: { sourcedBySchoolId: true },
    });
    const sourcedBySchoolId = advertiser?.sourcedBySchoolId ?? null;
    if (sourcedBySchoolId && (schoolIds.length !== 1 || schoolIds[0] !== sourcedBySchoolId)) {
      throw new ForbiddenException('自拉广告商仅可投放本校');
    }

    return { startDate, endDate, schoolIds };
  }

  // ─── 广告生命周期（SPONSOR 侧） ──────────────────────────────

  // 创建草稿（status=DRAFT，placements 一并建立）
  async createCampaign(admin: AdminActor, dto: CreateCampaignDto) {
    const { startDate, endDate, schoolIds } = await this.validateCampaignPayload(admin.id, dto);

    const campaign = await this.prisma.adCampaign.create({
      data: {
        advertiserId: admin.id,
        title: dto.title,
        content: dto.content,
        images: dto.images,
        landingUrl: dto.landingUrl ?? null,
        pricingModel: dto.pricingModel,
        status: AdCampaignStatus.DRAFT,
        startDate,
        endDate,
        budgetCents: dto.pricingModel === AdPricingModel.BUYOUT ? null : dto.budgetCents,
        placements: { create: schoolIds.map((schoolId) => ({ schoolId })) },
      },
      include: this.campaignInclude(),
    });
    return this.shapeCampaign(campaign);
  }

  // 编辑（仅 DRAFT/REJECTED，own；整体替换 placements；状态保持，重新提交才流转）
  async updateCampaign(admin: AdminActor, id: string, dto: UpdateCampaignDto) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('广告不存在');
    if (campaign.advertiserId !== admin.id) throw new ForbiddenException('仅可编辑自己的广告');
    if (
      campaign.status !== AdCampaignStatus.DRAFT &&
      campaign.status !== AdCampaignStatus.REJECTED
    ) {
      throw new BadRequestException('仅草稿或被驳回的广告可编辑');
    }

    const { startDate, endDate, schoolIds } = await this.validateCampaignPayload(admin.id, dto);

    const [, , updated] = await this.prisma.$transaction([
      this.prisma.adPlacement.deleteMany({ where: { campaignId: id } }),
      this.prisma.adPlacement.createMany({
        data: schoolIds.map((schoolId) => ({ campaignId: id, schoolId })),
      }),
      this.prisma.adCampaign.update({
        where: { id },
        data: {
          title: dto.title,
          content: dto.content,
          images: dto.images,
          landingUrl: dto.landingUrl ?? null,
          pricingModel: dto.pricingModel,
          startDate,
          endDate,
          budgetCents: dto.pricingModel === AdPricingModel.BUYOUT ? null : dto.budgetCents,
        },
        include: this.campaignInclude(),
      }),
    ]);
    return this.shapeCampaign(updated);
  }

  // 提交审核：锁定计价快照 + 算价 + 能量预扣（B2）；自拉 → 本校学生会审，直签 → 平台审（§3/§4）
  async submitCampaign(admin: AdminActor, id: string) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id },
      include: {
        placements: {
          include: {
            school: {
              select: {
                id: true,
                buyoutDailyPriceCents: true,
                cpmPriceCents: true,
                cpcPriceCents: true,
              },
            },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('广告不存在');
    if (campaign.advertiserId !== admin.id) throw new ForbiddenException('仅可操作自己的广告');
    if (
      campaign.status !== AdCampaignStatus.DRAFT &&
      campaign.status !== AdCampaignStatus.REJECTED
    ) {
      throw new BadRequestException('仅草稿或被驳回的广告可提交审核');
    }
    if (campaign.endDate < this.todayUtc()) {
      throw new BadRequestException('结束日期已过，请先修改排期再提交');
    }
    // 草稿放置后再提交：startDate 已成过去会把无法投放的天数计入锁价
    if (campaign.startDate < this.todayUtc()) {
      throw new BadRequestException('开始日期已过，请先修改排期再提交');
    }
    if (campaign.pricingModel !== AdPricingModel.BUYOUT && !campaign.budgetCents) {
      throw new BadRequestException('CPM/CPC 模式必须设置预算');
    }

    // req.user 不含 sourcedBySchoolId，重新查广告商行（提交时冗余到 campaign，供分级审核与分成档位判定）
    const advertiser = await this.prisma.adminUser.findUnique({
      where: { id: admin.id },
      select: { sourcedBySchoolId: true },
    });
    const sourcedBySchoolId = advertiser?.sourcedBySchoolId ?? null;
    if (sourcedBySchoolId) {
      const placedIds = campaign.placements.map((p) => p.schoolId);
      if (placedIds.length !== 1 || placedIds[0] !== sourcedBySchoolId) {
        throw new ForbiddenException('自拉广告商仅可投放本校');
      }
    }

    const defaults = await this.getPricingDefaults();
    const days = this.inclusiveDays(campaign.startDate, campaign.endDate);

    // 按校快照单价（School 覆盖 → 全局默认），BUYOUT 同时锁定各校包断价
    // （锁价 update 改在下方事务内执行——预建 PrismaPromise 会绑定在非事务连接上，这里只收集数据）
    const priceSnapshot: Record<string, PriceSnapshotEntry> = {};
    let totalPriceCents = 0;
    const placementUpdates: { placementId: string; buyoutPriceCents: number }[] = [];
    for (const p of campaign.placements) {
      const entry: PriceSnapshotEntry = {
        buyoutDaily: p.school.buyoutDailyPriceCents ?? defaults.buyoutDailyPriceCents,
        cpm: p.school.cpmPriceCents ?? defaults.cpmPriceCents,
        cpc: p.school.cpcPriceCents ?? defaults.cpcPriceCents,
      };
      priceSnapshot[p.schoolId] = entry;
      if (campaign.pricingModel === AdPricingModel.BUYOUT) {
        const buyoutPriceCents = days * entry.buyoutDaily;
        totalPriceCents += buyoutPriceCents;
        placementUpdates.push({ placementId: p.id, buyoutPriceCents });
      }
    }
    if (campaign.pricingModel !== AdPricingModel.BUYOUT) {
      totalPriceCents = campaign.budgetCents ?? 0;
    }

    const nextStatus = sourcedBySchoolId
      ? AdCampaignStatus.PENDING_UNION_REVIEW
      : AdCampaignStatus.PENDING_PLATFORM_REVIEW;

    // 落库走交互式 Serializable 事务（同 finance createWithdrawal 惯例）：
    // 状态 claim → 余额校验 → 能量预扣 → 锁价 → 回读；并发双提交在 Serializable 下
    // 必有一方回滚，余额不会被双花，预扣不会重复入账
    const submitted = await this.prisma.$transaction(
      async (tx) => {
        // ① 条件更新原子 claim 状态（事务外的状态检查只是快速失败，这里才是并发防线）
        const claimed = await tx.adCampaign.updateMany({
          where: { id, status: { in: [AdCampaignStatus.DRAFT, AdCampaignStatus.REJECTED] } },
          data: {
            status: nextStatus,
            priceSnapshot: priceSnapshot as unknown as Prisma.InputJsonValue,
            totalPriceCents,
            sourcedBySchoolId,
            rejectedReason: null, // 重新提交清除上次驳回原因
          },
        });
        if (claimed.count === 0) {
          throw new BadRequestException('仅草稿或被驳回的广告可提交审核');
        }

        // ② 余额校验：BUYOUT 锁全款（totalPrice），CPM/CPC 锁预算
        const balance = await this.sponsorWallet.computeBalance(tx, admin.id);
        const lockAmount =
          campaign.pricingModel === AdPricingModel.BUYOUT
            ? totalPriceCents
            : (campaign.budgetCents ?? 0);
        if (balance < lockAmount) {
          // 抛错整个事务回滚，状态不流转
          throw new BadRequestException('能量不足，请先充值');
        }

        // ③ 提交预扣（负项入账；驳回/撤回/结算结余按 refType='campaign' 净额退回）
        await tx.sponsorEnergyLedger.create({
          data: {
            adminId: admin.id,
            type: SponsorLedgerType.CAMPAIGN_LOCK,
            amountCents: -lockAmount,
            refType: 'campaign',
            refId: id,
            note: `提交预扣：${campaign.title}`,
          },
        });

        // ④ BUYOUT 各校包断价锁定
        for (const u of placementUpdates) {
          await tx.adPlacement.update({
            where: { id: u.placementId },
            data: { buyoutPriceCents: u.buyoutPriceCents },
          });
        }

        // ⑤ 事务内回读完整行返回
        return tx.adCampaign.findUnique({ where: { id }, include: this.campaignInclude() });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.shapeCampaign(submitted);
  }

  // 撤回审核（能量经济 B2）：SPONSOR 本人，审核中 → DRAFT，按在途净额退回提交预扣
  async withdrawSubmission(admin: AdminActor, id: string) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('广告不存在');
    if (campaign.advertiserId !== admin.id) throw new ForbiddenException('仅可操作自己的广告');

    const withdrawn = await this.prisma.$transaction(async (tx) => {
      // 条件更新原子 claim：并发撤回/审核只有一方成功，败者 count=0 直接 400
      const claimed = await tx.adCampaign.updateMany({
        where: {
          id,
          status: {
            in: [AdCampaignStatus.PENDING_UNION_REVIEW, AdCampaignStatus.PENDING_PLATFORM_REVIEW],
          },
        },
        data: { status: AdCampaignStatus.DRAFT },
      });
      if (claimed.count === 0) throw new BadRequestException('仅审核中的广告可撤回');

      // 按在途净额退回（锁后为正、退完为 0，净额天然幂等）
      const locked = await this.sponsorWallet.outstandingForCampaign(tx, id, admin.id);
      if (locked > 0) {
        await tx.sponsorEnergyLedger.create({
          data: {
            adminId: campaign.advertiserId,
            type: SponsorLedgerType.REFUND,
            amountCents: locked,
            refType: 'campaign',
            refId: id,
            note: `撤回退回：${campaign.title}`,
          },
        });
      }
      return tx.adCampaign.findUnique({ where: { id }, include: this.campaignInclude() });
    });
    return this.shapeCampaign(withdrawn);
  }

  // ─── 列表 / 详情 / 日数据 ────────────────────────────────────

  async listCampaigns(
    admin: AdminActor,
    params: { status?: string; schoolId?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AdCampaignWhereInput = {};
    if (params.status) {
      if (!Object.values(AdCampaignStatus).includes(params.status as AdCampaignStatus)) {
        throw new BadRequestException('无效的广告状态');
      }
      where.status = params.status as AdCampaignStatus;
    }
    if (params.schoolId) where.placements = { some: { schoolId: params.schoolId } };

    // 角色 scope（放 AND 里避免覆盖 schoolId 过滤条件）
    if (admin.role === AdminRole.SPONSOR) {
      where.advertiserId = admin.id;
    } else if (admin.role === AdminRole.STUDENT_UNION) {
      const schoolId = this.requireUnionSchool(admin);
      where.AND = [
        { OR: [{ sourcedBySchoolId: schoolId }, { placements: { some: { schoolId } } }] },
      ];
    }
    // SUPER/TEAM：全量

    const [rows, total] = await Promise.all([
      this.prisma.adCampaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.campaignInclude(),
      }),
      this.prisma.adCampaign.count({ where }),
    ]);

    // 附曝光/点击/消耗汇总（一次 groupBy，避免 N+1）
    const ids = rows.map((r) => r.id);
    const sums = ids.length
      ? await this.prisma.adDailyStat.groupBy({
          by: ['campaignId'],
          where: { campaignId: { in: ids } },
          _sum: { impressions: true, clicks: true, spendCents: true },
        })
      : [];
    const sumMap = new Map(sums.map((s) => [s.campaignId, s._sum]));

    const items = rows.map((r) => this.shapeCampaign(r, sumMap.get(r.id)));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getCampaign(admin: AdminActor, id: string) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id },
      include: this.campaignInclude(),
    });
    if (!campaign) throw new NotFoundException('广告不存在');
    this.assertCanView(admin, campaign);

    const bySchoolRaw = await this.prisma.adDailyStat.groupBy({
      by: ['schoolId'],
      where: { campaignId: id },
      _sum: { impressions: true, clicks: true, spendCents: true },
    });
    const nameBySchoolId = new Map(
      campaign.placements.map((p: any) => [p.schoolId, p.school?.name ?? null]),
    );
    const bySchool = bySchoolRaw.map((s) => ({
      schoolId: s.schoolId,
      schoolName: nameBySchoolId.get(s.schoolId) ?? null,
      impressions: s._sum.impressions ?? 0,
      clicks: s._sum.clicks ?? 0,
      spendCents: s._sum.spendCents ?? 0,
    }));
    const totals = bySchool.reduce(
      (acc, s) => ({
        impressions: acc.impressions + s.impressions,
        clicks: acc.clicks + s.clicks,
        spendCents: acc.spendCents + s.spendCents,
      }),
      { impressions: 0, clicks: 0, spendCents: 0 },
    );

    const shaped = this.shapeCampaign(campaign, totals);
    return { ...shaped, stats: { ...totals, bySchool } };
  }

  // 日数据序列（scope 同详情）：AdDailyStat 按日期升序 + 分校汇总
  async getCampaignStats(admin: AdminActor, id: string, from?: string, to?: string) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id },
      include: { placements: { include: { school: { select: { id: true, name: true } } } } },
    });
    if (!campaign) throw new NotFoundException('广告不存在');
    this.assertCanView(admin, campaign);

    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = this.parseDateOnly(from, '起始日期格式不正确');
    if (to) dateFilter.lte = this.parseDateOnly(to, '截止日期格式不正确');

    const where: Prisma.AdDailyStatWhereInput = { campaignId: id };
    if (from || to) where.date = dateFilter;

    const [rows, bySchoolRaw] = await Promise.all([
      this.prisma.adDailyStat.findMany({ where, orderBy: [{ date: 'asc' }, { schoolId: 'asc' }] }),
      this.prisma.adDailyStat.groupBy({
        by: ['schoolId'],
        where,
        _sum: { impressions: true, clicks: true, spendCents: true },
      }),
    ]);

    const nameBySchoolId = new Map(
      campaign.placements.map((p: any) => [p.schoolId, p.school?.name ?? null]),
    );
    return {
      items: rows.map((r) => ({ ...r, schoolName: nameBySchoolId.get(r.schoolId) ?? null })),
      bySchool: bySchoolRaw.map((s) => ({
        schoolId: s.schoolId,
        schoolName: nameBySchoolId.get(s.schoolId) ?? null,
        impressions: s._sum.impressions ?? 0,
        clicks: s._sum.clicks ?? 0,
        spendCents: s._sum.spendCents ?? 0,
      })),
    };
  }

  // ─── 审核 / 收款 / 状态流转 ──────────────────────────────────

  // 分级审核：学生会审本校自拉单（PENDING_UNION_REVIEW），团队审平台直签单（PENDING_PLATFORM_REVIEW）
  // 能量经济（B2）：通过不再进 PENDING_PAYMENT——预扣即付，直接 SCHEDULED/ACTIVE；驳回退回预扣
  async reviewCampaign(admin: AdminActor, id: string, dto: ReviewCampaignDto) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('广告不存在');

    let reviewerField: 'unionReviewedByAdminId' | 'platformReviewedByAdminId';
    if (admin.role === AdminRole.STUDENT_UNION) {
      const schoolId = this.requireUnionSchool(admin);
      if (campaign.sourcedBySchoolId !== schoolId) {
        throw new ForbiddenException('仅可审核本校自拉广告商的广告');
      }
      if (campaign.status !== AdCampaignStatus.PENDING_UNION_REVIEW) {
        throw new BadRequestException('当前状态不可审核');
      }
      reviewerField = 'unionReviewedByAdminId';
    } else {
      if (campaign.status !== AdCampaignStatus.PENDING_PLATFORM_REVIEW) {
        throw new BadRequestException('当前状态不可审核');
      }
      reviewerField = 'platformReviewedByAdminId';
    }

    if (dto.approve) {
      // 通过：预扣即付——paidAt 立即写入（settleCampaign / accrueBuyoutSpend 以 paidAt 为结算前置），
      // 按 startDate 直接排期或激活；BUYOUT 包断价即全部消耗（平移原 confirmPayment 语义）。
      // 对抗复查 ISSUE-1：与驳回/撤回对称的事务 claim——否则「审核员读到待审 → 广告商并发撤回退款
      // → 无条件 update 覆盖成 ACTIVE」会造成预扣已退、广告照跑、结算再退结余的双重资金漏洞
      const now = new Date();
      const nextStatus =
        campaign.startDate <= now ? AdCampaignStatus.ACTIVE : AdCampaignStatus.SCHEDULED;
      const lockAmount =
        campaign.pricingModel === AdPricingModel.BUYOUT
          ? (campaign.totalPriceCents ?? 0)
          : (campaign.budgetCents ?? 0);
      const approved = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.adCampaign.updateMany({
          where: { id, status: campaign.status },
          data: {
            status: nextStatus,
            paidAt: now,
            reviewNote: dto.note ?? null,
            rejectedReason: null,
            [reviewerField]: admin.id,
            ...(campaign.pricingModel === AdPricingModel.BUYOUT
              ? { spendCents: campaign.totalPriceCents ?? 0 }
              : {}),
          },
        });
        if (claimed.count === 0) throw new BadRequestException('当前状态不可审核');
        // 预扣断言：在途净额必须覆盖锁定额——挡住并发撤回后的幽灵通过，
        // 也天然拦截无预扣的切换期存量旧单（那类单应打回重提，ISSUE-3a）
        const locked = await this.sponsorWallet.outstandingForCampaign(tx, id, campaign.advertiserId);
        if (locked < lockAmount) {
          throw new BadRequestException('该广告无有效预扣（可能已撤回或为旧流程单），无法通过审核');
        }
        return tx.adCampaign.findUnique({ where: { id }, include: this.campaignInclude() });
      });
      return this.shapeCampaign(approved);
    }

    // 驳回：事务内 claim 状态 + 按在途净额退回预扣（净额天然幂等，并发/重复驳回不双退）
    const rejected = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.adCampaign.updateMany({
        // campaign.status 即守卫段确认过的当前预期审核态
        where: { id, status: campaign.status },
        data: {
          status: AdCampaignStatus.REJECTED,
          reviewNote: dto.note ?? null,
          rejectedReason: dto.note ?? null,
          [reviewerField]: admin.id,
        },
      });
      if (claimed.count === 0) throw new BadRequestException('当前状态不可审核');

      const locked = await this.sponsorWallet.outstandingForCampaign(tx, id, campaign.advertiserId);
      if (locked > 0) {
        await tx.sponsorEnergyLedger.create({
          data: {
            adminId: campaign.advertiserId,
            type: SponsorLedgerType.REFUND,
            amountCents: locked,
            refType: 'campaign',
            refId: id,
            note: `驳回退回：${campaign.title}`,
          },
        });
      }
      return tx.adCampaign.findUnique({ where: { id }, include: this.campaignInclude() });
    });
    return this.shapeCampaign(rejected);
  }

  // 确认收款（线下对公转账，MVP 无支付网关）：→ SCHEDULED / ACTIVE；BUYOUT 激活即 spend=totalPrice
  // @deprecated 旧 PENDING_PAYMENT 流程兼容，能量经济后新单不再进入该状态
  async confirmPayment(admin: AdminActor, id: string, dto: ConfirmPaymentDto) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('广告不存在');
    if (campaign.status !== AdCampaignStatus.PENDING_PAYMENT) {
      throw new BadRequestException('当前状态不可确认收款');
    }

    const now = new Date();
    const nextStatus =
      campaign.startDate <= now ? AdCampaignStatus.ACTIVE : AdCampaignStatus.SCHEDULED;

    const updated = await this.prisma.adCampaign.update({
      where: { id },
      data: {
        status: nextStatus,
        paidAt: now,
        paymentConfirmedByAdminId: admin.id,
        paymentNote: dto.note ?? null,
        // BUYOUT：包断价即全部消耗（确认收款即锁定）
        ...(campaign.pricingModel === AdPricingModel.BUYOUT
          ? { spendCents: campaign.totalPriceCents }
          : {}),
      },
      include: this.campaignInclude(),
    });
    return this.shapeCampaign(updated);
  }

  // 广告商自暂停：ACTIVE → PAUSED（own 或团队代操作）
  async pauseCampaign(admin: AdminActor, id: string) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('广告不存在');
    if (admin.role === AdminRole.SPONSOR && campaign.advertiserId !== admin.id) {
      throw new ForbiddenException('仅可操作自己的广告');
    }
    if (campaign.status !== AdCampaignStatus.ACTIVE) {
      throw new BadRequestException('仅投放中的广告可暂停');
    }
    const updated = await this.prisma.adCampaign.update({
      where: { id },
      data: { status: AdCampaignStatus.PAUSED },
      include: this.campaignInclude(),
    });
    return this.shapeCampaign(updated);
  }

  // 恢复：PAUSED → ACTIVE（日期内）/ SCHEDULED（未到 startDate）；已过投放期不可恢复
  async resumeCampaign(admin: AdminActor, id: string) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('广告不存在');
    if (admin.role === AdminRole.SPONSOR && campaign.advertiserId !== admin.id) {
      throw new ForbiddenException('仅可操作自己的广告');
    }
    if (campaign.status !== AdCampaignStatus.PAUSED) {
      throw new BadRequestException('仅已暂停的广告可恢复');
    }
    const now = new Date();
    if (now > this.endOfDayUtc(campaign.endDate)) {
      throw new BadRequestException('广告已过投放期，无法恢复');
    }
    const nextStatus =
      campaign.startDate <= now ? AdCampaignStatus.ACTIVE : AdCampaignStatus.SCHEDULED;
    const updated = await this.prisma.adCampaign.update({
      where: { id },
      data: { status: nextStatus },
      include: this.campaignInclude(),
    });
    return this.shapeCampaign(updated);
  }

  // 平台强制下架：SCHEDULED/ACTIVE/PAUSED → SUSPENDED（团队最终下架权，§0.2）
  async suspendCampaign(admin: AdminActor, id: string, dto: SuspendCampaignDto) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('广告不存在');
    const suspendable: AdCampaignStatus[] = [
      AdCampaignStatus.SCHEDULED,
      AdCampaignStatus.ACTIVE,
      AdCampaignStatus.PAUSED,
    ];
    if (!suspendable.includes(campaign.status)) {
      throw new BadRequestException('当前状态不可强制下架');
    }
    const updated = await this.prisma.adCampaign.update({
      where: { id },
      data: {
        status: AdCampaignStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendReason: dto.reason,
      },
      include: this.campaignInclude(),
    });
    return this.shapeCampaign(updated);
  }

  // 解除下架：SUSPENDED → ACTIVE / SCHEDULED（未到 startDate）/ COMPLETED（已过期，触发结算）
  async unsuspendCampaign(admin: AdminActor, id: string) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('广告不存在');
    if (campaign.status !== AdCampaignStatus.SUSPENDED) {
      throw new BadRequestException('仅已下架的广告可恢复');
    }

    const now = new Date();
    let nextStatus: AdCampaignStatus;
    let completed = false;
    if (now < campaign.startDate) {
      nextStatus = AdCampaignStatus.SCHEDULED;
    } else if (now <= this.endOfDayUtc(campaign.endDate)) {
      nextStatus = AdCampaignStatus.ACTIVE;
    } else {
      nextStatus = AdCampaignStatus.COMPLETED;
      completed = true;
    }

    const updated = await this.prisma.adCampaign.update({
      where: { id },
      data: {
        status: nextStatus,
        suspendedAt: null,
        suspendReason: null,
        ...(completed ? { completedAt: now } : {}),
      },
      include: this.campaignInclude(),
    });
    if (completed) await this.settleCampaign(id);
    return this.shapeCampaign(updated);
  }

  // ─── 角色化总览（dashboard 用） ──────────────────────────────

  async getOverview(admin: AdminActor) {
    if (admin.role === AdminRole.SPONSOR) return this.sponsorOverview(admin);
    if (admin.role === AdminRole.STUDENT_UNION) return this.unionOverview(admin);
    return this.teamOverview(admin);
  }

  private sinceUtc(days: number): Date {
    return new Date(this.todayUtc().getTime() - (days - 1) * MS_PER_DAY);
  }

  // 缺日补零的日序列（图表友好）
  private buildDailySeries(
    rows: Array<{ date: Date; _sum: { impressions: number | null; clicks: number | null; spendCents: number | null } }>,
    days: number,
  ) {
    const byDay = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r._sum]));
    const series: Array<{ date: string; impressions: number; clicks: number; spendCents: number }> = [];
    const today = this.todayUtc();
    for (let i = days - 1; i >= 0; i--) {
      const key = new Date(today.getTime() - i * MS_PER_DAY).toISOString().slice(0, 10);
      const s = byDay.get(key);
      series.push({
        date: key,
        impressions: s?.impressions ?? 0,
        clicks: s?.clicks ?? 0,
        spendCents: s?.spendCents ?? 0,
      });
    }
    return series;
  }

  private async sponsorOverview(admin: AdminActor) {
    const since30 = this.sinceUtc(30);
    const [activeCampaigns, spendAgg, statRows] = await Promise.all([
      this.prisma.adCampaign.count({
        where: { advertiserId: admin.id, status: AdCampaignStatus.ACTIVE },
      }),
      this.prisma.adCampaign.aggregate({
        where: { advertiserId: admin.id },
        _sum: { spendCents: true },
      }),
      this.prisma.adDailyStat.groupBy({
        by: ['date'],
        where: { date: { gte: since30 }, campaign: { advertiserId: admin.id } },
        _sum: { impressions: true, clicks: true, spendCents: true },
      }),
    ]);
    // 一次按 30 天窗口取数；7 天序列从同批行裁出（buildDailySeries 只回看各自天数的键）
    const dailySeries30d = this.buildDailySeries(statRows, 30);
    const dailySeries7d = this.buildDailySeries(statRows, 7);
    return {
      role: AdminRole.SPONSOR,
      activeCampaigns,
      totalSpendCents: spendAgg._sum.spendCents ?? 0,
      impressions7d: dailySeries7d.reduce((a, s) => a + s.impressions, 0),
      clicks7d: dailySeries7d.reduce((a, s) => a + s.clicks, 0),
      dailySeries7d,
      dailySeries30d,
    };
  }

  private async unionOverview(admin: AdminActor) {
    const schoolId = this.requireUnionSchool(admin);
    const since30 = this.sinceUtc(30);
    const [pendingReviewCount, activeInSchool, spendAgg] = await Promise.all([
      this.prisma.adCampaign.count({
        where: { sourcedBySchoolId: schoolId, status: AdCampaignStatus.PENDING_UNION_REVIEW },
      }),
      this.prisma.adCampaign.count({
        where: { status: AdCampaignStatus.ACTIVE, placements: { some: { schoolId } } },
      }),
      this.prisma.adDailyStat.aggregate({
        where: { schoolId, date: { gte: since30 } },
        _sum: { spendCents: true },
      }),
    ]);
    return {
      role: AdminRole.STUDENT_UNION,
      pendingReviewCount,
      // 字段名与 dashboard 归一（原 activeInSchool）
      activeCampaignsInSchool: activeInSchool,
      schoolSpend30dCents: spendAgg._sum.spendCents ?? 0,
    };
  }

  private async teamOverview(admin: AdminActor) {
    const since30 = this.sinceUtc(30);
    const [pendingPlatformReview, activeCampaigns, statRows] = await Promise.all([
      this.prisma.adCampaign.count({
        where: { status: AdCampaignStatus.PENDING_PLATFORM_REVIEW },
      }),
      this.prisma.adCampaign.count({ where: { status: AdCampaignStatus.ACTIVE } }),
      this.prisma.adDailyStat.groupBy({
        by: ['date'],
        where: { date: { gte: since30 } },
        _sum: { impressions: true, clicks: true, spendCents: true },
      }),
    ]);
    const dailySeries30d = this.buildDailySeries(statRows, 30);
    return {
      role: admin.role ?? AdminRole.TEAM,
      pendingPlatformReview,
      activeCampaigns,
      // 字段名与 dashboard 归一（原 gross30dCents）
      adSpend30dCents: dailySeries30d.reduce((a, s) => a + s.spendCents, 0),
      dailySeries30d,
    };
  }

  // ─── H5 侧：feed / 事件上报（用户 JWT，§4 H5 侧） ─────────────

  // 当日可展示广告：ACTIVE 且日期内、placement 命中该校、CPM/CPC 预算未尽，随机轮换
  async getFeed(schoolName?: string, limit?: number) {
    const take = Math.min(Math.max(Number(limit) || 3, 1), 10);
    if (!schoolName) return [];

    const school = await this.prisma.school.findUnique({
      where: { name: schoolName },
      select: { id: true },
    });
    if (!school) return []; // 未知学校 → 空列表

    const now = new Date();
    const today = this.todayUtc();
    const candidates = await this.prisma.adCampaign.findMany({
      where: {
        status: AdCampaignStatus.ACTIVE,
        startDate: { lte: now },
        endDate: { gte: today }, // endDate 存 UTC 零点，>= 今日零点即含当日（end of day inclusive）
        placements: { some: { schoolId: school.id } },
      },
      select: {
        id: true,
        title: true,
        content: true,
        images: true,
        landingUrl: true,
        pricingModel: true,
        budgetCents: true,
        spendCents: true,
        advertiser: { select: { name: true, organizationName: true } },
      },
    });

    // CPM/CPC 预算耗尽的不再展示（Prisma 无法列间比较，内存过滤）
    const available = candidates.filter(
      (c) =>
        c.pricingModel === AdPricingModel.BUYOUT ||
        c.budgetCents == null ||
        c.spendCents < c.budgetCents,
    );

    // Fisher-Yates 洗牌实现随机轮换
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }

    return available.slice(0, take).map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content,
      images: c.images,
      landingUrl: c.landingUrl,
      advertiserName: c.advertiser.organizationName ?? c.advertiser.name,
    }));
  }

  // 批量事件上报：按 campaign+school+type 聚合 → AdDailyStat 累加 → 按快照单价重算消耗 →
  // 预算触顶自动 COMPLETED + 分成结算。非 ACTIVE / 未知学校 / 未投放该校的事件静默忽略。
  async reportEvents(dto: ReportAdEventsDto) {
    const events = dto.events ?? [];
    if (events.length === 0) return { accepted: 0 };

    // 学校名 → School（一次查询，含当前单价作快照缺失时的回退）
    const schoolNames = [...new Set(events.map((e) => e.school))];
    const schools = await this.prisma.school.findMany({
      where: { name: { in: schoolNames } },
      select: {
        id: true,
        name: true,
        buyoutDailyPriceCents: true,
        cpmPriceCents: true,
        cpcPriceCents: true,
      },
    });
    const schoolByName = new Map(schools.map((s) => [s.name, s]));
    const schoolById = new Map(schools.map((s) => [s.id, s]));
    const defaults = await this.getPricingDefaults();

    // 聚合：campaignId → schoolId → { impressions, clicks }
    const byCampaign = new Map<string, Map<string, { impressions: number; clicks: number }>>();
    for (const event of events) {
      const school = schoolByName.get(event.school);
      if (!school) continue; // 未知学校静默忽略
      let perSchool = byCampaign.get(event.campaignId);
      if (!perSchool) {
        perSchool = new Map();
        byCampaign.set(event.campaignId, perSchool);
      }
      let agg = perSchool.get(school.id);
      if (!agg) {
        agg = { impressions: 0, clicks: 0 };
        perSchool.set(school.id, agg);
      }
      if (event.type === 'impression') agg.impressions += 1;
      else agg.clicks += 1;
    }

    let accepted = 0;
    for (const [campaignId, perSchool] of byCampaign) {
      try {
        // 每个 campaign 一个事务：计数累加 + 消耗重算 + 预算触顶判定原子完成
        const result = await this.prisma.$transaction(async (tx) => {
          const campaign = await tx.adCampaign.findUnique({
            where: { id: campaignId },
            include: { placements: { select: { schoolId: true } } },
          });
          // 非 ACTIVE（含不存在）静默忽略（§4 H5 侧）
          if (!campaign || campaign.status !== AdCampaignStatus.ACTIVE) {
            return { applied: 0, completed: false };
          }

          const placedSchoolIds = new Set(campaign.placements.map((p) => p.schoolId));
          const snapshot =
            (campaign.priceSnapshot as Record<string, Partial<PriceSnapshotEntry>> | null) ?? {};
          const today = this.todayUtc();
          let applied = 0;
          let spendDelta = 0; // 本批次新增消耗（原子增量用，避免并发批次 SUM 重算互相覆盖）

          for (const [schoolId, agg] of perSchool) {
            if (!placedSchoolIds.has(schoolId)) continue; // 未投放该校，忽略

            const stat = await tx.adDailyStat.upsert({
              where: { campaignId_schoolId_date: { campaignId, schoolId, date: today } },
              create: {
                campaignId,
                schoolId,
                date: today,
                impressions: agg.impressions,
                clicks: agg.clicks,
              },
              update: {
                impressions: { increment: agg.impressions },
                clicks: { increment: agg.clicks },
              },
            });

            // 按快照单价重算当日该校消耗（快照缺失回退：当前学校覆盖价 → 全局默认价）
            const snap = snapshot[schoolId] ?? {};
            const school = schoolById.get(schoolId);
            let spendCents = stat.spendCents;
            if (campaign.pricingModel === AdPricingModel.CPM) {
              const cpm = snap.cpm ?? school?.cpmPriceCents ?? defaults.cpmPriceCents;
              spendCents = Math.floor((stat.impressions * cpm) / 1000);
            } else if (campaign.pricingModel === AdPricingModel.CPC) {
              const cpc = snap.cpc ?? school?.cpcPriceCents ?? defaults.cpcPriceCents;
              spendCents = stat.clicks * cpc;
            }
            // BUYOUT：消耗固定（确认收款时已锁定），事件不改 spend
            if (spendCents !== stat.spendCents) {
              await tx.adDailyStat.update({ where: { id: stat.id }, data: { spendCents } });
              spendDelta += spendCents - stat.spendCents;
            }
            applied += agg.impressions + agg.clicks;
          }

          // CPM/CPC：campaign.spendCents 原子增量（并发批次不丢更新）；预算触顶 → COMPLETED。
          // 展示值封顶到预算（瞬时超投部分不计费，结算端同样按预算封顶兜底）。
          let completed = false;
          if (campaign.pricingModel !== AdPricingModel.BUYOUT && spendDelta > 0) {
            const updated = await tx.adCampaign.update({
              where: { id: campaignId },
              data: { spendCents: { increment: spendDelta } },
            });
            completed = campaign.budgetCents != null && updated.spendCents >= campaign.budgetCents;
            if (completed) {
              await tx.adCampaign.update({
                where: { id: campaignId },
                data: {
                  spendCents: Math.min(updated.spendCents, campaign.budgetCents!),
                  status: AdCampaignStatus.COMPLETED,
                  completedAt: new Date(),
                },
              });
            }
          }
          return { applied, completed };
        });

        accepted += result.applied;
        // 预算耗尽 → 立即分成结算（settle 自带幂等与事务，需在上面事务提交后执行）
        if (result.completed) await this.settleCampaign(campaignId);
      } catch (e: any) {
        // 单个 campaign 失败不影响批次内其它上报
        this.logger.error(`广告事件上报处理失败（campaign=${campaignId}）：${e?.message ?? e}`);
      }
    }

    return { accepted };
  }

  // ─── 分成结算（幂等，§3 分成入账） ───────────────────────────

  // campaign 变 COMPLETED 时调用（调度器 / 事件预算触顶 / 解除下架已过期）。
  // 幂等：settledAt 抢占式标记；仅结算已确认收款（paidAt != null）的订单。
  async settleCampaign(campaignId: string) {
    await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.adCampaign.findUnique({
        where: { id: campaignId },
        include: {
          placements: {
            include: {
              school: { select: { id: true, platformShareBps: true, selfSourcedShareBps: true } },
            },
          },
        },
      });
      if (!campaign || campaign.settledAt || !campaign.paidAt) return;

      // 条件更新原子抢占幂等标记（并发结算时败者 count=0 直接退出）
      const claimed = await tx.adCampaign.updateMany({
        where: { id: campaignId, settledAt: null },
        data: { settledAt: new Date() },
      });
      if (claimed.count === 0) return;

      // 各校消耗合计（CPM/CPC 结算基数；BUYOUT 用锁定的包断价）
      const sums = await tx.adDailyStat.groupBy({
        by: ['schoolId'],
        where: { campaignId },
        _sum: { spendCents: true },
      });
      const spendBySchool = new Map(sums.map((s) => [s.schoolId, s._sum.spendCents ?? 0]));

      // 结算基数按实收预算封顶：事件路径可能瞬时超投（并发批次在 COMPLETED 落库前入账），
      // 分成只能基于广告商实际支付的金额，多校时按比例折算（向下取整，尾差归平台）。
      let clampScale = 1;
      let rawTotal = 0; // CPM/CPC 各校消耗合计（提出到 if 外，供下方结余退款块复用）
      if (campaign.pricingModel !== AdPricingModel.BUYOUT && campaign.budgetCents != null) {
        rawTotal = [...spendBySchool.values()].reduce((a, b) => a + b, 0);
        if (rawTotal > campaign.budgetCents) clampScale = campaign.budgetCents / rawTotal;
      }

      // 分成比例默认值：SystemConfig ad_share_defaults → seed 兜底（School override 在循环内）
      const shareDefaults = await this.getShareDefaults(tx);

      for (const p of campaign.placements) {
        const amount =
          campaign.pricingModel === AdPricingModel.BUYOUT
            ? (p.buyoutPriceCents ?? 0)
            : Math.floor((spendBySchool.get(p.schoolId) ?? 0) * clampScale);
        // 自拉单用 selfSourcedShareBps，平台直签用 platformShareBps（§3）
        // 三级解析（B2）：school override → SystemConfig(ad_share_defaults) → seed 默认兜底
        const shareBps =
          campaign.sourcedBySchoolId === p.schoolId
            ? (p.school.selfSourcedShareBps ?? shareDefaults.selfSourcedShareBps)
            : (p.school.platformShareBps ?? shareDefaults.platformShareBps);
        const shareCents = Math.floor((amount * shareBps) / 10000);
        if (shareCents > 0) {
          await tx.schoolLedgerEntry.create({
            data: {
              schoolId: p.schoolId,
              type: LedgerEntryType.AD_SHARE,
              amountCents: shareCents,
              refType: 'campaign',
              refId: campaignId,
              note: `广告分成：${campaign.title}`,
            },
          });
        }
      }

      // CPM/CPC 结余退款（能量经济 B2）：预算 − 实际消耗（按预算封顶）> 0 时退回广告商钱包。
      // 幂等与 settledAt 共用锚点——上方 claim 败者整段不执行，不会重复退。
      // 复查 ISSUE-2：结余额外按在途净额封顶——SUSPENDED 期人工已退（adjust 挂 campaignId）
      // 的部分不再重复退，恒不超过实际仍锁定的能量
      if (campaign.pricingModel !== AdPricingModel.BUYOUT && campaign.budgetCents != null) {
        const charged = Math.min(rawTotal, campaign.budgetCents);
        const outstanding = await this.sponsorWallet.outstandingForCampaign(
          tx,
          campaignId,
          campaign.advertiserId,
        );
        const leftover = Math.min(campaign.budgetCents - charged, outstanding);
        if (leftover > 0) {
          await tx.sponsorEnergyLedger.create({
            data: {
              adminId: campaign.advertiserId,
              type: SponsorLedgerType.REFUND,
              amountCents: leftover,
              refType: 'campaign',
              refId: campaignId,
              note: '结算结余退回（预算−实际消耗）',
            },
          });
        }
      }
    });
  }

  // 分成比例默认值（B2 三级解析的中间层）：SystemConfig ad_share_defaults 逐字段解析，
  // 缺失/非法回退 seed 默认（platform 10% / selfSourced 30%）；School override 在调用处
  private async getShareDefaults(
    tx: Prisma.TransactionClient,
  ): Promise<{ platformShareBps: number; selfSourcedShareBps: number }> {
    const config = await tx.systemConfig.findUnique({ where: { key: 'ad_share_defaults' } });
    const value = (config?.value as Record<string, any> | null) ?? {};
    // 照 getPricingDefaults 的防御式解析；分成比例允许合法取 0（不分成），故下限为 >= 0
    const pick = (raw: any, fallback: number): number => {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
    };
    return {
      platformShareBps: pick(value.platformShareBps, 1000),
      selfSourcedShareBps: pick(value.selfSourcedShareBps, 3000),
    };
  }

  // ─── BUYOUT 按天摊销（报表口径，§3） ──────────────────────────
  // 包断广告的消耗与流量无关（事件路径不写 spend），报表 gross 取自 AdDailyStat：
  // 每次调度 tick 将已投放天数的日消耗幂等写入日统计（首日起均摊，尾日吸收余数），
  // 否则收入报表/30 天流水会漏掉包断收入，平台留存出现负数。
  // capDate：完成结算前传 endDate，确保补齐全部投放日（自愈遗漏 tick）。
  async accrueBuyoutSpend(campaignId?: string, capDate?: Date) {
    const today = this.todayUtc();
    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        pricingModel: AdPricingModel.BUYOUT,
        paidAt: { not: null },
        ...(campaignId
          ? { id: campaignId }
          : { status: { in: [AdCampaignStatus.ACTIVE, AdCampaignStatus.PAUSED] } }),
      },
      include: { placements: { select: { schoolId: true, buyoutPriceCents: true } } },
    });

    for (const campaign of campaigns) {
      const totalDays = this.inclusiveDays(campaign.startDate, campaign.endDate);
      if (totalDays <= 0) continue;
      const cap = capDate && capDate < today ? capDate : today;
      const capped = cap < campaign.endDate ? cap : campaign.endDate;
      // 已投放天数（startDate 当日即第 1 天）
      const elapsedDays = Math.min(
        totalDays,
        Math.floor((capped.getTime() - campaign.startDate.getTime()) / MS_PER_DAY) + 1,
      );
      if (elapsedDays <= 0) continue;

      // 已有统计一次取出，只补差异（避免每 tick 盲写）
      const existing = await this.prisma.adDailyStat.findMany({
        where: { campaignId: campaign.id },
        select: { schoolId: true, date: true, spendCents: true },
      });
      const spendByKey = new Map(
        existing.map((s) => [`${s.schoolId}|${s.date.toISOString().slice(0, 10)}`, s.spendCents]),
      );

      for (const p of campaign.placements) {
        const price = p.buyoutPriceCents ?? 0;
        if (price <= 0) continue;
        const perDay = Math.floor(price / totalDays);
        const remainder = price - perDay * totalDays;

        for (let i = 0; i < elapsedDays; i++) {
          const date = new Date(campaign.startDate.getTime() + i * MS_PER_DAY);
          const value = perDay + (i === totalDays - 1 ? remainder : 0);
          const key = `${p.schoolId}|${date.toISOString().slice(0, 10)}`;
          if (spendByKey.get(key) === value) continue;
          await this.prisma.adDailyStat.upsert({
            where: {
              campaignId_schoolId_date: { campaignId: campaign.id, schoolId: p.schoolId, date },
            },
            create: { campaignId: campaign.id, schoolId: p.schoolId, date, spendCents: value },
            update: { spendCents: value },
          });
        }
      }
    }
  }
}
