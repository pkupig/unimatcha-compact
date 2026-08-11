'use client';

/**
 * /partners — 跨校合作洽谈（B6）。
 * 角色差异：SPONSOR「高校合作」/ STUDENT_UNION「广告商合作」/ 平台「合作洽谈」（只读监管、无目录 tab）；
 * 标题直接复用 permissions.NAV 的 roleLabels（单一真源，不再抄一份 map）。
 * ?tab= 深链（DEEP_LINKS.partnersDirectory）+ 回同步，照 accounts 页模式。
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { useAdmin } from '@/lib/auth-context';
import { isSponsor, isTeam } from '@/lib/auth';
import { navForRole } from '@/lib/permissions';
import { ThreadListPanel } from '@/components/partners/ThreadListPanel';
import { DirectoryPanel } from '@/components/partners/DirectoryPanel';

type PartnersTab = 'threads' | 'directory';

const TAB_ITEMS: { key: PartnersTab; label: string }[] = [
  { key: 'threads', label: '洽谈线程' },
  { key: 'directory', label: '合作目录' },
];

function parseTab(raw: string | null, allowed: PartnersTab[]): PartnersTab {
  return allowed.includes(raw as PartnersTab) ? (raw as PartnersTab) : 'threads';
}

function PartnersInner() {
  const { admin } = useAdmin();
  const platformView = isTeam(admin?.role);
  // 平台只读监管无「发起」入口，目录 tab 隐藏（深链 ?tab=directory 也回落 threads）
  const allowedTabs: PartnersTab[] = platformView ? ['threads'] : ['threads', 'directory'];

  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<PartnersTab>(() => parseTab(params.get('tab'), allowedTabs));

  // URL → tab 回同步（前进后退/深链切换时面板跟随 URL）
  const urlTab = parseTab(params.get('tab'), allowedTabs);
  useEffect(() => {
    setTab((cur) => (cur === urlTab ? cur : urlTab));
  }, [urlTab]);

  const switchTab = (key: string) => {
    const next = parseTab(key, allowedTabs);
    setTab(next);
    router.replace(`/partners?tab=${next}`);
  };

  const title = admin?.role
    ? navForRole(admin.role).find((e) => e.href === '/partners')?.resolvedLabel ?? '合作洽谈'
    : '合作洽谈';
  const sub = platformView
    ? '广告商 × 学校全部洽谈的只读监管视图'
    : isSponsor(admin?.role)
      ? '浏览高校目录、与学生会洽谈合作；同一学校只保留一条线程'
      : '浏览他校广告商目录、发起跨校合作洽谈；同一广告商只保留一条线程';

  return (
    <>
      <PageHeader caption="PARTNERS" title={title} sub={sub} />

      {!platformView && <Tabs items={TAB_ITEMS} value={tab} onChange={switchTab} />}

      {tab === 'directory' && !platformView ? <DirectoryPanel /> : <ThreadListPanel />}
    </>
  );
}

export default function PartnersPage() {
  // useSearchParams 页面必须包 Suspense（Next 14 硬要求）
  return (
    <Suspense fallback={null}>
      <PartnersInner />
    </Suspense>
  );
}
