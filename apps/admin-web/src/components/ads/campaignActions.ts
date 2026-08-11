/**
 * 详情页操作矩阵的唯一定义（ADSD-1/2）：
 * 角色 × 状态 → 可用操作；每操作带说明文案与备注要求（必填/选填/无）。
 */
import type { AdminRole, Campaign, CampaignStatus } from '@/lib/types';
import { isTeam, isUnion } from '@/lib/auth';
import {
  confirmCampaignPayment,
  pauseCampaign,
  resumeCampaign,
  reviewCampaign,
  submitCampaign,
  suspendCampaign,
  unsuspendCampaign,
  withdrawCampaignSubmission,
} from '@/lib/api/ads';

export type CampaignAction =
  | 'submit'
  | 'withdraw'
  | 'approve'
  | 'reject'
  | 'confirm-payment'
  | 'pause'
  | 'resume'
  | 'suspend'
  | 'unsuspend';

export interface CampaignActionConfig {
  title: string;
  confirmText: string;
  desc?: string;
  danger?: boolean;
  /** undefined=无备注；optional=备注选填；required=理由必填 */
  note?: 'optional' | 'required';
  noteLabel?: string;
}

export const ACTION_CONFIGS: Record<CampaignAction, CampaignActionConfig> = {
  submit: {
    title: '提交审核',
    confirmText: '提交',
    desc: '提交后计价按平台快照锁定，并从能量钱包预扣全额（驳回或撤回原路退回），审核期间不可编辑。',
  },
  withdraw: {
    title: '撤回审核',
    confirmText: '撤回',
    desc: '撤回后回到草稿，预扣能量原路退回；可修改后重新提交。',
  },
  approve: {
    title: '审核通过',
    confirmText: '通过',
    desc: '费用已在商家提交时预扣，通过后广告直接进入排期 / 投放。',
    note: 'optional',
    noteLabel: '审核备注',
  },
  reject: {
    title: '驳回广告',
    confirmText: '驳回',
    desc: '驳回后预扣能量原路退回，商家可修改素材与排期重新提交。',
    danger: true,
    note: 'required',
    noteLabel: '驳回原因',
  },
  'confirm-payment': {
    title: '确认收款（旧流程）',
    confirmText: '确认收款',
    desc: '（旧流程存量单据）确认线下款项已到账；广告将进入排期，到起始日自动投放。',
    note: 'optional',
    noteLabel: '收款备注',
  },
  pause: { title: '暂停投放', confirmText: '暂停', desc: '暂停后可随时恢复投放。' },
  resume: { title: '恢复投放', confirmText: '恢复', desc: '恢复后按档期继续投放（未到开始日则回到已排期）。' },
  suspend: {
    title: '强制下架',
    confirmText: '下架',
    desc: '强制下架后广告立即停止展示，团队可解除恢复。',
    danger: true,
    note: 'required',
    noteLabel: '下架原因',
  },
  unsuspend: {
    title: '恢复上架',
    confirmText: '恢复上架',
    desc: '解除强制下架，广告恢复投放；已过投放期则直接完成并触发结算。',
  },
};

/**
 * 操作矩阵（与后端各端点的状态守卫逐条对齐）：
 * - owner 商家：submit（DRAFT/REJECTED）· withdraw（两种审核中）· pause（ACTIVE）· resume（PAUSED）
 * - 学生会：approve/reject（PENDING_UNION_REVIEW，本校自拉单）
 * - 团队：approve/reject（PENDING_PLATFORM_REVIEW）· confirm-payment（PENDING_PAYMENT，旧流程存量）
 *         · pause+suspend（ACTIVE）· resume+suspend（PAUSED）· suspend（SCHEDULED）· unsuspend（SUSPENDED）
 */
export function availableCampaignActions(
  role: AdminRole | null,
  isOwner: boolean,
  status: CampaignStatus,
): CampaignAction[] {
  const acts: CampaignAction[] = [];
  if (isOwner) {
    if (status === 'DRAFT' || status === 'REJECTED') acts.push('submit');
    if (status === 'PENDING_UNION_REVIEW' || status === 'PENDING_PLATFORM_REVIEW') {
      acts.push('withdraw');
    }
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
}

/** 执行操作（note：reject/suspend 必填由弹窗保证，approve/confirm-payment 选填） */
export async function runCampaignAction(
  campaign: Campaign,
  action: CampaignAction,
  note?: string,
): Promise<void> {
  switch (action) {
    case 'submit':
      await submitCampaign(campaign.id);
      return;
    case 'withdraw':
      await withdrawCampaignSubmission(campaign.id);
      return;
    case 'approve':
      await reviewCampaign(campaign.id, { approve: true, note });
      return;
    case 'reject':
      await reviewCampaign(campaign.id, { approve: false, note: note ?? '' });
      return;
    case 'confirm-payment':
      await confirmCampaignPayment(campaign.id, note ? { note } : {});
      return;
    case 'pause':
      await pauseCampaign(campaign.id);
      return;
    case 'resume':
      await resumeCampaign(campaign.id);
      return;
    case 'suspend':
      await suspendCampaign(campaign.id, { reason: note ?? '' });
      return;
    case 'unsuspend':
      await unsuspendCampaign(campaign.id);
      return;
  }
}
