'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ADMIN_ROLE } from '@/lib/labels';
import type { AdminInfo } from '@/lib/types';

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-outline-variant/30 last:border-b-0">
      <span className="w-24 shrink-0 text-sm text-on-surface-variant">{label}</span>
      <span className="text-sm text-on-surface min-w-0 break-all">{children}</span>
    </div>
  );
}

/** ACT-1：只读账号信息卡（信息由平台/学生会维护，本页只能改显示名称与密码） */
export function AccountInfoCard({ admin }: { admin: AdminInfo }) {
  return (
    <Card caption="PROFILE" title="账号信息">
      <div>
        {admin.organizationName && <InfoRow label="组织名">{admin.organizationName}</InfoRow>}
        <InfoRow label="登录邮箱">
          <span className="font-mono">{admin.email}</span>
        </InfoRow>
        <InfoRow label="角色">
          <StatusBadge meta={ADMIN_ROLE} value={admin.role} />
        </InfoRow>
        {admin.schoolName && <InfoRow label="所属学校">{admin.schoolName}</InfoRow>}
        {(admin.contactName || admin.contactPhone) && (
          <InfoRow label="联系人">
            {admin.contactName ?? '-'}
            {admin.contactPhone && <span className="font-mono ml-2">{admin.contactPhone}</span>}
          </InfoRow>
        )}
        {admin.role === 'SPONSOR' && (
          <InfoRow label="账号来源">
            {admin.sourcedBySchoolName ? (
              <Badge variant="neon">学生会自拉 · {admin.sourcedBySchoolName}</Badge>
            ) : (
              <Badge variant="ink">平台直签</Badge>
            )}
          </InfoRow>
        )}
      </div>
      <p className="text-xs text-outline mt-4">
        账号信息由平台/学生会维护，如需变更请联系对应负责人。
      </p>
    </Card>
  );
}
