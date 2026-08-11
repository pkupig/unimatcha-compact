import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdCampaignStatus, AdminRole, ConversionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActor } from '../admin-core/admin-actor';
import {
  CreateSchoolDto,
  UpdateAdPricingDefaultsDto,
  UpdateAdShareDefaultsDto,
  UpdateSchoolAdPricingDto,
  UpdateSchoolBankDto,
  UpdateSchoolDto,
} from './dto/schools.dto';

// 每校统计（用户数 / 进行中广告数 / 累计收入 / 可用余额，金额单位：分）
type SchoolStats = {
  userCount: number;
  activeCampaignCount: number;
  totalRevenueCents: number;
  balanceCents: number;
};

// SystemConfig 全局计价默认值 key + seed 缺省（docs/ADMIN-REDESIGN.md §3）
export const AD_PRICING_DEFAULTS_KEY = 'ad_pricing_defaults';
export const AD_PRICING_SEED_DEFAULTS = {
  buyoutDailyPriceCents: 20000,
  cpmPriceCents: 5000,
  cpcPriceCents: 200,
};

// SystemConfig 全局分成默认值 key + seed 缺省（能量经济 B4）
// School.platformShareBps / selfSourcedShareBps 为 null 时继承此处
export const AD_SHARE_DEFAULTS_KEY = 'ad_share_defaults';
export const AD_SHARE_SEED_DEFAULTS = {
  platformShareBps: 1000,
  selfSourcedShareBps: 3000,
};

@Injectable()
export class SchoolsService {
  constructor(private prisma: PrismaService) {}

  // ─── 学生会范围校验：只能访问本校 ───────────────────────────
  private assertUnionScope(admin: AdminActor, schoolId: string) {
    if (admin.role === AdminRole.STUDENT_UNION) {
      if (!admin.schoolId) throw new ForbiddenException('学生会账号未绑定学校');
      if (admin.schoolId !== schoolId) throw new ForbiddenException('学生会只能访问本校数据');
    }
  }

  // ─── 批量统计（groupBy 聚合，避免 N+1）────────────────────────
  // 能量余额定义（能量经济）：balance = Σ ledger.amountCents − Σ(PENDING 兑换申请金额)
  // （提现改冻现金侧；与 FinanceService.computeBalance 同口径）
  private async computeStats(
    schools: { id: string; name: string }[],
  ): Promise<Map<string, SchoolStats>> {
    const stats = new Map<string, SchoolStats>();
    if (schools.length === 0) return stats;

    const ids = schools.map((s) => s.id);
    const names = schools.map((s) => s.name);

    const [profileGroups, placementGroups, revenueGroups, ledgerGroups, frozenGroups] =
      await Promise.all([
        // 用户数：Profile.school 与 School.name 字符串相等匹配
        this.prisma.profile.groupBy({
          by: ['school'],
          where: { school: { in: names } },
          _count: { _all: true },
        }),
        // 进行中广告数：投放到该校且 campaign 处于 ACTIVE
        this.prisma.adPlacement.groupBy({
          by: ['schoolId'],
          where: { schoolId: { in: ids }, campaign: { status: AdCampaignStatus.ACTIVE } },
          _count: { _all: true },
        }),
        // 累计收入：正数 ledger 之和（AD_SHARE / SPONSOR_GRANT / 正向 ADJUSTMENT）
        this.prisma.schoolLedgerEntry.groupBy({
          by: ['schoolId'],
          where: { schoolId: { in: ids }, amountCents: { gt: 0 } },
          _sum: { amountCents: true },
        }),
        // 全量 ledger 之和（余额基数）
        this.prisma.schoolLedgerEntry.groupBy({
          by: ['schoolId'],
          where: { schoolId: { in: ids } },
          _sum: { amountCents: true },
        }),
        // 在途冻结：PENDING 兑换申请（能量经济后提现改冻现金侧，
        // 能量余额口径与 FinanceService.computeBalance 保持一致）
        this.prisma.schoolConversionRequest.groupBy({
          by: ['schoolId'],
          where: {
            schoolId: { in: ids },
            status: ConversionStatus.PENDING,
          },
          _sum: { amountCents: true },
        }),
      ]);

    const userCountByName = new Map(profileGroups.map((g) => [g.school, g._count._all]));
    const activeBySchool = new Map(placementGroups.map((g) => [g.schoolId, g._count._all]));
    const revenueBySchool = new Map(revenueGroups.map((g) => [g.schoolId, g._sum.amountCents ?? 0]));
    const ledgerBySchool = new Map(ledgerGroups.map((g) => [g.schoolId, g._sum.amountCents ?? 0]));
    const frozenBySchool = new Map(frozenGroups.map((g) => [g.schoolId, g._sum.amountCents ?? 0]));

    for (const s of schools) {
      stats.set(s.id, {
        userCount: userCountByName.get(s.name) ?? 0,
        activeCampaignCount: activeBySchool.get(s.id) ?? 0,
        totalRevenueCents: revenueBySchool.get(s.id) ?? 0,
        balanceCents: (ledgerBySchool.get(s.id) ?? 0) - (frozenBySchool.get(s.id) ?? 0),
      });
    }
    return stats;
  }

  // ─── 列表（学生会仅见本校；含统计）───────────────────────────
  async list(
    admin: AdminActor,
    params: { search?: string; isActive?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.SchoolWhereInput = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { city: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (typeof params.isActive === 'string') where.isActive = params.isActive === 'true';

    // 学生会：强制只返回本校
    if (admin.role === AdminRole.STUDENT_UNION) {
      if (!admin.schoolId) throw new ForbiddenException('学生会账号未绑定学校');
      where.id = admin.schoolId;
    }

    // 商家：仅启用学校，返回瘦身字段 + 生效单价（选校与实时报价用），
    // 不暴露分成配置 / 银行账户 / 运营统计
    if (admin.role === AdminRole.SPONSOR) {
      where.isActive = true;
      const [sponsorSchools, sponsorTotal] = await Promise.all([
        this.prisma.school.findMany({ where, skip, take: limit, orderBy: { createdAt: 'asc' } }),
        this.prisma.school.count({ where }),
      ]);
      const defaults = await this.getAdPricingDefaults();
      const items = sponsorSchools.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        isActive: s.isActive,
        effectivePrices: {
          buyoutDailyPriceCents: s.buyoutDailyPriceCents ?? defaults.buyoutDailyPriceCents,
          cpmPriceCents: s.cpmPriceCents ?? defaults.cpmPriceCents,
          cpcPriceCents: s.cpcPriceCents ?? defaults.cpcPriceCents,
        },
      }));
      return { items, total: sponsorTotal, page, limit };
    }

    const [schools, total] = await Promise.all([
      this.prisma.school.findMany({ where, skip, take: limit, orderBy: { createdAt: 'asc' } }),
      this.prisma.school.count({ where }),
    ]);

    const stats = await this.computeStats(schools);
    const items = schools.map((s) => ({ ...s, stats: stats.get(s.id) }));

    return { items, total, page, limit };
  }

  // ─── 创建（SUPER/TEAM；name 唯一）────────────────────────────
  async create(dto: CreateSchoolDto) {
    const existing = await this.prisma.school.findUnique({ where: { name: dto.name } });
    if (existing) throw new BadRequestException('该学校名已存在');

    return this.prisma.school.create({
      data: {
        name: dto.name,
        city: dto.city ?? null,
        isActive: dto.isActive ?? true,
        // null = 继承全局 ad_share_defaults（能量经济起不再落死默认值）
        platformShareBps: dto.platformShareBps ?? null,
        selfSourcedShareBps: dto.selfSourcedShareBps ?? null,
        buyoutDailyPriceCents: dto.buyoutDailyPriceCents ?? null,
        cpmPriceCents: dto.cpmPriceCents ?? null,
        cpcPriceCents: dto.cpcPriceCents ?? null,
      },
    });
  }

  // ─── 详情 + 统计（学生会仅本校）──────────────────────────────
  async detail(admin: AdminActor, id: string) {
    this.assertUnionScope(admin, id);

    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) throw new NotFoundException('学校不存在');

    const stats = await this.computeStats([school]);
    return { ...school, stats: stats.get(school.id) };
  }

  // ─── 更新基本信息 / 分成 bps / 计价覆盖（SUPER/TEAM）──────────
  // 计价覆盖字段传 null = 清除覆盖（回落全局默认）
  async update(id: string, dto: UpdateSchoolDto) {
    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) throw new NotFoundException('学校不存在');

    if (dto.name !== undefined && dto.name !== school.name) {
      const dup = await this.prisma.school.findUnique({ where: { name: dto.name } });
      if (dup) throw new BadRequestException('该学校名已存在');
    }

    const data: Prisma.SchoolUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.platformShareBps !== undefined) data.platformShareBps = dto.platformShareBps;
    if (dto.selfSourcedShareBps !== undefined) data.selfSourcedShareBps = dto.selfSourcedShareBps;
    if (dto.buyoutDailyPriceCents !== undefined) data.buyoutDailyPriceCents = dto.buyoutDailyPriceCents;
    if (dto.cpmPriceCents !== undefined) data.cpmPriceCents = dto.cpmPriceCents;
    if (dto.cpcPriceCents !== undefined) data.cpcPriceCents = dto.cpcPriceCents;

    return this.prisma.school.update({ where: { id }, data });
  }

  // ─── 绑定银行账户（UNION 本校 / SUPER/TEAM）───────────────────
  async updateBank(admin: AdminActor, id: string, dto: UpdateSchoolBankDto) {
    this.assertUnionScope(admin, id);

    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) throw new NotFoundException('学校不存在');

    return this.prisma.school.update({
      where: { id },
      data: {
        bankAccountName: dto.bankAccountName,
        bankName: dto.bankName,
        bankAccountNo: dto.bankAccountNo,
      },
    });
  }

  // ─── 学生会自设本校单价（UNION 仅本校 / SUPER/TEAM 任意）───────
  // 只写计价覆盖三字段：undefined = 不动；null = 清除覆盖，回落全局默认
  // （语义与 update 的计价处理一致；分成 bps / 基本信息不经此入口）
  async updateAdPricing(admin: AdminActor, id: string, dto: UpdateSchoolAdPricingDto) {
    this.assertUnionScope(admin, id);

    const school = await this.prisma.school.findUnique({ where: { id } });
    if (!school) throw new NotFoundException('学校不存在');

    const data: Prisma.SchoolUpdateInput = {};
    if (dto.buyoutDailyPriceCents !== undefined) data.buyoutDailyPriceCents = dto.buyoutDailyPriceCents;
    if (dto.cpmPriceCents !== undefined) data.cpmPriceCents = dto.cpmPriceCents;
    if (dto.cpcPriceCents !== undefined) data.cpcPriceCents = dto.cpcPriceCents;

    return this.prisma.school.update({ where: { id }, data });
  }

  // ─── 全局计价默认值（SystemConfig: ad_pricing_defaults）────────
  async getAdPricingDefaults() {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: AD_PRICING_DEFAULTS_KEY },
    });
    // 配置行缺失时返回 seed 默认值（§3：buyoutDaily=20000 / cpm=5000 / cpc=200）
    const value = (config?.value as Record<string, number> | null) ?? {};
    return {
      buyoutDailyPriceCents: value.buyoutDailyPriceCents ?? AD_PRICING_SEED_DEFAULTS.buyoutDailyPriceCents,
      cpmPriceCents: value.cpmPriceCents ?? AD_PRICING_SEED_DEFAULTS.cpmPriceCents,
      cpcPriceCents: value.cpcPriceCents ?? AD_PRICING_SEED_DEFAULTS.cpcPriceCents,
    };
  }

  async updateAdPricingDefaults(dto: UpdateAdPricingDefaultsDto) {
    const value = {
      buyoutDailyPriceCents: dto.buyoutDailyPriceCents,
      cpmPriceCents: dto.cpmPriceCents,
      cpcPriceCents: dto.cpcPriceCents,
    };
    await this.prisma.systemConfig.upsert({
      where: { key: AD_PRICING_DEFAULTS_KEY },
      update: { value },
      create: { key: AD_PRICING_DEFAULTS_KEY, value },
    });
    return value;
  }

  // ─── 全局分成默认值（SystemConfig: ad_share_defaults）──────────
  async getAdShareDefaults(): Promise<{ platformShareBps: number; selfSourcedShareBps: number }> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: AD_SHARE_DEFAULTS_KEY },
    });
    // 配置行缺失时返回 seed 默认值（平台直签 1000 bps / 学生会自拉 3000 bps）
    const value = (config?.value as Record<string, number> | null) ?? {};
    return {
      platformShareBps: value.platformShareBps ?? AD_SHARE_SEED_DEFAULTS.platformShareBps,
      selfSourcedShareBps: value.selfSourcedShareBps ?? AD_SHARE_SEED_DEFAULTS.selfSourcedShareBps,
    };
  }

  async updateAdShareDefaults(dto: UpdateAdShareDefaultsDto) {
    const value = {
      platformShareBps: dto.platformShareBps,
      selfSourcedShareBps: dto.selfSourcedShareBps,
    };
    await this.prisma.systemConfig.upsert({
      where: { key: AD_SHARE_DEFAULTS_KEY },
      update: { value },
      create: { key: AD_SHARE_DEFAULTS_KEY, value },
    });
    return value;
  }
}
