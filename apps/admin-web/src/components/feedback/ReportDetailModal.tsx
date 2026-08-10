'use client';

/** 反馈全文查看弹窗（MOD-9）：正文 + 提交用户/联系方式/时间元信息 */
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { REPORT_CATEGORY, REPORT_STATUS, labelOf } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import type { FeedbackReport } from '@/lib/types';

export function ReportDetailModal({
  report,
  onClose,
}: {
  report: FeedbackReport;
  onClose: () => void;
}) {
  return (
    <Modal title={labelOf(REPORT_CATEGORY, report.category)} caption="FEEDBACK DETAIL" onClose={onClose}>
      <div className="space-y-4 pb-2">
        <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{report.content}</p>
        <div className="rounded-lg bg-surface-low p-4 space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-on-surface-variant shrink-0">提交用户</span>
            <span className="text-right">
              {report.user.profile?.nickname || '-'}
              <span className="font-mono text-xs text-outline"> · {report.user.email}</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-on-surface-variant shrink-0">联系方式</span>
            <span className="font-mono text-xs">{report.contact || '-'}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-on-surface-variant shrink-0">提交时间</span>
            <span className="font-mono text-xs">{formatDateTime(report.createdAt)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-on-surface-variant shrink-0">状态</span>
            <StatusBadge meta={REPORT_STATUS} value={report.status} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
