'use client';

/**
 * /events — 活动管理（SUPER/TEAM 全量；学生会本校，服务端过滤）。
 * 薄壳：常驻核销条 + 活动表格 + 发布/购票名单弹窗接线，业务都在 components/events/*。
 */
import { CalendarDays } from 'lucide-react';
import { listEvents } from '@/lib/api/events';
import type { AdminEvent } from '@/lib/types';
import { isTeam } from '@/lib/auth';
import { useAdmin } from '@/lib/auth-context';
import { usePagedList } from '@/hooks/usePagedList';
import { useModal } from '@/hooks/useModal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Pager } from '@/components/ui/Pager';
import { CheckinPanel } from '@/components/events/CheckinPanel';
import { EventTable } from '@/components/events/EventTable';
import { EventFormModal } from '@/components/events/EventFormModal';
import { TicketsModal } from '@/components/events/TicketsModal';

export default function EventsPage() {
  const { admin } = useAdmin();
  const list = usePagedList<AdminEvent, Record<string, never>>({
    fetcher: ({ page, limit }) => listEvents({ page, limit }),
    initialFilters: {},
  });
  const create = useModal();
  const edit = useModal<AdminEvent>();
  const tickets = useModal<AdminEvent>();

  return (
    <>
      <PageHeader
        caption="Events"
        title="活动管理"
        sub={
          isTeam(admin?.role)
            ? '活动总览 · 售票 · 入场核销'
            : `${admin?.schoolName ?? '本校'} · 发布活动 · 售票 · 入场核销`
        }
        actions={
          // 活动学生会专属（SUPER 超管兜底）：TEAM 只看不发（后端 @Roles 同口径）
          admin?.role !== 'TEAM' ? (
            <Button variant="cta" size="sm" onClick={create.openEmpty}>
              <CalendarDays size={15} /> 发布活动
            </Button>
          ) : undefined
        }
      />

      <CheckinPanel onDone={() => void list.refresh()} />

      <Card flush>
        <EventTable
          items={list.items}
          loading={list.loading}
          error={list.error}
          onShowTickets={tickets.openWith}
          onEdit={edit.openWith}
          onChanged={() => void list.refresh()}
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />

      {create.open && <EventFormModal onClose={create.close} onDone={() => void list.refresh()} />}
      {edit.open && edit.data && (
        <EventFormModal event={edit.data} onClose={edit.close} onDone={() => void list.refresh()} />
      )}
      {tickets.open && tickets.data && <TicketsModal event={tickets.data} onClose={tickets.close} />}
    </>
  );
}
