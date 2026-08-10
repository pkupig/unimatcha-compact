'use client';

/**
 * /moderation — 广场管理（MOD-1..8）：帖子管理 / 举报队列 / 投票审核 三 tab。
 * 团队全量「广场管理」；学生会「校园墙管理」（后端强制 scope 本校）。
 * tab 写 URL ?tab=，深链 DEEP_LINKS.moderationReported / moderationPolls 直落。
 */
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { PostsPanel } from '@/components/moderation/PostsPanel';
import { PollsPanel } from '@/components/moderation/PollsPanel';
import { isTeam } from '@/lib/auth';
import { useAdmin } from '@/lib/auth-context';

type TabKey = 'posts' | 'reported' | 'polls';

function ModerationInner() {
  const { admin } = useAdmin();
  const router = useRouter();
  const searchParams = useSearchParams();
  const team = isTeam(admin?.role);

  const raw = searchParams.get('tab');
  const tab: TabKey = raw === 'reported' || raw === 'polls' ? raw : 'posts';
  const setTab = (k: string) => {
    router.replace(k === 'posts' ? '/moderation' : `/moderation?tab=${k}`, { scroll: false });
  };

  // SUPER 无官方发帖权限（后端 canPublishOfficial），入口只给团队/学生会；商家从侧栏直达
  const canPublish = admin?.role === 'TEAM' || admin?.role === 'STUDENT_UNION';

  return (
    <>
      <PageHeader
        caption="MODERATION"
        title={team ? '广场管理' : '校园墙管理'}
        sub={team ? '帖子管理 · 举报队列 · 投票审核' : `${admin?.schoolName ?? '本校'} · 本校帖子与举报处理`}
        actions={
          canPublish ? (
            <Button variant="primary" size="sm" onClick={() => router.push('/square-post')}>
              <Send size={14} /> 发官方帖
            </Button>
          ) : undefined
        }
      />
      <Tabs
        items={[
          { key: 'posts', label: '帖子管理' },
          { key: 'reported', label: '举报队列' },
          { key: 'polls', label: '投票审核' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {/* key 区分两个 PostsPanel 实例，切 tab 重挂重置筛选 */}
      {tab === 'posts' && <PostsPanel key="posts" team={team} />}
      {tab === 'reported' && <PostsPanel key="reported" reported team={team} />}
      {tab === 'polls' && <PollsPanel team={team} />}
    </>
  );
}

export default function ModerationPage() {
  // useSearchParams 要求 Suspense 边界（Next 14）
  return (
    <Suspense fallback={null}>
      <ModerationInner />
    </Suspense>
  );
}
