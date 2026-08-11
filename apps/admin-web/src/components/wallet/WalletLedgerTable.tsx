'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Energy } from '@/components/ui/Energy';
import { Pager } from '@/components/ui/Pager';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Select } from '@/components/ui/form';
import { SPONSOR_LEDGER_TYPE } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import type { UsePagedListResult } from '@/hooks/usePagedList';
import type { SponsorLedgerEntry, SponsorLedgerType } from '@/lib/api/wallet';

/** 流水筛选（type='' 表示全部；usePagedList 序列化时空串自动跳过） */
export interface WalletLedgerFilters {
  type: string;
}

const TYPE_OPTIONS = Object.keys(SPONSOR_LEDGER_TYPE.labels) as SponsorLedgerType[];

const columns: Column<SponsorLedgerEntry>[] = [
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
    key: 'type',
    header: '类型',
    render: (e) => <StatusBadge meta={SPONSOR_LEDGER_TYPE} value={e.type} />,
  },
  {
    key: 'amount',
    header: '金额',
    align: 'right',
    render: (e) => <Energy value={e.amountCents} signed />,
  },
  {
    key: 'ref',
    header: '关联',
    // 仅广告类流水（refType='campaign'）可深链投放详情；充值/独立调整无落地页
    render: (e) =>
      e.refType === 'campaign' && e.refId ? (
        <Link href={`/ads/${e.refId}`} className="text-xs font-medium text-neon-dark hover:underline">
          查看投放
        </Link>
      ) : (
        <span className="text-xs text-on-surface-variant">-</span>
      ),
  },
  {
    key: 'note',
    header: '备注',
    className: 'max-w-[280px] truncate',
    render: (e) => <span className="text-xs text-on-surface-variant">{e.note ?? '-'}</span>,
  },
];

/** 能量流水表（分页 + 类型筛选下拉；数据引擎由页面注入的 usePagedList 提供） */
export function WalletLedgerTable({
  list,
}: {
  list: UsePagedListResult<SponsorLedgerEntry, WalletLedgerFilters>;
}) {
  return (
    <Card
      flush
      caption="LEDGER"
      title="能量流水"
      actions={
        <Select
          value={list.filters.type}
          onChange={(e) => list.setFilter('type', e.target.value)}
          className="w-36"
        >
          <option value="">全部类型</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {SPONSOR_LEDGER_TYPE.labels[t]}
            </option>
          ))}
        </Select>
      }
    >
      <DataTable<SponsorLedgerEntry>
        columns={columns}
        rows={list.items}
        rowKey={(e) => e.id}
        loading={list.loading}
        error={list.error}
        empty="暂无流水记录"
      />
      {list.total > list.limit && (
        <div className="px-4 py-3 border-t border-outline-variant/40">
          <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />
        </div>
      )}
    </Card>
  );
}
