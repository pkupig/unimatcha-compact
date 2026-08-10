'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { labelOf, SUBMISSION_STATUS, SUBMISSION_TYPE } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import type { Submission } from '@/lib/types';

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-on-surface-variant shrink-0">{label}</span>
      <span className="text-right min-w-0">{children}</span>
    </div>
  );
}

/** 提交详情（SUB-4）：全文留言 + 元信息；已开通则链接到 /accounts */
export function SubmissionDetailModal({ data, onClose }: { data: Submission; onClose: () => void }) {
  return (
    <Modal
      title={data.organization || labelOf(SUBMISSION_TYPE, data.type)}
      caption="Submission Detail"
      size="lg"
      onClose={onClose}
    >
      <div className="space-y-4 pb-2">
        {data.message ? (
          <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{data.message}</p>
        ) : (
          <p className="text-sm text-outline">（无留言）</p>
        )}

        <div className="rounded-lg bg-surface-low p-4 space-y-1.5 text-sm">
          <MetaRow label="类型 · 状态">
            {labelOf(SUBMISSION_TYPE, data.type)} · <StatusBadge meta={SUBMISSION_STATUS} value={data.status} />
          </MetaRow>
          <MetaRow label="邮箱">
            <span className="font-mono text-xs break-all">{data.email}</span>
          </MetaRow>
          {data.organization && <MetaRow label="组织">{data.organization}</MetaRow>}
          <MetaRow label="提交语言">
            <span className="font-mono text-xs uppercase">{data.locale || '-'}</span>
          </MetaRow>
          <MetaRow label="提交时间">
            <span className="font-mono text-xs">{formatDateTime(data.createdAt)}</span>
          </MetaRow>
          {(data.handleNote || data.handledAt) && (
            <MetaRow label="处理">
              {data.handleNote || '-'}
              {data.handledAt && (
                <span className="font-mono text-xs text-outline"> · {formatDateTime(data.handledAt)}</span>
              )}
            </MetaRow>
          )}
          {data.convertedAdmin && (
            <MetaRow label="开通账号">
              <Link href="/accounts" className="font-bold underline underline-offset-2 hover:text-ink">
                {data.convertedAdmin.name}
              </Link>
            </MetaRow>
          )}
        </div>
      </div>
    </Modal>
  );
}
