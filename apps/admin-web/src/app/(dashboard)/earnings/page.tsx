'use client';

/**
 * /earnings — 收益提现（STUDENT_UNION 专属）
 * 顶部：可用余额 / 累计收入 / 冻结中（在途提现）
 * 中部：银行账户（展示已绑卡 / 绑定表单）+ 申请提现
 * 底部：提现记录 + 收支明细（分页 ledger）
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Wallet, Landmark, ReceiptText, HandCoins } from 'lucide-react';
import {
  getFinanceSummary,
  getSchool,
  getWithdrawals,
  createWithdrawal,
  updateSchoolBank,
  type School,
  type LedgerEntry,
  type WithdrawalRequest,
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Card,
  StatCard,
  DataTable,
  StatusBadge,
  Money,
  Badge,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  RoleGate,
  useAdminInfo,
  LEDGER_TYPE_LABELS,
  type Column,
} from '@/components/ui';

const LIMIT = 10;

/** 元字符串 → 分；非法/非正数返回 null */
function yuanToFen(input: string): number | null {
  const v = parseFloat(input);
  if (isNaN(v) || v <= 0) return null;
  return Math.round(v * 100);
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/30">
      <span className="text-xs text-on-surface-variant font-mono">
        第 {page} / {totalPages} 页 · 共 {total} 条
      </span>
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          上一页
        </button>
        <button
          className="btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}

interface SummaryState {
  balanceCents: number;
  totalIncomeCents: number;
  frozenCents: number;
}

function EarningsInner() {
  const admin = useAdminInfo();
  const schoolId = admin?.schoolId || '';

  const [summary, setSummary] = useState<SummaryState | null>(null);
  const [school, setSchool] = useState<School | null>(null);

  // 收支明细（分页 ledger，来自 finance summary）
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  // 提现记录
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [wTotal, setWTotal] = useState(0);
  const [wPage, setWPage] = useState(1);
  const [wLoading, setWLoading] = useState(true);

  // 银行账户表单
  const [editingBank, setEditingBank] = useState(false);
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankSaving, setBankSaving] = useState(false);

  // 申请提现
  const [amountYuan, setAmountYuan] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const loadSummary = useCallback(
    async (page: number) => {
      if (!schoolId) return;
      setLedgerLoading(true);
      try {
        const res = await getFinanceSummary(schoolId, { page, limit: LIMIT });
        const d = (res as any).data || {};
        setSummary({
          // 后端返回字段名为 balance（分）
          balanceCents: d.balance ?? d.balanceCents ?? 0,
          totalIncomeCents: d.totalIncomeCents ?? 0,
          frozenCents: d.frozenCents ?? 0,
        });
        const entries: LedgerEntry[] = Array.isArray(d.ledger)
          ? d.ledger
          : d.ledger?.items || d.ledger?.list || [];
        setLedger(entries);
        setLedgerTotal(d.total ?? d.ledger?.total ?? entries.length);
      } catch (err: any) {
        toast.error(err?.message || '加载收支数据失败');
      } finally {
        setLedgerLoading(false);
      }
    },
    [schoolId],
  );

  const loadSchool = useCallback(async () => {
    if (!schoolId) return;
    try {
      const res = await getSchool(schoolId);
      const s: School = (res as any).data;
      setSchool(s);
      setBankAccountName(s?.bankAccountName || '');
      setBankName(s?.bankName || '');
      setBankAccountNo(s?.bankAccountNo || '');
    } catch (err: any) {
      toast.error(err?.message || '加载学校信息失败');
    }
  }, [schoolId]);

  const loadWithdrawals = useCallback(
    async (page: number) => {
      if (!schoolId) return;
      setWLoading(true);
      try {
        // UNION 角色后端自动 scope 到本校
        const res = await getWithdrawals({ page, limit: LIMIT });
        const d = (res as any).data;
        const items: WithdrawalRequest[] = Array.isArray(d)
          ? d
          : d?.withdrawals || d?.items || d?.list || [];
        setWithdrawals(items);
        setWTotal(d?.total ?? items.length);
      } catch (err: any) {
        toast.error(err?.message || '加载提现记录失败');
      } finally {
        setWLoading(false);
      }
    },
    [schoolId],
  );

  useEffect(() => {
    loadSummary(ledgerPage);
  }, [loadSummary, ledgerPage]);
  useEffect(() => {
    loadSchool();
  }, [loadSchool]);
  useEffect(() => {
    loadWithdrawals(wPage);
  }, [loadWithdrawals, wPage]);

  const hasBank = !!school?.bankAccountNo;
  const balance = summary?.balanceCents ?? 0;
  const amountCents = yuanToFen(amountYuan);

  const handleSaveBank = async () => {
    if (!bankAccountName.trim() || !bankName.trim() || !bankAccountNo.trim()) {
      toast.error('请完整填写户名、银行与卡号');
      return;
    }
    setBankSaving(true);
    try {
      await updateSchoolBank(schoolId, {
        bankAccountName: bankAccountName.trim(),
        bankName: bankName.trim(),
        bankAccountNo: bankAccountNo.trim(),
      });
      toast.success('银行账户已保存');
      setEditingBank(false);
      loadSchool();
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setBankSaving(false);
    }
  };

  const openWithdrawConfirm = () => {
    if (!hasBank) return;
    if (amountCents == null) {
      toast.error('请输入有效的提现金额');
      return;
    }
    if (amountCents > balance) {
      toast.error('提现金额不能超过可用余额');
      return;
    }
    setConfirmOpen(true);
  };

  const handleWithdraw = async () => {
    if (amountCents == null) return;
    setWithdrawing(true);
    try {
      await createWithdrawal({ amountCents });
      toast.success('提现申请已提交，等待平台审核');
      setAmountYuan('');
      setConfirmOpen(false);
      setWPage(1);
      loadWithdrawals(1);
      loadSummary(ledgerPage);
    } catch (err: any) {
      toast.error(err?.message || '提交失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const withdrawalCols: Column<WithdrawalRequest>[] = [
    {
      key: 'amount',
      title: '金额',
      align: 'right',
      render: (w) => <Money cents={w.amountCents} className="font-bold" />,
    },
    {
      key: 'status',
      title: '状态',
      render: (w) => <StatusBadge status={w.status} kind="withdrawal" />,
    },
    {
      key: 'createdAt',
      title: '申请时间',
      render: (w) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDateTime(w.createdAt)}
        </span>
      ),
    },
    {
      key: 'reviewNote',
      title: '审核备注',
      render: (w) => (
        <span className="text-xs text-on-surface-variant line-clamp-1 max-w-[200px]">
          {w.reviewNote || '-'}
        </span>
      ),
    },
  ];

  const ledgerCols: Column<LedgerEntry>[] = [
    {
      key: 'type',
      title: '类型',
      render: (e) => (
        <Badge variant="outline">{LEDGER_TYPE_LABELS[e.type] || e.type}</Badge>
      ),
    },
    {
      key: 'amount',
      title: '金额',
      align: 'right',
      render: (e) => <Money cents={e.amountCents} signed className="font-bold" />,
    },
    {
      key: 'note',
      title: '备注',
      render: (e) => (
        <span className="text-xs text-on-surface-variant line-clamp-1 max-w-[240px]">
          {e.note || '-'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      title: '时间',
      render: (e) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDateTime(e.createdAt)}
        </span>
      ),
    },
  ];

  if (!admin) return null;

  if (!schoolId) {
    return (
      <div className="space-y-6">
        <PageHeader caption="EARNINGS" title="收益提现" />
        <div className="card">
          <EmptyState
            icon={Wallet}
            title="账号未绑定学校"
            sub="请联系平台团队为该学生会账号绑定学校后再使用收益提现。"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        caption="EARNINGS"
        title="收益提现"
        sub={admin?.schoolName ? `${admin.schoolName} · 广告分成与平台赞助收益` : '广告分成与平台赞助收益'}
      />

      {/* 余额概览 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="可用余额 / BALANCE"
          value={<Money cents={balance} />}
          accent="neon"
          icon={Wallet}
          sub="可申请提现的金额"
        />
        <StatCard
          label="累计收入 / TOTAL INCOME"
          value={<Money cents={summary?.totalIncomeCents} />}
          icon={HandCoins}
          sub="广告分成 + 平台赞助累计"
        />
        <StatCard
          label="冻结中 / FROZEN"
          value={<Money cents={summary?.frozenCents} />}
          accent="ink"
          icon={Landmark}
          sub="在途提现（待审核 / 待打款）"
        />
      </div>

      {/* 银行账户 + 申请提现 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          caption="BANK ACCOUNT"
          title="银行账户"
          actions={
            hasBank && !editingBank ? (
              <button className="btn-secondary btn-sm" onClick={() => setEditingBank(true)}>
                修改
              </button>
            ) : undefined
          }
        >
          {hasBank && !editingBank ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">户名</span>
                <span className="font-medium">{school?.bankAccountName || '-'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">开户银行</span>
                <span className="font-medium">{school?.bankName || '-'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">卡号</span>
                <span className="font-mono">{school?.bankAccountNo || '-'}</span>
              </div>
              <p className="text-xs text-outline pt-1">
                提现申请时会对当前银行信息做快照，修改不影响已提交的申请。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="户名" required>
                <Input
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder="对公账户户名"
                />
              </Field>
              <Field label="开户银行" required>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="例如：中国银行"
                />
              </Field>
              <Field label="卡号" required>
                <Input
                  className="font-mono"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                  placeholder="银行卡 / 对公账号"
                />
              </Field>
              <div className="flex justify-end gap-2">
                {hasBank && (
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setEditingBank(false);
                      loadSchool();
                    }}
                    disabled={bankSaving}
                  >
                    取消
                  </button>
                )}
                <button className="btn-primary btn-sm" onClick={handleSaveBank} disabled={bankSaving}>
                  {bankSaving ? '保存中…' : '保存银行账户'}
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card caption="WITHDRAW" title="申请提现">
          <div className="space-y-4">
            <Field
              label="提现金额（元）"
              required
              hint={
                <>
                  可用余额 <Money cents={balance} />
                  {amountCents != null && amountCents > balance && (
                    <span className="text-neon-pink ml-2">超出可用余额</span>
                  )}
                </>
              }
            >
              <Input
                type="number"
                min={0.01}
                step={0.01}
                inputMode="decimal"
                className="font-mono"
                placeholder="0.00"
                value={amountYuan}
                onChange={(e) => setAmountYuan(e.target.value)}
                disabled={!hasBank}
              />
            </Field>
            <button
              className="btn-cta w-full"
              onClick={openWithdrawConfirm}
              disabled={!hasBank || withdrawing || amountCents == null || amountCents > balance}
            >
              提交提现申请
            </button>
            {!hasBank && (
              <p className="text-xs text-neon-pink">请先绑定银行账户后再申请提现。</p>
            )}
            <p className="text-xs text-outline">
              提交后由平台团队审核，通过后线下打款；审核期间金额冻结。
            </p>
          </div>
        </Card>
      </div>

      {/* 提现记录 */}
      <Card caption="WITHDRAWAL HISTORY" title="提现记录" bodyClassName="-mx-6 -mb-6">
        <DataTable<WithdrawalRequest>
          columns={withdrawalCols}
          data={withdrawals}
          loading={wLoading}
          empty={<EmptyState icon={Landmark} title="暂无提现记录" />}
        />
        <Pager page={wPage} total={wTotal} onPage={setWPage} />
      </Card>

      {/* 收支明细 */}
      <Card caption="LEDGER" title="收支明细" bodyClassName="-mx-6 -mb-6">
        <DataTable<LedgerEntry>
          columns={ledgerCols}
          data={ledger}
          loading={ledgerLoading}
          empty={<EmptyState icon={ReceiptText} title="暂无收支明细" />}
        />
        <Pager page={ledgerPage} total={ledgerTotal} onPage={setLedgerPage} />
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="确认提现"
        message={
          <>
            确认申请提现 <Money cents={amountCents} className="font-bold text-on-surface" />{' '}
            至 {school?.bankName || '-'}（尾号
            {school?.bankAccountNo ? school.bankAccountNo.slice(-4) : '-'}）？提交后金额将被冻结，等待平台审核。
          </>
        }
        confirmText="确认提交"
        loading={withdrawing}
        onConfirm={handleWithdraw}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export default function EarningsPage() {
  return (
    <RoleGate allow={['STUDENT_UNION']}>
      <EarningsInner />
    </RoleGate>
  );
}
