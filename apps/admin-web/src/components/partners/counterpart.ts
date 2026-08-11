import { isSponsor, isUnion } from '@/lib/auth';
import type { AdminRole } from '@/lib/types';
import type { PartnerThread } from '@/lib/api/partners';

/**
 * 线程对端展示名（列表与详情共用，避免两处角色分叉不一致）：
 * 广告商看校名 / 学生会看广告商组织名 / 平台监管看「组织 × 学校」全貌。
 */
export function counterpartLabel(
  role: AdminRole | null | undefined,
  thread: PartnerThread,
): string {
  // organizationName 真实可空（历史账号只有 name），回退联系人姓名
  const org = thread.sponsorAdmin.organizationName ?? thread.sponsorAdmin.name;
  if (isSponsor(role)) return thread.school.name;
  if (isUnion(role)) return org;
  return `${org} × ${thread.school.name}`;
}
