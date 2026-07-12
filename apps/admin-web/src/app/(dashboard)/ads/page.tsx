'use client';

/**
 * /ads — 广告列表（三角色共用路径，按角色分支渲染）
 * SPONSOR      我的广告（+ 新建）
 * STUDENT_UNION 待我审核 / 本校广告（只读）
 * SUPER/TEAM   全量列表 + 状态/学校筛选 + 待审核快捷筛选
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Plus, Megaphone } from 'lucide-react';
import {
  getCampaigns,
  getSchools,
  getAdsOverview,
  type Campaign,
  type School,
} from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Money,
  Badge,
  EmptyState,
  Tabs,
  useAdminInfo,
  CAMPAIGN_STATUS_LABELS,
  type Column,
} from '@/components/ui';
import { isUnion, isSponsor } from '@/lib/auth';

const LIMIT = 20;

/** 计价模式短标签（列表列用） */
const PRICING_SHORT: Record<string, string> = { BUYOUT: '包断', CPM: 'CPM', CPC: 'CPC' };

/** 列表响应归一化（后端可能返回 {campaigns|items|list, total} 或裸数组） */
function normalizeList(data: any): { items: Campaign[]; total: number } {
  if (Array.isArray(data)) return { items: data, total: data.length };
  const items = data?.campaigns || data?.items || data?.list || [];
  return { items, total: data?.total ?? items.length };
}

function Schedule({ c }: { c: Campaign }) {
  return (
    <span className="font-mono text-xs whitespace-nowrap text-on-surface-variant">
      {formatDate(c.startDate)} ~ {formatDate(c.endDate)}
    </span>
  );
}

/** 来源：平台直签 / 校名·自拉 */
function SourceBadge({ c }: { c: Campaign }) {
  return c.sourcedBySchoolId ? (
    <Badge variant="ink">{c.sourcedBySchool?.name || '学生会'}·自拉</Badge>
  ) : (
    <Badge variant="outline">平台直签</Badge>
  );
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

/* ── 共用列 ─────────────────────────────────────────────── */

const colTitle: Column<Campaign> = {
  key: 'title',
  title: '标题',
  render: (c) => (
    <span className="font-medium text-on-surface line-clamp-1 max-w-[220px]">{c.title}</span>
  ),
};
const colPricing: Column<Campaign> = {
  key: 'pricingModel',
  title: '计价',
  render: (c) => <Badge variant="outline">{PRICING_SHORT[c.pricingModel] || c.pricingModel}</Badge>,
};
const colSchools: Column<Campaign> = {
  key: 'schools',
  title: '投放学校',
  align: 'center',
  render: (c) => (
    <span className="font-mono">{c.placements ? c.placements.length : '-'}</span>
  ),
};
const colSchedule: Column<Campaign> = {
  key: 'schedule',
  title: '档期',
  render: (c) => <Schedule c={c} />,
};
const colQuote: Column<Campaign> = {
  key: 'quote',
  title: '报价 / 预算',
  align: 'right',
  render: (c) =>
    c.pricingModel === 'BUYOUT' ? (
      <Money cents={c.totalPriceCents} />
    ) : (
      <Money cents={c.budgetCents} />
    ),
};
const colSpend: Column<Campaign> = {
  key: 'spend',
  title: '消耗',
  align: 'right',
  render: (c) => <Money cents={c.spendCents} />,
};
const colStatus: Column<Campaign> = {
  key: 'status',
  title: '状态',
  render: (c) => <StatusBadge status={c.status} kind="campaign" />,
};
const colAdvertiser: Column<Campaign> = {
  key: 'advertiser',
  title: '商家',
  render: (c) => (
    <span className="text-on-surface-variant">
      {c.advertiser?.organizationName || c.advertiser?.name || '-'}
    </span>
  ),
};
const colSource: Column<Campaign> = {
  key: 'source',
  title: '来源',
  render: (c) => <SourceBadge c={c} />,
};
const colDetail: Column<Campaign> = {
  key: 'actions',
  title: '操作',
  align: 'right',
  render: (c) => (
    <Link
      href={`/ads/${c.id}`}
      onClick={(e) => e.stopPropagation()}
      className="text-xs font-display font-bold text-ink underline underline-offset-2 hover:text-neon-pink"
    >
      详情
    </Link>
  ),
};

/* ── SPONSOR：我的广告 ──────────────────────────────────── */

function SponsorAds() {
  const router = useRouter();
  const [items, setItems] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getCampaigns({ page, limit: LIMIT });
        const { items, total } = normalizeList((res as any).data);
        setItems(items);
        setTotal(total);
      } catch (err: any) {
        toast.error(err?.message || '加载广告列表失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [page]);

  return (
    <div className="space-y-6">
      <PageHeader
        caption="MY CAMPAIGNS"
        title="我的广告"
        sub={`共 ${total} 条投放`}
        actions={
          <Link href="/ads/new" className="btn-cta">
            <Plus size={16} />
            新建广告
          </Link>
        }
      />
      <div className="card p-0 overflow-hidden">
        <DataTable<Campaign>
          columns={[colTitle, colPricing, colSchools, colSchedule, colQuote, colSpend, colStatus, colDetail]}
          data={items}
          loading={loading}
          onRowClick={(c) => router.push(`/ads/${c.id}`)}
          empty={
            <EmptyState
              icon={Megaphone}
              title="还没有广告"
              sub="创建第一条广告，把品牌带进校园。"
              action={
                <Link href="/ads/new" className="btn-cta btn-sm">
                  <Plus size={14} />
                  新建广告
                </Link>
              }
            />
          }
        />
        <Pager page={page} total={total} onPage={setPage} />
      </div>
    </div>
  );
}

/* ── STUDENT_UNION：待我审核 / 本校广告 ─────────────────── */

function UnionAds() {
  const router = useRouter();
  const [tab, setTab] = useState<'review' | 'school'>('review');
  const [items, setItems] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    getAdsOverview()
      .then((res) => {
        const d = (res as any).data;
        // 后端学生会 overview 字段为 pendingReviewCount
        setPendingCount(d?.pendingReviewCount ?? d?.pendingUnionReview ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getCampaigns({
          page,
          limit: LIMIT,
          status: tab === 'review' ? 'PENDING_UNION_REVIEW' : undefined,
        });
        const { items, total } = normalizeList((res as any).data);
        setItems(items);
        setTotal(total);
      } catch (err: any) {
        toast.error(err?.message || '加载广告列表失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [tab, page]);

  const reviewCols: Column<Campaign>[] = [
    colTitle,
    colAdvertiser,
    colPricing,
    colSchedule,
    colQuote,
    colStatus,
    colDetail,
  ];
  const schoolCols: Column<Campaign>[] = [
    colTitle,
    colAdvertiser,
    colSource,
    colPricing,
    colSchedule,
    colSpend,
    colStatus,
  ];

  return (
    <div className="space-y-6">
      <PageHeader caption="AD REVIEW" title="广告审核" sub="待审队列与本校投放广告" />
      <Tabs
        value={tab}
        onChange={(k) => {
          setTab(k as 'review' | 'school');
          setPage(1);
        }}
        items={[
          {
            key: 'review',
            label: (
              <span className="inline-flex items-center gap-1.5">
                待我审核
                {pendingCount != null && pendingCount > 0 && (
                  <span className="font-mono text-xs bg-neon text-black rounded-full px-1.5">
                    {pendingCount}
                  </span>
                )}
              </span>
            ),
          },
          { key: 'school', label: '本校广告' },
        ]}
      />
      <div className="card p-0 overflow-hidden">
        <DataTable<Campaign>
          columns={tab === 'review' ? reviewCols : schoolCols}
          data={items}
          loading={loading}
          onRowClick={(c) => router.push(`/ads/${c.id}`)}
          empty={
            <EmptyState
              icon={Megaphone}
              title={tab === 'review' ? '暂无待审广告' : '本校暂无广告'}
              sub={tab === 'review' ? '自拉赞助商提交的广告会出现在这里。' : undefined}
            />
          }
        />
        <Pager page={page} total={total} onPage={setPage} />
      </div>
    </div>
  );
}

/* ── SUPER/TEAM：全量列表 + 筛选 ────────────────────────── */

function TeamAds() {
  const router = useRouter();
  const [items, setItems] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    getSchools({ limit: 500 })
      .then((res) => {
        const d = (res as any).data;
        setSchools(Array.isArray(d) ? d : d?.schools || d?.items || []);
      })
      .catch(() => {});
    getAdsOverview()
      .then((res) => setPendingCount((res as any).data?.pendingPlatformReview ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getCampaigns({
          page,
          limit: LIMIT,
          status: status || undefined,
          schoolId: schoolId || undefined,
        });
        const { items, total } = normalizeList((res as any).data);
        setItems(items);
        setTotal(total);
      } catch (err: any) {
        toast.error(err?.message || '加载广告列表失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [page, status, schoolId]);

  const pendingActive = status === 'PENDING_PLATFORM_REVIEW';

  return (
    <div className="space-y-6">
      <PageHeader caption="AD CAMPAIGNS" title="广告管理" sub={`共 ${total} 条投放`} />

      {/* 筛选栏 */}
      <div className="card py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <select
            className="select w-full sm:w-44"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            {Object.entries(CAMPAIGN_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            className="select w-full sm:w-56"
            value={schoolId}
            onChange={(e) => {
              setSchoolId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部学校</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {/* 待审核快捷筛选 chip */}
          <button
            type="button"
            onClick={() => {
              setStatus(pendingActive ? '' : 'PENDING_PLATFORM_REVIEW');
              setPage(1);
            }}
            className={clsx(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-display font-bold transition-colors shrink-0',
              pendingActive
                ? 'bg-neon border-neon text-black'
                : 'bg-white border-outline-variant text-on-surface-variant hover:border-ink hover:text-ink',
            )}
          >
            待审核
            {pendingCount != null && <span className="font-mono">{pendingCount}</span>}
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <DataTable<Campaign>
          columns={[
            colTitle,
            colAdvertiser,
            colSource,
            colPricing,
            colSchools,
            colSchedule,
            colQuote,
            colSpend,
            colStatus,
            colDetail,
          ]}
          data={items}
          loading={loading}
          onRowClick={(c) => router.push(`/ads/${c.id}`)}
          empty={<EmptyState icon={Megaphone} title="暂无广告" />}
        />
        <Pager page={page} total={total} onPage={setPage} />
      </div>
    </div>
  );
}

/* ── 入口：按角色分支 ───────────────────────────────────── */

export default function AdsPage() {
  const admin = useAdminInfo();
  if (!admin) return null;
  if (isSponsor(admin.role)) return <SponsorAds />;
  if (isUnion(admin.role)) return <UnionAds />;
  return <TeamAds />;
}
