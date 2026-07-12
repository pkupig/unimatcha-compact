'use client';

/**
 * /ads/[id] — 广告详情（三角色共用，按角色 + 状态渲染操作栏）
 * SPONSOR(own)   编辑（DRAFT/REJECTED）/ 提交审核 / 暂停 / 恢复
 * STUDENT_UNION  通过 / 驳回（PENDING_UNION_REVIEW）
 * SUPER/TEAM     通过 / 驳回（PENDING_PLATFORM_REVIEW）· 确认收款（PENDING_PAYMENT）
 *                · 强制下架 / 恢复上架 · 暂停 / 恢复
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  ArrowLeft,
  ExternalLink,
  Megaphone,
  Pencil,
  MousePointerClick,
  Eye,
  Percent,
  Wallet,
} from 'lucide-react';
import {
  getCampaign,
  getCampaignStats,
  submitCampaign,
  reviewCampaign,
  confirmCampaignPayment,
  pauseCampaign,
  resumeCampaign,
  suspendCampaign,
  unsuspendCampaign,
  type Campaign,
  type AdDailyStatPoint,
} from '@/lib/api';
import { formatDate, formatDateTime, formatNumber, formatShortDate, fenToYuan } from '@/lib/format';
import {
  PageHeader,
  Card,
  StatCard,
  StatusBadge,
  Badge,
  Money,
  Modal,
  Textarea,
  TrendChart,
  EmptyState,
  useAdminInfo,
  PRICING_MODEL_LABELS,
} from '@/components/ui';
import { isTeam, isUnion, isSponsor } from '@/lib/auth';

/* ── 操作定义 ─────────────────────────────────────────────── */

type ActionKind =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'confirm-payment'
  | 'pause'
  | 'resume'
  | 'suspend'
  | 'unsuspend';

interface ActionConfig {
  title: string;
  confirmText: string;
  desc?: string;
  danger?: boolean;
  /** undefined = 无备注输入；'optional' | 'required' */
  note?: 'optional' | 'required';
  noteLabel?: string;
}

const ACTION_CONFIGS: Record<ActionKind, ActionConfig> = {
  submit: {
    title: '提交审核',
    confirmText: '提交',
    desc: '提交后计价按平台快照锁定并进入审核流程，审核期间不可编辑。',
  },
  approve: {
    title: '审核通过',
    confirmText: '通过',
    desc: '通过后广告将进入待付款状态。',
    note: 'optional',
    noteLabel: '审核备注（可选）',
  },
  reject: {
    title: '驳回广告',
    confirmText: '驳回',
    danger: true,
    note: 'required',
    noteLabel: '驳回原因',
  },
  'confirm-payment': {
    title: '确认收款',
    confirmText: '确认收款',
    desc: '确认线下款项已到账；广告将进入排期，到起始日自动投放。',
    note: 'optional',
    noteLabel: '收款备注（可选）',
  },
  pause: { title: '暂停投放', confirmText: '暂停', desc: '暂停后可随时恢复投放。' },
  resume: { title: '恢复投放', confirmText: '恢复' },
  suspend: {
    title: '强制下架',
    confirmText: '下架',
    danger: true,
    desc: '强制下架后广告立即停止展示，团队可解除恢复。',
    note: 'required',
    noteLabel: '下架原因',
  },
  unsuspend: { title: '恢复上架', confirmText: '恢复上架', desc: '解除强制下架，广告恢复投放。' },
};

/** stats 响应归一化 + 按日期聚合（多校合并） */
function normalizeStats(data: any): AdDailyStatPoint[] {
  const raw: any[] = Array.isArray(data)
    ? data
    : data?.stats || data?.daily || data?.items || data?.list || [];
  const byDate = new Map<string, AdDailyStatPoint>();
  for (const p of raw) {
    const key = String(p.date).slice(0, 10);
    const cur = byDate.get(key) || { date: key, impressions: 0, clicks: 0, spendCents: 0 };
    cur.impressions += p.impressions || 0;
    cur.clicks += p.clicks || 0;
    cur.spendCents += p.spendCents || 0;
    byDate.set(key, cur);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export default function AdDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const admin = useAdminInfo();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<AdDailyStatPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [action, setAction] = useState<ActionKind | null>(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCampaign(id);
      setCampaign((res as any).data || null);
    } catch (err: any) {
      toast.error(err?.message || '加载广告详情失败');
      setCampaign(null);
    } finally {
      setLoading(false);
    }
    getCampaignStats(id)
      .then((res) => setStats(normalizeStats((res as any).data)))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── 汇总（日序列求和，缺失时回退 campaign.stats） ── */
  const summary = useMemo(() => {
    const fromSeries = stats.reduce(
      (acc, p) => ({
        impressions: acc.impressions + p.impressions,
        clicks: acc.clicks + p.clicks,
      }),
      { impressions: 0, clicks: 0 },
    );
    const impressions = stats.length ? fromSeries.impressions : (campaign?.stats?.impressions ?? 0);
    const clicks = stats.length ? fromSeries.clicks : (campaign?.stats?.clicks ?? 0);
    const ctr = impressions > 0 ? `${((clicks / impressions) * 100).toFixed(2)}%` : '-';
    return { impressions, clicks, ctr };
  }, [stats, campaign]);

  const chartData = useMemo(
    () => stats.map((p) => ({ ...p, day: formatShortDate(p.date) })),
    [stats],
  );

  /* ── 角色 × 状态 → 可用操作 ── */
  const role = admin?.role;
  const isOwner = !!admin && !!campaign && isSponsor(role) && campaign.advertiserId === admin.id;
  const status = campaign?.status;

  const canEdit = isOwner && (status === 'DRAFT' || status === 'REJECTED');
  const availableActions: ActionKind[] = useMemo(() => {
    if (!campaign || !role) return [];
    const acts: ActionKind[] = [];
    if (isOwner) {
      if (status === 'DRAFT' || status === 'REJECTED') acts.push('submit');
      if (status === 'ACTIVE') acts.push('pause');
      if (status === 'PAUSED') acts.push('resume');
    }
    if (isUnion(role) && status === 'PENDING_UNION_REVIEW') acts.push('approve', 'reject');
    if (isTeam(role)) {
      if (status === 'PENDING_PLATFORM_REVIEW') acts.push('approve', 'reject');
      if (status === 'PENDING_PAYMENT') acts.push('confirm-payment');
      if (status === 'ACTIVE') acts.push('pause', 'suspend');
      if (status === 'PAUSED') acts.push('resume', 'suspend');
      if (status === 'SCHEDULED') acts.push('suspend');
      if (status === 'SUSPENDED') acts.push('unsuspend');
    }
    return acts;
  }, [campaign, role, status, isOwner]);

  const openAction = (kind: ActionKind) => {
    setNote('');
    setAction(kind);
  };

  const runAction = async () => {
    if (!action || !campaign) return;
    const cfg = ACTION_CONFIGS[action];
    const trimmed = note.trim();
    if (cfg.note === 'required' && !trimmed) {
      toast.error(`请填写${cfg.noteLabel || '原因'}`);
      return;
    }
    setActing(true);
    try {
      switch (action) {
        case 'submit':
          await submitCampaign(campaign.id);
          break;
        case 'approve':
          await reviewCampaign(campaign.id, { approve: true, note: trimmed || undefined });
          break;
        case 'reject':
          await reviewCampaign(campaign.id, { approve: false, note: trimmed });
          break;
        case 'confirm-payment':
          await confirmCampaignPayment(campaign.id, trimmed ? { note: trimmed } : undefined);
          break;
        case 'pause':
          await pauseCampaign(campaign.id);
          break;
        case 'resume':
          await resumeCampaign(campaign.id);
          break;
        case 'suspend':
          await suspendCampaign(campaign.id, { reason: trimmed });
          break;
        case 'unsuspend':
          await unsuspendCampaign(campaign.id);
          break;
      }
      toast.success(`${cfg.title}成功`);
      setAction(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || `${cfg.title}失败`);
    } finally {
      setActing(false);
    }
  };

  /* ── 流转记录 ── */
  const timeline = useMemo(() => {
    if (!campaign) return [];
    const items: { key: string; label: string; text?: string | null; time?: string | null; pink?: boolean }[] = [];
    items.push({ key: 'created', label: '创建', time: campaign.createdAt });
    if (campaign.reviewNote) items.push({ key: 'review', label: '审核备注', text: campaign.reviewNote });
    if (campaign.rejectedReason)
      items.push({ key: 'rejected', label: '驳回原因', text: campaign.rejectedReason, pink: true });
    if (campaign.paidAt || campaign.paymentNote)
      items.push({ key: 'paid', label: '确认收款', text: campaign.paymentNote, time: campaign.paidAt });
    if (campaign.suspendedAt || campaign.suspendReason)
      items.push({
        key: 'suspended',
        label: '强制下架',
        text: campaign.suspendReason,
        time: campaign.suspendedAt,
        pink: true,
      });
    if (campaign.completedAt) items.push({ key: 'completed', label: '投放完成', time: campaign.completedAt });
    if (campaign.settledAt) items.push({ key: 'settled', label: '分成已入账', time: campaign.settledAt });
    return items;
  }, [campaign]);

  /* ── 渲染 ── */

  if (loading && !campaign) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded-lg bg-surface-high animate-pulse" />
        <div className="card h-40 animate-pulse" />
        <div className="card h-64 animate-pulse" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="card">
        <EmptyState
          icon={Megaphone}
          title="广告不存在或无权查看"
          action={
            <Link href="/ads" className="btn-secondary btn-sm">
              <ArrowLeft size={14} />
              返回列表
            </Link>
          }
        />
      </div>
    );
  }

  const cfg = action ? ACTION_CONFIGS[action] : null;
  const isBuyout = campaign.pricingModel === 'BUYOUT';
  const unionSourced = !!campaign.sourcedBySchoolId;

  return (
    <div className="space-y-6">
      <PageHeader
        caption="CAMPAIGN DETAIL"
        title={
          <span className="inline-flex items-center gap-3 flex-wrap">
            {campaign.title}
            <StatusBadge status={campaign.status} kind="campaign" />
          </span>
        }
        sub={
          <span className="inline-flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span>{PRICING_MODEL_LABELS[campaign.pricingModel] || campaign.pricingModel}</span>
            <span className="font-mono text-xs">
              {formatDate(campaign.startDate)} ~ {formatDate(campaign.endDate)}
            </span>
            <span>{campaign.advertiser?.organizationName || campaign.advertiser?.name || '-'}</span>
            {unionSourced ? (
              <Badge variant="ink">{campaign.sourcedBySchool?.name || '学生会'}·自拉</Badge>
            ) : (
              <Badge variant="outline">平台直签</Badge>
            )}
          </span>
        }
        actions={
          <Link href="/ads" className="btn-secondary btn-sm">
            <ArrowLeft size={14} />
            返回列表
          </Link>
        }
      />

      {/* 操作栏 */}
      {(canEdit || availableActions.length > 0) && (
        <div className="card py-4">
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && (
              <Link href={`/ads/new?id=${campaign.id}`} className="btn-secondary btn-sm">
                <Pencil size={14} />
                编辑
              </Link>
            )}
            {availableActions.map((kind) => {
              const c = ACTION_CONFIGS[kind];
              const positive = kind === 'submit' || kind === 'approve' || kind === 'resume' || kind === 'unsuspend';
              return (
                <button
                  key={kind}
                  className={clsx(
                    c.danger ? 'btn-danger' : positive ? 'btn-cta' : 'btn-primary',
                    'btn-sm',
                  )}
                  onClick={() => openAction(kind)}
                >
                  {c.title}
                </button>
              );
            })}
            {unionSourced && (isUnion(role) || isTeam(role)) && (
              <span className="inline-flex items-center gap-2 ml-auto text-xs text-on-surface-variant">
                <Badge variant="neon">自拉赞助</Badge>
                分成按本校自拉档计算
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ── 左：素材 / 数据 / 流转记录 ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card caption="CREATIVE" title="素材">
            <div className="space-y-4">
              {campaign.images?.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {campaign.images.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`素材 ${i + 1}`}
                      className="h-28 w-auto rounded-lg border border-outline-variant/40 object-cover shrink-0"
                    />
                  ))}
                </div>
              )}
              <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                {campaign.content}
              </p>
              {campaign.landingUrl && (
                <a
                  href={campaign.landingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-display font-bold text-ink underline underline-offset-2 hover:text-neon-pink break-all"
                >
                  <ExternalLink size={13} className="shrink-0" />
                  {campaign.landingUrl}
                </a>
              )}
            </div>
          </Card>

          <Card caption="PERFORMANCE" title="数据">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
              <StatCard label="曝光" value={formatNumber(summary.impressions)} icon={Eye} />
              <StatCard
                label="点击"
                value={formatNumber(summary.clicks)}
                icon={MousePointerClick}
              />
              <StatCard label="CTR" value={summary.ctr} icon={Percent} />
              <StatCard
                label="消耗"
                value={fenToYuan(campaign.spendCents)}
                icon={Wallet}
                accent="neon"
              />
            </div>
            {chartData.length === 0 ? (
              <EmptyState title="暂无投放数据" sub="广告开始投放后将展示每日曝光与点击趋势。" />
            ) : (
              <TrendChart
                data={chartData}
                xKey="day"
                series={[
                  { key: 'impressions', label: '曝光' },
                  { key: 'clicks', label: '点击' },
                ]}
                valueFormatter={(v) => formatNumber(Number(v))}
              />
            )}
          </Card>

          <Card caption="HISTORY" title="流转记录">
            {timeline.length === 0 ? (
              <p className="text-sm text-on-surface-variant">暂无流转记录</p>
            ) : (
              <ul className="space-y-3">
                {timeline.map((t) => (
                  <li key={t.key} className="flex items-start gap-3">
                    <span
                      className={clsx(
                        'mt-1.5 w-2 h-2 rounded-full shrink-0',
                        t.pink ? 'bg-neon-pink' : 'bg-ink',
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-display font-bold text-on-surface">
                        {t.label}
                        {t.time && (
                          <span className="font-mono text-xs font-normal text-outline ml-2">
                            {formatDateTime(t.time)}
                          </span>
                        )}
                      </p>
                      {t.text && (
                        <p
                          className={clsx(
                            'text-sm mt-0.5 leading-relaxed',
                            t.pink ? 'text-neon-pink' : 'text-on-surface-variant',
                          )}
                        >
                          {t.text}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ── 右：金额 / 投放 ── */}
        <div className="space-y-6">
          <Card caption="AMOUNT" title="金额">
            <div className="space-y-4">
              <div>
                <p className="caption mb-1">{isBuyout ? '报价' : '预算'}</p>
                <Money
                  cents={isBuyout ? campaign.totalPriceCents : campaign.budgetCents}
                  className="text-2xl font-bold text-on-surface"
                />
              </div>
              <div className="border-t border-outline-variant/40 pt-4">
                <p className="caption mb-1">已消耗</p>
                <Money cents={campaign.spendCents} className="text-2xl font-bold text-on-surface" />
              </div>
            </div>
          </Card>

          <Card caption="PLACEMENT" title="投放学校">
            {!campaign.placements || campaign.placements.length === 0 ? (
              <p className="text-sm text-on-surface-variant">暂无投放学校</p>
            ) : (
              <ul className="divide-y divide-outline-variant/30">
                {campaign.placements.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm font-medium text-on-surface truncate">
                      {(p as any).schoolName || p.school?.name || p.schoolId}
                    </span>
                    {isBuyout && (
                      <Money
                        cents={p.buyoutPriceCents}
                        className="text-xs text-on-surface-variant whitespace-nowrap"
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* 操作确认弹窗（含可选/必填备注） */}
      <Modal
        open={action != null}
        onClose={() => !acting && setAction(null)}
        title={cfg?.title}
        caption="ACTION"
        widthClassName="max-w-md"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={() => setAction(null)} disabled={acting}>
              取消
            </button>
            <button
              className={clsx(cfg?.danger ? 'btn-danger' : 'btn-primary', 'btn-sm')}
              onClick={runAction}
              disabled={acting}
            >
              {acting ? '处理中…' : cfg?.confirmText}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {cfg?.desc && (
            <p className="text-sm text-on-surface-variant leading-relaxed">{cfg.desc}</p>
          )}
          {unionSourced && (action === 'approve' || action === 'reject') && (
            <p className="text-xs text-on-surface-variant">
              <Badge variant="neon" className="mr-1.5">自拉赞助</Badge>
              分成按本校自拉档计算
            </p>
          )}
          {cfg?.note && (
            <div>
              <label className="label">
                {cfg.noteLabel}
                {cfg.note === 'required' && <span className="text-neon-pink ml-0.5">*</span>}
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={cfg.note === 'required' ? '必填' : '选填'}
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
