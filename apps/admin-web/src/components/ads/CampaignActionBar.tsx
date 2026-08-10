'use client';

/**
 * 详情操作栏（ADSD-1/3）：编辑链接（owner，DRAFT/REJECTED）+ 操作矩阵按钮 + 自拉分成提示。
 * 无可用操作时整条不渲染。
 */
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { isTeam, isUnion } from '@/lib/auth';
import type { AdminRole, Campaign } from '@/lib/types';
import { ACTION_CONFIGS, availableCampaignActions, type CampaignAction } from './campaignActions';

/** 按钮语义：破坏性 danger；推进性 primary；暂停类中性 secondary（CTA 名额留给列表新建） */
function variantOf(action: CampaignAction): 'primary' | 'secondary' | 'danger' {
  if (ACTION_CONFIGS[action].danger) return 'danger';
  if (action === 'pause') return 'secondary';
  return 'primary';
}

export function CampaignActionBar({
  campaign,
  role,
  isOwner,
  onAction,
}: {
  campaign: Campaign;
  role: AdminRole | null;
  isOwner: boolean;
  onAction: (action: CampaignAction) => void;
}) {
  const actions = availableCampaignActions(role, isOwner, campaign.status);
  const canEdit = isOwner && (campaign.status === 'DRAFT' || campaign.status === 'REJECTED');
  const showSourcedHint =
    !!campaign.sourcedBySchoolId && (isUnion(role) || isTeam(role));

  if (!canEdit && actions.length === 0 && !showSourcedHint) return null;

  return (
    <div className="card py-4">
      <div className="flex items-center gap-2 flex-wrap">
        {canEdit && (
          <Link href={`/ads/new?id=${campaign.id}`} className="btn-secondary btn-sm">
            <Pencil size={14} />
            编辑
          </Link>
        )}
        {actions.map((action) => (
          <Button
            key={action}
            size="sm"
            variant={variantOf(action)}
            onClick={() => onAction(action)}
          >
            {ACTION_CONFIGS[action].title}
          </Button>
        ))}
        {showSourcedHint && (
          <span className="inline-flex items-center gap-2 ml-auto text-xs text-on-surface-variant">
            <Badge variant="neon">自拉赞助</Badge>
            分成按本校自拉档计算
          </span>
        )}
      </div>
    </div>
  );
}
