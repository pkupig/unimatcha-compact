'use client';

/**
 * 详情右栏/素材面板（ADSD-4/7）：素材卡（图片条/正文/落地外链）、
 * 金额卡（报价或预算 + 已消耗）、投放学校列表（BUYOUT 含每校包断价）。
 */
import { ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Money } from '@/components/ui/Money';
import type { CampaignDetail } from '@/lib/types';

export function CreativeCard({ campaign }: { campaign: CampaignDetail }) {
  return (
    <Card caption="CREATIVE" title="素材">
      <div className="space-y-4">
        {campaign.images.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {campaign.images.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- 外部素材 URL，域名不可枚举，无法走 next/image
              <img
                key={i}
                src={url}
                alt={`素材 ${i + 1}`}
                className="h-28 w-auto rounded-lg border border-outline-variant/40 object-cover shrink-0"
              />
            ))}
          </div>
        )}
        <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{campaign.content}</p>
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
  );
}

export function AmountCard({ campaign }: { campaign: CampaignDetail }) {
  const isBuyout = campaign.pricingModel === 'BUYOUT';
  return (
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
  );
}

export function PlacementsCard({ campaign }: { campaign: CampaignDetail }) {
  const isBuyout = campaign.pricingModel === 'BUYOUT';
  return (
    <Card caption="PLACEMENT" title="投放学校">
      {campaign.placements.length === 0 ? (
        <p className="text-sm text-on-surface-variant">暂无投放学校</p>
      ) : (
        <ul className="divide-y divide-outline-variant/30">
          {campaign.placements.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
              <span className="text-sm font-medium text-on-surface truncate">
                {p.schoolName ?? p.schoolId}
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
  );
}
