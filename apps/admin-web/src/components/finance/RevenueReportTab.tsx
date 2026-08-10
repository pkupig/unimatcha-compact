'use client';

/** FIN-6 收入报表 tab：from/to 区间（默认近 30 天）+ 分校报表 + 合计条。
 *  字段名与 finance.service.getRevenueReport 一一对应；合计直接消费后端 totals。 */
import { useEffect, useRef, useState } from 'react';
import { getRevenueReport } from '@/lib/api/finance';
import { ApiError } from '@/lib/api/client';
import { toDateInput } from '@/lib/format';
import type { RevenueReport, RevenueReportRow } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { Field, Input } from '@/components/ui/form';
import { Money } from '@/components/ui/Money';

/** 五个金额列共用定义（表格列 + 合计条一处维护，字段名不重复手写） */
const MONEY_COLS: { key: keyof Omit<RevenueReportRow, 'schoolId' | 'schoolName'>; label: string }[] = [
  { key: 'grossAdSpendCents', label: '广告流水' },
  { key: 'schoolShareCents', label: '学校分成' },
  { key: 'platformKeepCents', label: '平台留存' },
  { key: 'grantCents', label: '发放赞助' },
  { key: 'withdrawalPaidCents', label: '已提现' },
];

const COLUMNS: Column<RevenueReportRow>[] = [
  {
    key: 'school',
    header: '学校',
    render: (r) => <span className="font-medium text-on-surface">{r.schoolName}</span>,
  },
  ...MONEY_COLS.map(
    (c): Column<RevenueReportRow> => ({
      key: c.key,
      header: c.label,
      align: 'right',
      render: (r) => <Money cents={r[c.key]} />,
    }),
  ),
];

export function RevenueReportTab() {
  // 默认近 30 天（含今天）
  const [from, setFrom] = useState(() => toDateInput(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => toDateInput(new Date()));
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 单调计数竞态防护：连续改日期只应用最后一次响应
  const seqRef = useRef(0);

  useEffect(() => {
    const id = ++seqRef.current;
    setLoading(true);
    getRevenueReport({ from: from || undefined, to: to || undefined })
      .then((r) => {
        if (id !== seqRef.current) return;
        setReport(r);
        setError(null);
      })
      .catch((e) => {
        if (id !== seqRef.current) return;
        setError(e instanceof ApiError ? e.message : '加载收入报表失败，请稍后重试');
      })
      .finally(() => {
        if (id === seqRef.current) setLoading(false);
      });
  }, [from, to]);

  const rows = report?.items ?? [];

  return (
    <div className="space-y-4">
      <FilterBar>
        <Field label="开始日期">
          <Input
            type="date"
            className="font-mono w-44"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="结束日期">
          <Input
            type="date"
            className="font-mono w-44"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <p className="text-xs text-outline self-end pb-2.5">默认最近 30 天，金额为区间内累计。</p>
      </FilterBar>

      <Card flush>
        <DataTable<RevenueReportRow>
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.schoolId}
          loading={loading}
          error={error}
          empty="区间内暂无数据"
        />
        {/* DataTable 无 tfoot 能力 → 表下合计条（数据取后端 totals，不在前端复算） */}
        {report && rows.length > 0 && (
          <div className="border-t border-outline-variant/40 bg-surface-low px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5">
            <span className="font-display font-bold text-sm text-on-surface">合计</span>
            {MONEY_COLS.map((c) => (
              <span key={c.key} className="text-xs text-on-surface-variant">
                {c.label} <Money cents={report.totals[c.key]} className="font-bold text-on-surface" />
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
