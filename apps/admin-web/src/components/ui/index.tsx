'use client';

/**
 * 共享 UI 组件库（Ivory & Ink）
 * 全部页面统一使用这里的组件与 token，禁止裸 gray-* 灰阶。
 */

import React, { forwardRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Inbox, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { getAdminInfo, type AdminInfo, type AdminRole } from '@/lib/auth';
import { fenToYuan } from '@/lib/format';
import type {
  AdCampaignStatus,
  AdPricingModel,
  LedgerEntryType,
  WithdrawalStatus,
} from '@/lib/api';

/* ═══════════════════════════════════════════════════════════════
 * 状态标签 & 徽章映射（spec §2 生命周期）
 * ═══════════════════════════════════════════════════════════════ */

export type BadgeVariant = 'neutral' | 'neon' | 'ink' | 'pink' | 'outline';

export const CAMPAIGN_STATUS_LABELS: Record<AdCampaignStatus, string> = {
  DRAFT: '草稿',
  PENDING_UNION_REVIEW: '学生会待审',
  PENDING_PLATFORM_REVIEW: '平台待审',
  REJECTED: '已驳回',
  PENDING_PAYMENT: '待付款',
  SCHEDULED: '待开始',
  ACTIVE: '投放中',
  PAUSED: '已暂停',
  SUSPENDED: '已下架',
  COMPLETED: '已完成',
};

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  PAID: '已打款',
};

/** 合并表（REJECTED 两处含义一致），供泛用组件查询 */
export const STATUS_LABELS: Record<string, string> = {
  ...WITHDRAWAL_STATUS_LABELS,
  ...CAMPAIGN_STATUS_LABELS,
};

export const LEDGER_TYPE_LABELS: Record<LedgerEntryType, string> = {
  AD_SHARE: '广告分成',
  SPONSOR_GRANT: '赞助发放',
  WITHDRAWAL: '提现扣减',
  ADJUSTMENT: '手工调整',
};

export const PRICING_MODEL_LABELS: Record<AdPricingModel, string> = {
  BUYOUT: '按天包断',
  CPM: '千次曝光 CPM',
  CPC: '按点击 CPC',
};

/** 广告状态 → 徽章色：neon=正向、ink=进行中、pink=负向、outline=终态中性 */
export function campaignStatusVariant(status?: AdCampaignStatus | string | null): BadgeVariant {
  switch (status) {
    case 'ACTIVE':
      return 'neon';
    case 'PENDING_UNION_REVIEW':
    case 'PENDING_PLATFORM_REVIEW':
    case 'PENDING_PAYMENT':
    case 'SCHEDULED':
      return 'ink';
    case 'REJECTED':
    case 'SUSPENDED':
      return 'pink';
    case 'COMPLETED':
      return 'outline';
    case 'DRAFT':
    case 'PAUSED':
    default:
      return 'neutral';
  }
}

/** 提现状态 → 徽章色 */
export function withdrawalStatusVariant(status?: WithdrawalStatus | string | null): BadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'neon';
    case 'PENDING':
      return 'ink';
    case 'REJECTED':
      return 'pink';
    case 'PAID':
      return 'outline';
    default:
      return 'neutral';
  }
}

/** 泛用：优先按提现枚举，其次按广告枚举 */
export function statusBadgeVariant(status?: string | null): BadgeVariant {
  if (!status) return 'neutral';
  if (status in WITHDRAWAL_STATUS_LABELS && !(status in CAMPAIGN_STATUS_LABELS)) {
    return withdrawalStatusVariant(status as WithdrawalStatus);
  }
  return campaignStatusVariant(status);
}

/* ═══════════════════════════════════════════════════════════════
 * Badge
 * ═══════════════════════════════════════════════════════════════ */

export function Badge({
  variant = 'neutral',
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        'badge',
        variant === 'neon' && 'badge-neon',
        variant === 'ink' && 'badge-ink',
        variant === 'pink' && 'badge-pink',
        variant === 'outline' && 'badge-outline',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 直接传状态枚举值渲染徽章（广告 + 提现通用） */
export function StatusBadge({
  status,
  kind,
  className,
}: {
  status?: string | null;
  kind?: 'campaign' | 'withdrawal';
  className?: string;
}) {
  if (!status) return <span className="text-outline">-</span>;
  const variant =
    kind === 'campaign'
      ? campaignStatusVariant(status)
      : kind === 'withdrawal'
        ? withdrawalStatusVariant(status)
        : statusBadgeVariant(status);
  const label =
    kind === 'withdrawal'
      ? (WITHDRAWAL_STATUS_LABELS as Record<string, string>)[status] || status
      : STATUS_LABELS[status] || status;
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 布局原子：PageHeader / Card / StatCard / EmptyState
 * ═══════════════════════════════════════════════════════════════ */

export function PageHeader({
  title,
  sub,
  caption,
  actions,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  /** 标题上方的英文小标签（如 OVERVIEW） */
  caption?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div>
        {caption && <p className="caption mb-1.5">{caption}</p>}
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-on-surface">
          {title}
        </h1>
        {sub && <p className="text-sm text-on-surface-variant mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  caption,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  caption?: string;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx('card', className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {caption && <p className="caption mb-1">{caption}</p>}
            {title && (
              <h3 className="font-display font-extrabold text-on-surface tracking-tight">
                {title}
              </h3>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** neon = 关键指标高亮，ink = 深色强调 */
  accent?: 'neon' | 'ink';
  icon?: LucideIcon;
}) {
  return (
    <div className="card relative overflow-hidden p-5">
      {accent && (
        <span
          className={clsx(
            'absolute left-0 top-0 bottom-0 w-1',
            accent === 'neon' ? 'bg-neon' : 'bg-ink',
          )}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          {label}
        </p>
        {Icon && <Icon size={16} className="text-outline shrink-0" />}
      </div>
      <p className="font-mono text-2xl font-bold text-on-surface mt-2 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-outline mt-1.5">{sub}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title = '暂无数据',
  sub,
  action,
}: {
  icon?: LucideIcon;
  title?: React.ReactNode;
  sub?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-low flex items-center justify-center mb-3">
        <Icon size={22} className="text-outline" />
      </div>
      <p className="font-display font-bold text-on-surface text-sm">{title}</p>
      {sub && <p className="text-xs text-outline mt-1 max-w-xs">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Money（金额统一入口：分 → ¥元，JetBrains Mono）
 * ═══════════════════════════════════════════════════════════════ */

export function Money({
  cents,
  signed = false,
  className,
}: {
  cents?: number | null;
  /** 有符号展示：正数加 +，负数标粉色（ledger 明细用） */
  signed?: boolean;
  className?: string;
}) {
  const v = cents ?? 0;
  return (
    <span
      className={clsx(
        'font-mono',
        signed && v < 0 && 'text-neon-pink',
        className,
      )}
    >
      {signed && v > 0 ? '+' : ''}
      {fenToYuan(v)}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * DataTable（typed 列 + loading 骨架 + 空态）
 * ═══════════════════════════════════════════════════════════════ */

export interface Column<T = any> {
  key: string;
  title: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export function DataTable<T = any>({
  columns,
  data,
  loading = false,
  rowKey = 'id' as any,
  empty,
  onRowClick,
  skeletonRows = 5,
}: {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  rowKey?: string | ((row: T) => string);
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  skeletonRows?: number;
}) {
  const getKey = (row: T, i: number) =>
    typeof rowKey === 'function' ? rowKey(row) : ((row as any)?.[rowKey] ?? i);
  const alignCls = (a?: Column<T>['align']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={clsx(alignCls(c.align), c.className)}>
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, r) => (
              <tr key={`sk-${r}`}>
                {columns.map((c) => (
                  <td key={c.key}>
                    <div className="h-3.5 rounded-full bg-surface-high animate-pulse w-3/4" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {empty ?? <EmptyState />}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={getKey(row, i)}
                className={clsx(onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={clsx(alignCls(c.align), c.className)}>
                    {c.render ? c.render(row, i) : ((row as any)?.[c.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Modal / ConfirmDialog
 * ═══════════════════════════════════════════════════════════════ */

export function Modal({
  open,
  onClose,
  title,
  caption,
  children,
  footer,
  widthClassName = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  caption?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={clsx(
          'relative w-full bg-white rounded-lg border border-outline-variant/40 shadow-sm flex flex-col max-h-[90vh]',
          widthClassName,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-outline-variant/30">
          <div>
            {caption && <p className="caption mb-1">{caption}</p>}
            <h3 className="font-display text-lg font-extrabold tracking-tight text-on-surface">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -m-1.5 rounded-lg text-on-surface-variant hover:bg-surface-low hover:text-ink transition-colors"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-outline-variant/30">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title = '确认操作',
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: React.ReactNode;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** true = 危险操作，确认按钮用粉色描边 */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      widthClassName="max-w-sm"
      footer={
        <>
          <button className="btn-secondary btn-sm" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>
          <button
            className={clsx(danger ? 'btn-danger' : 'btn-primary', 'btn-sm')}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '处理中…' : confirmText}
          </button>
        </>
      }
    >
      <p className="text-sm text-on-surface-variant leading-relaxed">{message}</p>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * Tabs
 * ═══════════════════════════════════════════════════════════════ */

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: { key: string; label: React.ReactNode }[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1 bg-surface-low rounded-lg p-1 border border-outline-variant/30',
        className,
      )}
    >
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={clsx(
            'px-4 py-1.5 rounded-lg text-sm font-display font-bold transition-all',
            value === t.key
              ? 'bg-ink text-white'
              : 'text-on-surface-variant hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 表单：Field / Input / Select / Textarea
 * ═══════════════════════════════════════════════════════════════ */

export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="label">
        {label}
        {required && <span className="text-neon-pink ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-outline mt-1">{hint}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={clsx('input', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={clsx('select', className)} {...props}>
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={clsx('input resize-y', className)} {...props} />;
});

/* ═══════════════════════════════════════════════════════════════
 * RoleGate（页面级角色守卫：未授权 → /dashboard）
 * ═══════════════════════════════════════════════════════════════ */

export function RoleGate({
  allow,
  children,
}: {
  allow: AdminRole[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const info = getAdminInfo();
    if (!info || !allow.includes(info.role)) {
      router.replace('/dashboard');
      return;
    }
    setOk(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ok) return null;
  return <>{children}</>;
}

/** 客户端读取当前管理员（挂载后返回，SSR 期间为 null） */
export function useAdminInfo(): AdminInfo | null {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  useEffect(() => {
    setAdmin(getAdminInfo());
  }, []);
  return admin;
}

/* ═══════════════════════════════════════════════════════════════
 * 图表（recharts 封装：ink 主线 + neon 次线，网格 #e8e8e8，无渐变）
 * ═══════════════════════════════════════════════════════════════ */

export interface ChartSeries {
  key: string;
  label?: string;
  color?: string;
}

const CHART_COLORS = ['#1b1b1b', '#CCFF00'];

const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 10,
  border: '1px solid rgba(198,198,198,.4)',
  boxShadow: '0 2px 8px rgba(0,0,0,.06)',
  background: '#ffffff',
  fontSize: 12,
  fontFamily: '"JetBrains Mono", monospace',
};

const CHART_TICK = { fontSize: 11, fill: '#777777', fontFamily: '"JetBrains Mono", monospace' };

export function TrendChart({
  data,
  series,
  xKey = 'date',
  height = 260,
  valueFormatter,
}: {
  data: any[];
  series: ChartSeries[];
  xKey?: string;
  height?: number;
  /** tooltip / Y 轴数值格式化（如 (v) => `¥${v}`） */
  valueFormatter?: (value: any) => string;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e8e8e8" vertical={false} />
          <XAxis dataKey={xKey} tick={CHART_TICK} axisLine={{ stroke: '#e8e8e8' }} tickLine={false} />
          <YAxis
            tick={CHART_TICK}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={valueFormatter}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={valueFormatter ? (v: any) => valueFormatter(v) : undefined}
            cursor={{ stroke: '#c6c6c6', strokeDasharray: '3 3' }}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label ?? s.key}
              stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarTrend({
  data,
  series,
  xKey = 'date',
  height = 260,
  valueFormatter,
}: {
  data: any[];
  series: ChartSeries[];
  xKey?: string;
  height?: number;
  valueFormatter?: (value: any) => string;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid stroke="#e8e8e8" vertical={false} />
          <XAxis dataKey={xKey} tick={CHART_TICK} axisLine={{ stroke: '#e8e8e8' }} tickLine={false} />
          <YAxis
            tick={CHART_TICK}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={valueFormatter}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={valueFormatter ? (v: any) => valueFormatter(v) : undefined}
            cursor={{ fill: 'rgba(232,232,232,.5)' }}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label ?? s.key}
              fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
