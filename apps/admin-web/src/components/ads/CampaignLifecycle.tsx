'use client';

/**
 * 流转时间线（ADSD-6）：创建 / 审核备注 / 驳回原因（粉）/ 确认收款+备注 /
 * 强制下架+原因（粉）/ 投放完成 / 分成已入账。
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
    items.push({ key: 'paid', label: '确认收款', text: c.paymentNote, time: c.paidAt });
  }
  if (c.suspendedAt || c.suspendReason) {
    items.push({ key: 'suspended', label: '强制下架', text: c.suspendReason, time: c.suspendedAt, pink: true });
  }
  if (c.completedAt) items.push({ key: 'completed', label: '投放完成', time: c.completedAt });
  if (c.settledAt) items.push({ key: 'settled', label: '分成已入账', time: c.settledAt });
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
