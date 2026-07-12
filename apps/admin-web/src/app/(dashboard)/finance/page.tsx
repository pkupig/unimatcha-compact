'use client';

/**
 * /finance — 财务（SUPER/TEAM 专属）
 * tab1 提现审核：提现列表 + 状态筛选 + 通过/驳回（带备注）+ 标记已打款
 * tab2 赞助发放：发放表单（学校/金额/备注）+ 所选学校的发放记录
 * tab3 收入报表：日期范围 + 分校收入报表（含合计行）
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Banknote, Gift, FileBarChart } from 'lucide-react';
import {
  getWithdrawals,
  reviewWithdrawal,
  markWithdrawalPaid,
  getSchools,
  createGrant,
  getFinanceSummary,
  getRevenueReport,
  type WithdrawalRequest,
  type School,
  type LedgerEntry,
  type RevenueReportRow,
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  PageHeader,
  Card,
  DataTable,
  StatusBadge,
  Money,
  Tabs,
  Modal,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  RoleGate,
  WITHDRAWAL_STATUS_LABELS,
  type Column,
} from '@/components/ui';

const LIMIT = 20;

/** 列表响应归一化（后端可能返回 {withdrawals|items|list, total} 或裸数组） */
function normalizeList<T = any>(data: any, key: string): { items: T[]; total: number } {
  if (Array.isArray(data)) return { items: data, total: data.length };
  const items = data?.[key] || data?.items || data?.list || [];
  return { items, total: data?.total ?? items.length };
}

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

/** 银行快照：户名 · 银行 · 尾号 */
function BankSnapshot({ w }: { w: WithdrawalRequest }) {
  const bs = w.bankSnapshot || {};
  const tail = bs.accountNo ? bs.accountNo.slice(-4) : null;
  return (
    <span className="text-xs text-on-surface-variant whitespace-nowrap">
      {bs.accountName || '-'} · {bs.bankName || '-'} ·{' '}
      <span className="font-mono">{tail ? `尾号${tail}` : '-'}</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * tab1 提现审核
 * ═══════════════════════════════════════════════════════════════ */

function WithdrawalsTab() {
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  // 审核弹窗（通过/驳回 + 备注）
  const [review, setReview] = useState<{ w: WithdrawalRequest; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  // 标记已打款确认
  const [paidTarget, setPaidTarget] = useState<WithdrawalRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getWithdrawals({ page, limit: LIMIT, status: status || undefined });
      const { items, total } = normalizeList<WithdrawalRequest>((res as any).data, 'withdrawals');
      setItems(items);
      setTotal(total);
    } catch (err: any) {
      toast.error(err?.message || '加载提现列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const closeReview = () => {
    setReview(null);
    setNote('');
  };

  const handleReview = async () => {
    if (!review) return;
    if (!review.approve && !note.trim()) {
      toast.error('请填写驳回原因');
      return;
    }
    setSubmitting(true);
    try {
      await reviewWithdrawal(review.w.id, {
        approve: review.approve,
        note: note.trim() || undefined,
      });
      toast.success(review.approve ? '已通过，等待线下打款' : '已驳回，冻结金额已释放');
      closeReview();
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!paidTarget) return;
    setSubmitting(true);
    try {
      await markWithdrawalPaid(paidTarget.id);
      toast.success('已标记打款，余额已扣减');
      setPaidTarget(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<WithdrawalRequest>[] = [
    {
      key: 'school',
      title: '学校',
      render: (w) => <span className="font-medium text-on-surface">{w.school?.name || '-'}</span>,
    },
    {
      key: 'amount',
      title: '金额',
      align: 'right',
      render: (w) => <Money cents={w.amountCents} className="font-bold" />,
    },
    { key: 'bank', title: '银行快照', render: (w) => <BankSnapshot w={w} /> },
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
      key: 'note',
      title: '审核备注',
      render: (w) => (
        <span className="text-xs text-on-surface-variant line-clamp-1 max-w-[160px]">
          {w.reviewNote || '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (w) => {
        if (w.status === 'PENDING') {
          return (
            <div className="flex items-center justify-end gap-2">
              <button className="btn-cta btn-sm" onClick={() => setReview({ w, approve: true })}>
                通过
              </button>
              <button className="btn-danger btn-sm" onClick={() => setReview({ w, approve: false })}>
                驳回
              </button>
            </div>
          );
        }
        if (w.status === 'APPROVED') {
          return (
            <button className="btn-primary btn-sm" onClick={() => setPaidTarget(w)}>
              标记已打款
            </button>
          );
        }
        return <span className="text-outline text-xs">-</span>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* 状态筛选 */}
      <div className="card py-4">
        <div className="flex items-center gap-3">
          <Select
            className="w-full sm:w-44"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            {Object.entries(WITHDRAWAL_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <DataTable<WithdrawalRequest>
          columns={columns}
          data={items}
          loading={loading}
          empty={<EmptyState icon={Banknote} title="暂无提现申请" />}
        />
        <Pager page={page} total={total} onPage={setPage} />
      </div>

      {/* 通过/驳回（带备注） */}
      <Modal
        open={!!review}
        onClose={closeReview}
        caption="WITHDRAWAL REVIEW"
        title={review?.approve ? '通过提现申请' : '驳回提现申请'}
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={closeReview} disabled={submitting}>
              取消
            </button>
            <button
              className={review?.approve ? 'btn-cta btn-sm' : 'btn-danger btn-sm'}
              onClick={handleReview}
              disabled={submitting}
            >
              {submitting ? '处理中…' : review?.approve ? '确认通过' : '确认驳回'}
            </button>
          </>
        }
      >
        {review && (
          <div className="space-y-4">
            <div className="rounded-lg bg-surface-low p-4 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">学校</span>
                <span className="font-medium">{review.w.school?.name || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">金额</span>
                <Money cents={review.w.amountCents} className="font-bold" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">收款账户</span>
                <BankSnapshot w={review.w} />
              </div>
            </div>
            <Field label="审核备注" required={!review.approve}>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={review.approve ? '选填，例如：核对无误' : '必填，请说明驳回原因'}
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* 标记已打款 */}
      <ConfirmDialog
        open={!!paidTarget}
        title="标记已打款"
        message={
          paidTarget ? (
            <>
              确认已线下打款？{paidTarget.school?.name || '该学校'} 余额将扣减{' '}
              <Money cents={paidTarget.amountCents} className="font-bold text-on-surface" />
              ，并写入负数提现账目，此操作不可撤销。
            </>
          ) : null
        }
        confirmText="已打款"
        loading={submitting}
        onConfirm={handleMarkPaid}
        onCancel={() => setPaidTarget(null)}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * tab2 赞助发放
 * ═══════════════════════════════════════════════════════════════ */

function GrantsTab() {
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [amountYuan, setAmountYuan] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 所选学校的发放记录（从 finance summary 的 ledger 里过滤 SPONSOR_GRANT）
  const [records, setRecords] = useState<LedgerEntry[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  useEffect(() => {
    getSchools({ limit: 500 })
      .then((res) => {
        const d = (res as any).data;
        setSchools(Array.isArray(d) ? d : d?.schools || d?.items || d?.list || []);
      })
      .catch(() => toast.error('加载学校列表失败'));
  }, []);

  const loadRecords = useCallback(async (sid: string) => {
    if (!sid) {
      setRecords([]);
      return;
    }
    setRecordsLoading(true);
    try {
      const res = await getFinanceSummary(sid, { page: 1, limit: 100 });
      const d = (res as any).data;
      const ledger: LedgerEntry[] = Array.isArray(d?.ledger)
        ? d.ledger
        : d?.ledger?.items || d?.ledger?.list || [];
      setRecords(ledger.filter((e) => e.type === 'SPONSOR_GRANT'));
    } catch (err: any) {
      toast.error(err?.message || '加载发放记录失败');
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords(schoolId);
  }, [schoolId, loadRecords]);

  const amountCents = yuanToFen(amountYuan);
  const selectedSchool = schools.find((s) => s.id === schoolId);

  const openConfirm = () => {
    if (!schoolId) {
      toast.error('请选择学校');
      return;
    }
    if (amountCents == null) {
      toast.error('请输入有效的发放金额');
      return;
    }
    setConfirmOpen(true);
  };

  const handleGrant = async () => {
    if (!schoolId || amountCents == null) return;
    setSubmitting(true);
    try {
      await createGrant({ schoolId, amountCents, note: note.trim() || undefined });
      toast.success('赞助已发放');
      setAmountYuan('');
      setNote('');
      setConfirmOpen(false);
      loadRecords(schoolId);
    } catch (err: any) {
      toast.error(err?.message || '发放失败');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<LedgerEntry>[] = [
    {
      key: 'createdAt',
      title: '时间',
      render: (e) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDateTime(e.createdAt)}
        </span>
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
      render: (e) => <span className="text-sm text-on-surface-variant">{e.note || '-'}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <Card caption="SPONSOR GRANT" title="发放赞助额度">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="学校" required>
            <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
              <option value="">请选择学校</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="金额（元）" required hint={amountCents != null ? <>入账 <Money cents={amountCents} /></> : '以元填写，入账时按分记录'}>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              inputMode="decimal"
              className="font-mono"
              placeholder="0.00"
              value={amountYuan}
              onChange={(e) => setAmountYuan(e.target.value)}
            />
          </Field>
          <Field label="备注" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="选填，例如：2026 秋季迎新活动赞助"
            />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-cta" onClick={openConfirm} disabled={submitting}>
            发放赞助
          </button>
        </div>
      </Card>

      <Card
        caption="GRANT HISTORY"
        title="发放记录"
        actions={
          selectedSchool && (
            <span className="text-xs text-on-surface-variant">{selectedSchool.name}</span>
          )
        }
        bodyClassName="-mx-6 -mb-6"
      >
        {schoolId ? (
          <DataTable<LedgerEntry>
            columns={columns}
            data={records}
            loading={recordsLoading}
            empty={<EmptyState icon={Gift} title="该校暂无发放记录" />}
          />
        ) : (
          <EmptyState icon={Gift} title="请选择学校" sub="选择上方学校后展示其赞助发放记录。" />
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="确认发放"
        message={
          <>
            确认向 {selectedSchool?.name || '所选学校'} 发放赞助{' '}
            <Money cents={amountCents} className="font-bold text-on-surface" /> ？金额将立即计入该校余额。
          </>
        }
        confirmText="确认发放"
        loading={submitting}
        onConfirm={handleGrant}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * tab3 收入报表
 * ═══════════════════════════════════════════════════════════════ */

/** Date → 'YYYY-MM-DD'（date input 用本地时区） */
function toDateInput(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 后端 getRevenueReport 实际字段：grossAdSpendCents / schoolShareCents / platformKeepCents / grantCents / withdrawalPaidCents */
const revenueOf = (r: any) => r?.grossAdSpendCents ?? r?.adRevenueCents ?? 0;
const platformOf = (r: any) => r?.platformKeepCents ?? r?.platformShareCents ?? 0;
const grantsOf = (r: any) => r?.grantCents ?? r?.grantsCents ?? r?.sponsorGrantCents ?? 0;
const withdrawnOf = (r: any) => r?.withdrawalPaidCents ?? r?.withdrawnCents ?? r?.withdrawalCents ?? 0;

function RevenueTab() {
  const [from, setFrom] = useState(() => toDateInput(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => toDateInput(new Date()));
  const [rows, setRows] = useState<RevenueReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getRevenueReport({ from, to });
        const d = (res as any).data;
        setRows(Array.isArray(d) ? d : d?.rows || d?.items || d?.list || d?.report || []);
      } catch (err: any) {
        toast.error(err?.message || '加载收入报表失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [from, to]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.revenue += revenueOf(r);
      acc.schoolShare += r.schoolShareCents || 0;
      acc.platformShare += platformOf(r);
      acc.grants += grantsOf(r);
      acc.withdrawn += withdrawnOf(r);
      return acc;
    },
    { revenue: 0, schoolShare: 0, platformShare: 0, grants: 0, withdrawn: 0 },
  );

  const moneyCols: { key: string; title: string; value: (r: RevenueReportRow) => number }[] = [
    { key: 'revenue', title: '广告流水', value: (r) => revenueOf(r) },
    { key: 'schoolShare', title: '学校分成', value: (r) => r.schoolShareCents || 0 },
    { key: 'platformShare', title: '平台留存', value: (r) => platformOf(r) },
    { key: 'grants', title: '发放赞助', value: (r) => grantsOf(r) },
    { key: 'withdrawn', title: '已提现', value: (r) => withdrawnOf(r) },
  ];

  return (
    <div className="space-y-4">
      {/* 日期范围 */}
      <div className="card py-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label="开始日期" className="w-full sm:w-44">
            <Input
              type="date"
              className="font-mono"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="结束日期" className="w-full sm:w-44">
            <Input
              type="date"
              className="font-mono"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <p className="text-xs text-outline pb-2.5">默认最近 30 天，金额为区间内累计。</p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>学校</th>
                {moneyCols.map((c) => (
                  <th key={c.key} className="text-right">
                    {c.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, r) => (
                  <tr key={`sk-${r}`}>
                    {Array.from({ length: moneyCols.length + 1 }).map((_, c) => (
                      <td key={c}>
                        <div className="h-3.5 rounded-full bg-surface-high animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={moneyCols.length + 1} className="p-0">
                    <EmptyState icon={FileBarChart} title="区间内暂无数据" />
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.schoolId}>
                    <td className="font-medium text-on-surface">{r.schoolName || r.schoolId}</td>
                    {moneyCols.map((c) => (
                      <td key={c.key} className="text-right">
                        <Money cents={c.value(r)} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot>
                <tr className="bg-surface-low border-t border-outline-variant/40">
                  <td className="px-4 py-3 font-display font-extrabold text-on-surface">合计</td>
                  {[totals.revenue, totals.schoolShare, totals.platformShare, totals.grants, totals.withdrawn].map(
                    (v, i) => (
                      <td key={i} className="px-4 py-3 text-right">
                        <Money cents={v} className="font-bold" />
                      </td>
                    ),
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 页面入口（SUPER/TEAM）
 * ═══════════════════════════════════════════════════════════════ */

function FinanceInner() {
  const [tab, setTab] = useState<'withdrawals' | 'grants' | 'report'>('withdrawals');

  return (
    <div className="space-y-6">
      <PageHeader caption="FINANCE" title="财务" sub="提现审核 · 赞助发放 · 收入报表" />
      <Tabs
        value={tab}
        onChange={(k) => setTab(k as typeof tab)}
        items={[
          { key: 'withdrawals', label: '提现审核' },
          { key: 'grants', label: '赞助发放' },
          { key: 'report', label: '收入报表' },
        ]}
      />
      {tab === 'withdrawals' && <WithdrawalsTab />}
      {tab === 'grants' && <GrantsTab />}
      {tab === 'report' && <RevenueTab />}
    </div>
  );
}

export default function FinancePage() {
  return (
    <RoleGate allow={['SUPER', 'TEAM']}>
      <FinanceInner />
    </RoleGate>
  );
}
