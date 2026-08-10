'use client';

/**
 * /submissions — 官网提交（SUPER/TEAM）：赞助申请 / 候补名单双 tab。
 * tab+status 读写 URL（深链 /submissions?tab=SPONSOR&status=PENDING）：
 * 交互只改 URL，effect 单向同步进列表引擎——深链、前进后退、tab 切换同一条路。
 */
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Card } from '@/components/ui/Card';
import { FilterBar } from '@/components/ui/FilterBar';
import { Select } from '@/components/ui/form';
import { Pager } from '@/components/ui/Pager';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { listSubmissions, updateSubmission } from '@/lib/api/submissions';
import { SUBMISSION_STATUS } from '@/lib/labels';
import type { Submission, SubmissionStatus, SubmissionType } from '@/lib/types';
import { SubmissionsTable } from '@/components/submissions/SubmissionsTable';
import { SubmissionDetailModal } from '@/components/submissions/SubmissionDetailModal';
import { ContactModal } from '@/components/submissions/ContactModal';
import { ConvertModal } from '@/components/submissions/ConvertModal';

const TAB_ITEMS = [
  { key: 'SPONSOR', label: '赞助申请' },
  { key: 'WAITLIST', label: '候补名单' },
];

function parseTab(v: string | null): SubmissionType {
  return v === 'WAITLIST' ? 'WAITLIST' : 'SPONSOR';
}
function parseStatus(v: string | null): SubmissionStatus | '' {
  return v && v in SUBMISSION_STATUS.labels ? (v as SubmissionStatus) : '';
}

function SubmissionsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = parseTab(sp.get('tab'));
  const status = parseStatus(sp.get('status'));

  const list = usePagedList<Submission, { type: SubmissionType; status: SubmissionStatus | '' }>({
    fetcher: (q) => listSubmissions(q),
    initialFilters: { type: tab, status },
  });

  // URL → 列表筛选（有变化才写，避免 mount 时重复拉取）
  const { filters, setFilters, setSearch } = list;
  useEffect(() => {
    if (filters.type !== tab || filters.status !== status) setFilters({ type: tab, status });
  }, [tab, status, filters, setFilters]);

  const go = (nextTab: SubmissionType, nextStatus: SubmissionStatus | '') => {
    const q = new URLSearchParams({ tab: nextTab });
    if (nextStatus) q.set('status', nextStatus);
    router.replace(`/submissions?${q.toString()}`);
  };
  const switchTab = (k: string) => {
    setSearch(''); // 切 tab 语义 = 换清单，搜索词不跨 tab 残留
    go(parseTab(k), '');
  };

  const detail = useModal<Submission>();
  const contact = useModal<Submission>();
  const closeSub = useModal<Submission>();
  const reopen = useModal<Submission>();
  const convert = useModal<Submission>();

  return (
    <div className="space-y-6">
      <PageHeader caption="Submissions" title="官网提交" sub="官网赞助申请与候补名单的跟进处理" />
      <Tabs items={TAB_ITEMS} value={tab} onChange={switchTab} />
      <FilterBar>
        <Select className="w-40" value={status} onChange={(e) => go(tab, parseStatus(e.target.value))}>
          <option value="">全部状态</option>
          {(Object.keys(SUBMISSION_STATUS.labels) as SubmissionStatus[]).map((s) => (
            <option key={s} value={s}>{SUBMISSION_STATUS.labels[s]}</option>
          ))}
        </Select>
        <FilterBar.Search value={list.search} onChange={list.setSearch} placeholder="搜索邮箱 / 组织" />
      </FilterBar>

      <Card flush>
        <SubmissionsTable
          rows={list.items} loading={list.loading} error={list.error} sponsorTab={tab === 'SPONSOR'}
          onView={detail.openWith} onContact={contact.openWith} onCloseRow={closeSub.openWith}
          onConvert={convert.openWith} onReopen={reopen.openWith}
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />

      {detail.open && detail.data && <SubmissionDetailModal data={detail.data} onClose={detail.close} />}
      {contact.open && contact.data && (
        <ContactModal data={contact.data} onClose={contact.close} onDone={list.refresh} />
      )}
      {closeSub.open && closeSub.data && (
        <ConfirmDialog
          title="关闭提交" danger requireReason reasonLabel="关闭原因" confirmText="确认关闭"
          message={`关闭「${closeSub.data.organization || closeSub.data.email}」后不再跟进，可随时重新打开。`}
          onConfirm={async (reason) => {
            await updateSubmission(closeSub.data!.id, { status: 'REJECTED', note: reason });
            toast.success('提交已关闭');
            await list.refresh();
          }}
          onClose={closeSub.close}
        />
      )}
      {reopen.open && reopen.data && (
        <ConfirmDialog
          title="重新打开" confirmText="重新打开"
          message={`将「${reopen.data.organization || reopen.data.email}」重新置为待处理，继续跟进。`}
          onConfirm={async () => {
            await updateSubmission(reopen.data!.id, { status: 'PENDING' });
            toast.success('已重新打开');
            await list.refresh();
          }}
          onClose={reopen.close}
        />
      )}
      {convert.open && convert.data && (
        <ConvertModal data={convert.data} onClose={convert.close} onDone={list.refresh} />
      )}
    </div>
  );
}

/** Next 14：用了 useSearchParams 的页面默认导出必须包 Suspense */
export default function SubmissionsPage() {
  return (
    <Suspense fallback={null}>
      <SubmissionsInner />
    </Suspense>
  );
}
