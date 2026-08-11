'use client';

/**
 * 流转时间线（ADSD-6，能量经济）：创建 / 审核备注 / 驳回原因（粉）/
 * 审核通过（费用已预扣）——旧流程存量单据显示「确认收款」/
 * 强制下架+原因（粉）/ 投放完成 / 分成已入账 / CPM·CPC 结余退回。
 */
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/format';
import type { Campaign } from '@/lib/types';

interface TimelineItem {
  key: string;
  label: string;
  text?: string | null;
  time?: string | null;
  pink?: boolean;
}

function buildTimeline(c: Campaign): TimelineItem[] {
  const items: TimelineItem[] = [{ key: 'created', label: '创建', time: c.createdAt }];
  if (c.reviewNote) items.push({ key: 'review', label: '审核备注', text: c.reviewNote });
  if (c.rejectedReason) {
    items.push({ key: 'rejected', label: '驳回原因', text: c.rejectedReason, pink: true });
  }
  if (c.paidAt || c.paymentNote) {
    // 能量经济后审核通过即写 paidAt（预扣即付）；走过 confirmPayment 的旧流程存量单据
    // 有确认人/收款备注，按原「确认收款」语义展示
    const legacyPayment = !!c.paymentConfirmedByAdminId || !!c.paymentNote;
    items.push({
      key: 'paid',
      label: legacyPayment ? '确认收款（旧流程）' : '审核通过（费用已预扣）',
      text: c.paymentNote,
      time: c.paidAt,
    });
  }
  if (c.suspendedAt || c.suspendReason) {
    items.push({ key: 'suspended', label: '强制下架', text: c.suspendReason, time: c.suspendedAt, pink: true });
  }
  if (c.completedAt) items.push({ key: 'completed', label: '投放完成', time: c.completedAt });
  if (c.settledAt) {
    items.push({ key: 'settled', label: '分成已入账', time: c.settledAt });
    // CPM/CPC 结算时按「预算 − 实际消耗」退回商家钱包（后端 settleCampaign，与 settledAt 同锚点）
    if (c.pricingModel !== 'BUYOUT') {
      items.push({
        key: 'leftover',
        label: '结余退回',
        text: '预算 − 实际消耗的结余（如有）已原路退回能量钱包',
        time: c.settledAt,
      });
    }
  }
  return items;
}

export function CampaignLifecycle({ campaign }: { campaign: Campaign }) {
  const timeline = buildTimeline(campaign);
  return (
    <Card caption="HISTORY" title="流转记录">
      <ul className="space-y-3">
        {timeline.map((t) => (
          <li key={t.key} className="flex items-start gap-3">
            <span
              className={clsx('mt-1.5 w-2 h-2 rounded-full shrink-0', t.pink ? 'bg-neon-pink' : 'bg-ink')}
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
    </Card>
  );
}
