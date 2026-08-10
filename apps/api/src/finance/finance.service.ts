import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, LedgerEntryType, Prisma, WithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAdjustmentDto,
  CreateGrantDto,
  CreateWithdrawalDto,
  ReviewWithdrawalDto,
} from './dto/finance.dto';
import { AdminActor } from '../admin-core/admin-actor';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  // ─── 学生会范围校验：只能操作本校 ───────────────────────────
  private assertUnionScope(admin: AdminActor, schoolId: string) {
    if (admin.role === AdminRole.STUDENT_UNION) {
      if (!admin.schoolId) throw new ForbiddenException('学生会账号未绑定学校');
      if (admin.schoolId !== schoolId) throw new ForbiddenException('学生会只能访问本校财务数据');
    }
  }

  // ─── 余额计算（§2）────────────────────────────────────────────
  // balance = Σ ledger.amountCents − Σ(PENDING/APPROVED 提现金额)（冻结在途）
  // 传入 tx 时在事务内读取（提现下单需 fresh read 防双花）。
  // public：全后端余额的唯一规范实现（AdminService 仪表盘复用；SchoolsService
  // 的批量 groupBy 版是其等价批量形态）
  async computeBalance(tx: Prisma.TransactionClient, schoolId: string) {
    const [ledgerAgg, frozenAgg] = await Promise.all([
      tx.schoolLedgerEntry.aggregate({
        where: { schoolId },
        _sum: { amountCents: true },
      }),
      tx.withdrawalRequest.aggregate({
        where: {
          schoolId,
          status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED] },
        },
        _sum: { amountCents: true },
      }),
    ]);
    const ledgerTotalCents = ledgerAgg._sum.amountCents ?? 0;
    const frozenCents = frozenAgg._sum.amountCents ?? 0;
    return { balance: ledgerTotalCents - frozenCents, frozenCents };
  }

  // ─── 学校财务概要：余额 / 累计收入 / 冻结 / 分页明细 ───────────
  async getSchoolSummary(
    admin: AdminActor,
    schoolId: string,
    params: { page?: number; limit?: number },
  ) {
    this.assertUnionScope(admin, schoolId);

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    });
    if (!school) throw new NotFoundException('学校不存在');

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const [{ balance, frozenCents }, incomeAgg, entries, total] = await Promise.all([
      this.computeBalance(this.prisma, schoolId),
      // 累计收入 = 正数 ledger 之和
      this.prisma.schoolLedgerEntry.aggregate({
        where: { schoolId, amountCents: { gt: 0 } },
        _sum: { amountCents: true },
      }),
      this.prisma.schoolLedgerEntry.findMany({
        where: { schoolId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.schoolLedgerEntry.count({ where: { schoolId } }),
    ]);

    return {
      schoolId: school.id,
      schoolName: school.name,
      balanceCents: balance,
      totalIncomeCents: incomeAgg._sum.amountCents ?? 0,
      frozenCents,
      ledger: { items: entries, total, page, limit },
    };
  }

  // ─── 发放赞助额度（SPONSOR_GRANT 正数入账，SUPER/TEAM）─────────
  async createGrant(admin: AdminActor, dto: CreateGrantDto) {
    const school = await this.prisma.school.findUnique({ where: { id: dto.schoolId } });
    if (!school) throw new NotFoundException('学校不存在');

    return this.prisma.schoolLedgerEntry.create({
      data: {
        schoolId: dto.schoolId,
        type: LedgerEntryType.SPONSOR_GRANT,
        amountCents: dto.amountCents,
        refType: 'grant',
        note: dto.note ?? null,
        createdByAdminId: admin.id,
      },
    });
  }

  // ─── 手工调整（ADJUSTMENT 有符号，SUPER/TEAM，备注必填）────────
  async createAdjustment(admin: AdminActor, dto: CreateAdjustmentDto) {
    // DTO 已校验非 0，此处兜底
    if (dto.amountCents === 0) throw new BadRequestException('调整金额不能为 0');

    const school = await this.prisma.school.findUnique({ where: { id: dto.schoolId } });
    if (!school) throw new NotFoundException('学校不存在');

    return this.prisma.schoolLedgerEntry.create({
      data: {
        schoolId: dto.schoolId,
        type: LedgerEntryType.ADJUSTMENT,
        amountCents: dto.amountCents,
        note: dto.note,
        createdByAdminId: admin.id,
      },
    });
  }

  // ─── 学生会发起提现（PENDING，快照银行卡）──────────────────────
  // 银行卡校验 + fresh 余额读取 + 创建置于同一 Serializable 事务：
  // 并发两笔提现在 Read Committed 下可能都读到扣减前余额而双双通过（双花），
  // Serializable 下冲突事务被数据库回滚，保证余额不会被超提。
  async createWithdrawal(admin: AdminActor, dto: CreateWithdrawalDto) {
    const schoolId = admin.schoolId;
    if (!schoolId) throw new ForbiddenException('学生会账号未绑定学校');

    return this.prisma.$transaction(
      async (tx) => {
        const school = await tx.school.findUnique({
          where: { id: schoolId },
          select: { id: true, bankAccountName: true, bankName: true, bankAccountNo: true },
        });
        if (!school) throw new NotFoundException('学校不存在');
        if (!school.bankAccountName || !school.bankName || !school.bankAccountNo) {
          throw new BadRequestException('请先绑定银行账户');
        }

        const { balance } = await this.computeBalance(tx, schoolId);
        if (dto.amountCents > balance) throw new BadRequestException('余额不足');

        return tx.withdrawalRequest.create({
          data: {
            schoolId,
            amountCents: dto.amountCents,
            status: WithdrawalStatus.PENDING,
            // 申请时快照银行卡（此后改绑不影响在途提现）
            bankSnapshot: {
              accountName: school.bankAccountName,
              bankName: school.bankName,
              accountNo: school.bankAccountNo,
            },
            requestedByAdminId: admin.id,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // ─── 提现列表（学生会仅本校；团队可按 status/schoolId 过滤）─────
  async listWithdrawals(
    admin: AdminActor,
    params: { status?: string; schoolId?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.WithdrawalRequestWhereInput = {};
    if (params.status) {
      if (!Object.values(WithdrawalStatus).includes(params.status as WithdrawalStatus)) {
        throw new BadRequestException('无效的提现状态');
      }
      where.status = params.status as WithdrawalStatus;
    }
    if (params.schoolId) where.schoolId = params.schoolId;

    // 学生会：强制只看本校
    if (admin.role === AdminRole.STUDENT_UNION) {
      if (!admin.schoolId) throw new ForbiddenException('学生会账号未绑定学校');
      where.schoolId = admin.schoolId;
    }

    const [items, total] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { school: { select: { id: true, name: true } } },
      }),
      this.prisma.withdrawalRequest.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // ─── 审核提现（SUPER/TEAM：PENDING → APPROVED / REJECTED）──────
  async reviewWithdrawal(admin: AdminActor, id: string, dto: ReviewWithdrawalDto) {
    const request = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('提现申请不存在');
    if (request.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException('仅待审核状态的提现申请可审核');
    }

    // updateMany 带状态条件：并发重复审核时败者命中 0 行，不会覆盖前者结果
    const result = await this.prisma.withdrawalRequest.updateMany({
      where: { id, status: WithdrawalStatus.PENDING },
      data: {
        status: dto.approve ? WithdrawalStatus.APPROVED : WithdrawalStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedByAdminId: admin.id,
        reviewNote: dto.note ?? null,
      },
    });
    if (result.count === 0) throw new BadRequestException('仅待审核状态的提现申请可审核');

    return this.prisma.withdrawalRequest.findUnique({
      where: { id },
      include: { school: { select: { id: true, name: true } } },
    });
  }

  // ─── 标记已打款（SUPER/TEAM：APPROVED → PAID + 负数 ledger）─────
  // 状态流转与负数 WITHDRAWAL 入账放同一事务；updateMany 状态条件保证
  // 并发重复点击只会入账一次（败者命中 0 行抛错回滚）
  async markWithdrawalPaid(admin: AdminActor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException('提现申请不存在');
      if (request.status !== WithdrawalStatus.APPROVED) {
        throw new BadRequestException('仅审核通过状态的提现申请可标记打款');
      }

      const result = await tx.withdrawalRequest.updateMany({
        where: { id, status: WithdrawalStatus.APPROVED },
        data: { status: WithdrawalStatus.PAID, paidAt: new Date() },
      });
      if (result.count === 0) throw new BadRequestException('仅审核通过状态的提现申请可标记打款');

      // 打款即出账：负数 WITHDRAWAL ledger（释放冻结、扣减余额）
      await tx.schoolLedgerEntry.create({
        data: {
          schoolId: request.schoolId,
          type: LedgerEntryType.WITHDRAWAL,
          amountCents: -request.amountCents,
          refType: 'withdrawal',
          refId: request.id,
          note: '提现打款',
          createdByAdminId: admin.id,
        },
      });

      return tx.withdrawalRequest.findUnique({
        where: { id },
        include: { school: { select: { id: true, name: true } } },
      });
    });
  }

  // ─── 分校收入报表（SUPER/TEAM，可选 from/to 日期范围）───────────
  // 每校：广告总消耗（AdDailyStat.spendCents）、学校分成（AD_SHARE ledger）、
  // 平台留存 = 消耗 − 分成、赞助发放（SPONSOR_GRANT）、已打款提现（WITHDRAWAL 绝对值）
  async getRevenueReport(params: { from?: string; to?: string }) {
    const fromDate = params.from ? new Date(params.from) : undefined;
    const toDate = params.to ? new Date(params.to) : undefined;
    if ((fromDate && isNaN(fromDate.getTime())) || (toDate && isNaN(toDate.getTime()))) {
      throw new BadRequestException('日期格式不正确');
    }

    // AdDailyStat.date 为 @db.Date（当日 00:00 UTC）：gte/lte 即含边界日
    const dateRange: Prisma.DateTimeFilter | undefined =
      fromDate || toDate
        ? { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) }
        : undefined;

    // ledger.createdAt 为时间戳：to 需含当天全部记录，取次日 00:00 做开区间上界
    let toEnd: Date | undefined;
    if (toDate) {
      toEnd = new Date(toDate);
      toEnd.setUTCDate(toEnd.getUTCDate() + 1);
    }
    const createdAtRange: Prisma.DateTimeFilter | undefined =
      fromDate || toEnd
        ? { ...(fromDate && { gte: fromDate }), ...(toEnd && { lt: toEnd }) }
        : undefined;

    const ledgerRange = createdAtRange ? { createdAt: createdAtRange } : {};

    const [schools, spendGroups, shareGroups, grantGroups, withdrawalGroups] = await Promise.all([
      this.prisma.school.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      }),
      // 广告总消耗（gross）：按校汇总日统计
      this.prisma.adDailyStat.groupBy({
        by: ['schoolId'],
        where: dateRange ? { date: dateRange } : {},
        _sum: { spendCents: true },
      }),
      // 学校分成
      this.prisma.schoolLedgerEntry.groupBy({
        by: ['schoolId'],
        where: { type: LedgerEntryType.AD_SHARE, ...ledgerRange },
        _sum: { amountCents: true },
      }),
      // 赞助发放
      this.prisma.schoolLedgerEntry.groupBy({
        by: ['schoolId'],
        where: { type: LedgerEntryType.SPONSOR_GRANT, ...ledgerRange },
        _sum: { amountCents: true },
      }),
      // 已打款提现（ledger 为负数，报表取绝对值）
      this.prisma.schoolLedgerEntry.groupBy({
        by: ['schoolId'],
        where: { type: LedgerEntryType.WITHDRAWAL, ...ledgerRange },
        _sum: { amountCents: true },
      }),
    ]);

    const spendBySchool = new Map(spendGroups.map((g) => [g.schoolId, g._sum.spendCents ?? 0]));
    const shareBySchool = new Map(shareGroups.map((g) => [g.schoolId, g._sum.amountCents ?? 0]));
    const grantBySchool = new Map(grantGroups.map((g) => [g.schoolId, g._sum.amountCents ?? 0]));
    const withdrawalBySchool = new Map(
      withdrawalGroups.map((g) => [g.schoolId, g._sum.amountCents ?? 0]),
    );

    const items = schools.map((s) => {
      const grossAdSpendCents = spendBySchool.get(s.id) ?? 0;
      const schoolShareCents = shareBySchool.get(s.id) ?? 0;
      return {
        schoolId: s.id,
        schoolName: s.name,
        grossAdSpendCents,
        schoolShareCents,
        platformKeepCents: grossAdSpendCents - schoolShareCents,
        grantCents: grantBySchool.get(s.id) ?? 0,
        withdrawalPaidCents: Math.abs(withdrawalBySchool.get(s.id) ?? 0),
      };
    });

    // 汇总行（前端报表页合计用）
    const totals = items.reduce(
      (acc, r) => ({
        grossAdSpendCents: acc.grossAdSpendCents + r.grossAdSpendCents,
        schoolShareCents: acc.schoolShareCents + r.schoolShareCents,
        platformKeepCents: acc.platformKeepCents + r.platformKeepCents,
        grantCents: acc.grantCents + r.grantCents,
        withdrawalPaidCents: acc.withdrawalPaidCents + r.withdrawalPaidCents,
      }),
      {
        grossAdSpendCents: 0,
        schoolShareCents: 0,
        platformKeepCents: 0,
        grantCents: 0,
        withdrawalPaidCents: 0,
      },
    );

    return { from: params.from ?? null, to: params.to ?? null, items, totals };
  }
}
