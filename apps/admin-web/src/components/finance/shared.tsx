'use client';

/** finance 域内共享件：学校下拉数据 / 按类型过滤的学校流水卡 / 银行快照展示 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { listSchools } from '@/lib/api/schools';
import { getSchoolFinanceSummary } from '@/lib/api/finance';
import { ApiError } from '@/lib/api/client';
import { toastError } from '@/lib/toast';
import { formatDateTime } from '@/lib/format';
import type {
  BankSnapshot,
  LedgerEntry,
  LedgerEntryType,
  School,
  SchoolFinanceSummary,
} from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Money } from '@/components/ui/Money';

/** 学校下拉选项（发放/调整两 tab 共用；后端 limit 封顶 100） */
export function useSchoolOptions(): { schools: School[]; loading: boolean } {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listSchools({ page: 1, limit: 100 })
      .then((res) => {
        if (alive) setSchools(res.items);
      })
      .catch((e) => toastError(e, '加载学校列表失败'))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { schools, loading };
}

/** 银行快照一行式展示：户名 · 银行 · 尾号 4 位 */
export function BankSnapshotText({ snapshot }: { snapshot: BankSnapshot }) {
  const tail = snapshot.accountNo ? snapshot.accountNo.slice(-4) : '';
  return (
    <span className="text-xs text-on-surface-variant whitespace-nowrap">
      {snapshot.accountName || '-'} · {snapshot.bankName || '-'} ·{' '}
      <span className="font-mono">{tail ? `尾号${tail}` : '-'}</span>
    </span>
  );
}

const LEDGER_COLUMNS: Column<LedgerEntry>[] = [
  {
    key: 'createdAt',
    header: '时间',
    render: (e) => (
      <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
        {formatDateTime(e.createdAt)}
      </span>
    ),
  },
  {
    key: 'amount',
    header: '金额',
    align: 'right',
    render: (e) => <Money cents={e.amountCents} signed />,
  },
  {
    key: 'note',
    header: '备注',
    render: (e) => <span className="text-sm text-on-surface-variant">{e.note || '-'}</span>,
  },
];

/**
 * 所选学校按类型过滤的流水卡（后端概要接口无 type 筛选，前端过滤最近 100 条）。
 * refreshKey 自增触发重拉（发放/调整成功后回显新流水与余额）。
 */
export function SchoolLedgerCard({
  schoolId,
  type,
  title,
  caption,
  refreshKey,
  emptyText = '暂无相关流水',
}: {
  schoolId: string;
  type: LedgerEntryType;
  title: string;
  caption?: string;
  refreshKey: number;
  emptyText?: string;
}) {
  const [summary, setSummary] = useState<SchoolFinanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 单调计数竞态防护：快速切换学校时只应用最后一次响应
  const seqRef = useRef(0);

  useEffect(() => {
    if (!schoolId) {
      setSummary(null);
      setError(null);
      return;
    }
    const id = ++seqRef.current;
    setLoading(true);
    getSchoolFinanceSummary(schoolId, { page: 1, limit: 100 })
      .then((s) => {
        if (id !== seqRef.current) return;
        setSummary(s);
        setError(null);
      })
      .catch((e) => {
        if (id !== seqRef.current) return;
        setError(e instanceof ApiError ? e.message : '加载流水失败，请稍后重试');
      })
      .finally(() => {
        if (id === seqRef.current) setLoading(false);
      });
  }, [schoolId, refreshKey]);

  const rows = useMemo(
    () => (summary ? summary.ledger.items.filter((e) => e.type === type) : []),
    [summary, type],
  );

  return (
    <Card
      flush
      caption={caption}
      title={title}
      actions={
        summary && (
          <span className="text-xs text-on-surface-variant">
            当前余额 <Money cents={summary.balanceCents} className="font-bold" />
          </span>
        )
      }
    >
      {schoolId ? (
        <DataTable<LedgerEntry>
          columns={LEDGER_COLUMNS}
          rows={rows}
          rowKey={(e) => e.id}
          loading={loading}
          error={error}
          empty={emptyText}
        />
      ) : (
        <EmptyState text="请选择学校" />
      )}
    </Card>
  );
}
