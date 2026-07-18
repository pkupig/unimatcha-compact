'use client';

/**
 * /events — 活动管理（SUPER/TEAM/STUDENT_UNION；SPONSOR 由 RoleGate 拦截）
 * 列表：标题/学校/时间/票价/已售/状态 + 停售/恢复/取消 + 购票名单
 * 发布活动：Modal 表单（价格「元」输入转分；学生会不传 school 后端自动填本校，
 *          团队留空 = 全网），创建成功即同时生成广场活动帖
 * 入场核销：页面顶部输入票码回车 → POST /admin/events/checkin，成功/失败提示条
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarDays, ScanLine, Ticket, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  getAdminEvents,
  createAdminEvent,
  updateAdminEventStatus,
  getAdminEventTickets,
  checkinEventTicket,
  type AdminEvent,
  type AdminEventStatus,
  type AdminEventTicket,
  type AdminEventInput,
} from '@/lib/api';
import { isTeam } from '@/lib/auth';
import { formatDateTime, formatNumber, fenToYuan } from '@/lib/format';
import {
  PageHeader,
  DataTable,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  Money,
  RoleGate,
  useAdminInfo,
  type Column,
  type BadgeVariant,
} from '@/components/ui';

const LIMIT = 20;

/* ═══════════════════════════════════════════════════════════════
 * 标签映射 & 工具
 * ═══════════════════════════════════════════════════════════════ */

const EVENT_STATUS_LABELS: Record<string, string> = {
  published: '售票中',
  closed: '已停售',
  cancelled: '已取消',
};

const EVENT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  published: 'neon',
  closed: 'neutral',
  cancelled: 'pink',
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  valid: '有效',
  used: '已核销',
  cancelled: '已取消',
};

const TICKET_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  valid: 'neon',
  used: 'outline',
  cancelled: 'pink',
};

/** 列表响应归一化（契约为 {items,total,page,limit}，兜底裸数组） */
function normalizeList<T = any>(data: any): { items: T[]; total: number } {
  if (Array.isArray(data)) return { items: data, total: data.length };
  const items = data?.items || data?.list || [];
  return { items, total: data?.total ?? items.length };
}

/** datetime-local 值 → ISO 字符串；空/非法返回 undefined */
function localToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/30">
      <span className="text-xs text-on-surface-variant font-mono">
        第 {page} / {totalPages} 页 · 共 {total} 条
      </span>
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          上一页
        </button>
        <button
          className="btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 入场核销条（输票码回车 → checkin，成功/失败提示条）
 * ═══════════════════════════════════════════════════════════════ */

function CheckinBar({ onCheckedIn }: { onCheckedIn: () => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleCheckin = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error('请输入票码');
      return;
    }
    setLoading(true);
    try {
      const res = await checkinEventTicket(trimmed);
      const data = (res as any).data || {};
      const holder = data.holder || {};
      const holderName =
        holder?.profile?.nickname || holder?.nickname || holder?.email || '持票人';
      const eventTitle = data.event?.title || '活动';
      setResult({ ok: true, message: `核销成功：${eventTitle} · ${holderName}` });
      toast.success('核销成功');
      setCode('');
      onCheckedIn();
    } catch (err: any) {
      setResult({ ok: false, message: err?.message || '核销失败：票码无效' });
      toast.error(err?.message || '核销失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card py-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <ScanLine size={16} className="text-outline" />
          <span className="label mb-0">入场核销</span>
        </div>
        <Input
          className="font-mono flex-1"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) handleCheckin();
          }}
          placeholder="输入票码后回车核销"
          disabled={loading}
        />
        <button className="btn-primary btn-sm shrink-0" onClick={handleCheckin} disabled={loading}>
          {loading ? '核销中…' : '核销'}
        </button>
      </div>
      {result && (
        <div
          className={
            'flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-sm ' +
            (result.ok
              ? 'bg-surface-low text-on-surface'
              : 'bg-surface-low text-neon-pink')
          }
        >
          {result.ok ? (
            <CheckCircle2 size={15} className="text-ink shrink-0" />
          ) : (
            <AlertTriangle size={15} className="shrink-0" />
          )}
          <span className="truncate">{result.message}</span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 发布活动表单（Modal；价格「元」输入转分）
 * ═══════════════════════════════════════════════════════════════ */

const EMPTY_FORM = {
  title: '',
  content: '',
  images: '',
  school: '',
  venue: '',
  startAt: '',
  endAt: '',
  priceYuan: '0',
  capacity: '',
  board: 'campus_wall' as 'recommend' | 'campus_wall',
};

function CreateEventModal({
  open,
  team,
  onClose,
  onCreated,
}: {
  open: boolean;
  team: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleClose = () => {
    if (submitting) return;
    setForm({ ...EMPTY_FORM });
    onClose();
  };

  const handleSubmit = async () => {
    const title = form.title.trim();
    const content = form.content.trim();
    if (!title || !content) {
      toast.error('请填写活动标题和介绍');
      return;
    }
    const startAt = localToIso(form.startAt);
    if (!startAt) {
      toast.error('请选择开始时间');
      return;
    }
    const endAt = localToIso(form.endAt);
    if (form.endAt && !endAt) {
      toast.error('结束时间格式不正确');
      return;
    }
    if (endAt && endAt <= startAt) {
      toast.error('结束时间需晚于开始时间');
      return;
    }
    const priceYuan = Number(form.priceYuan || '0');
    if (isNaN(priceYuan) || priceYuan < 0) {
      toast.error('票价不正确');
      return;
    }
    const priceCents = Math.round(priceYuan * 100);
    let capacity: number | undefined;
    if (form.capacity.trim()) {
      capacity = parseInt(form.capacity, 10);
      if (isNaN(capacity) || capacity <= 0) {
        toast.error('名额需为正整数');
        return;
      }
    }
    const images = form.images
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const body: AdminEventInput = {
      title,
      content,
      startAt,
      priceCents,
      board: form.board,
      ...(images.length ? { images } : {}),
      ...(team && form.school.trim() ? { school: form.school.trim() } : {}),
      ...(form.venue.trim() ? { venue: form.venue.trim() } : {}),
      ...(endAt ? { endAt } : {}),
      ...(capacity !== undefined ? { capacity } : {}),
    };

    setSubmitting(true);
    try {
      await createAdminEvent(body);
      toast.success('活动已发布，广场活动帖已同步生成');
      setForm({ ...EMPTY_FORM });
      onClose();
      onCreated();
    } catch (err: any) {
      toast.error(err?.message || '发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      caption="NEW EVENT"
      title="发布活动"
      widthClassName="max-w-2xl"
      footer={
        <>
          <button className="btn-secondary btn-sm" onClick={handleClose} disabled={submitting}>
            取消
          </button>
          <button className="btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '发布中…' : '确认发布'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="活动标题" required>
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="例如：周末桌游之夜"
          />
        </Field>
        <Field label="活动介绍" required>
          <Textarea
            rows={4}
            value={form.content}
            onChange={(e) => set('content', e.target.value)}
            placeholder="活动内容、流程、注意事项…"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {team && (
            <Field label="学校" hint="留空 = 全网可见">
              <Input
                value={form.school}
                onChange={(e) => set('school', e.target.value)}
                placeholder="学校名，如 University of Warwick"
              />
            </Field>
          )}
          <Field label="活动场地">
            <Input
              value={form.venue}
              onChange={(e) => set('venue', e.target.value)}
              placeholder="例如：学生活动中心 201"
            />
          </Field>
          <Field label="开始时间" required>
            <Input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => set('startAt', e.target.value)}
            />
          </Field>
          <Field label="结束时间">
            <Input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => set('endAt', e.target.value)}
            />
          </Field>
          <Field label="票价（元）" hint="0 = 免费">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.priceYuan}
              onChange={(e) => set('priceYuan', e.target.value)}
            />
          </Field>
          <Field label="名额" hint="留空 = 不限">
            <Input
              type="number"
              min={1}
              step={1}
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)}
              placeholder="不限"
            />
          </Field>
          <Field label="发帖板块" hint="创建成功即同时生成广场活动帖">
            <Select
              value={form.board}
              onChange={(e) => set('board', e.target.value as 'recommend' | 'campus_wall')}
            >
              <option value="campus_wall">校园墙</option>
              <option value="recommend">推荐流</option>
            </Select>
          </Field>
        </div>
        <Field label="图片 URL" hint="选填，每行一条">
          <Textarea
            rows={2}
            value={form.images}
            onChange={(e) => set('images', e.target.value)}
            placeholder={'https://…\nhttps://…'}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 购票名单（Modal，GET /admin/events/:id/tickets）
 * ═══════════════════════════════════════════════════════════════ */

function TicketsModal({ event, onClose }: { event: AdminEvent | null; onClose: () => void }) {
  const [tickets, setTickets] = useState<AdminEventTicket[]>([]);
  const [summary, setSummary] = useState<{ ticketsSold?: number; capacity?: number | null }>({});
  const [loading, setLoading] = useState(false);

  const eventId = event?.id;
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setTickets([]);
    getAdminEventTickets(eventId)
      .then((res) => {
        if (cancelled) return;
        const data = (res as any).data || {};
        setTickets(data.tickets || []);
        setSummary(data.event || {});
      })
      .catch((err: any) => {
        if (!cancelled) toast.error(err?.message || '加载购票名单失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const columns: Column<AdminEventTicket>[] = [
    {
      key: 'code',
      title: '票码',
      render: (t) => <span className="font-mono text-xs whitespace-nowrap">{t.code}</span>,
    },
    {
      key: 'user',
      title: '购票用户',
      render: (t) => (
        <div>
          <p className="text-sm text-on-surface">{t.user?.profile?.nickname || '-'}</p>
          {t.user?.email && (
            <p className="font-mono text-[10px] text-outline truncate max-w-[160px]">
              {t.user.email}
            </p>
          )}
          {t.user?.profile?.school && (
            <p className="text-[10px] text-outline truncate max-w-[160px]">
              {t.user.profile.school}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'pricePaidCents',
      title: '实付',
      align: 'right',
      render: (t) =>
        t.pricePaidCents > 0 ? (
          <Money cents={t.pricePaidCents} />
        ) : (
          <span className="text-on-surface-variant text-sm">免费</span>
        ),
    },
    {
      key: 'status',
      title: '状态',
      render: (t) => (
        <Badge variant={TICKET_STATUS_VARIANTS[t.status] ?? 'neutral'}>
          {TICKET_STATUS_LABELS[t.status] ?? t.status}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      title: '购票时间',
      render: (t) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDateTime(t.createdAt)}
        </span>
      ),
    },
    {
      key: 'usedAt',
      title: '核销时间',
      render: (t) =>
        t.usedAt ? (
          <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
            {formatDateTime(t.usedAt)}
          </span>
        ) : (
          <span className="text-outline">-</span>
        ),
    },
  ];

  return (
    <Modal
      open={!!event}
      onClose={onClose}
      caption="TICKETS"
      title={event ? `购票名单 · ${event.title}` : '购票名单'}
      widthClassName="max-w-3xl"
    >
      <div className="space-y-4">
        <p className="text-sm text-on-surface-variant">
          已售{' '}
          <span className="font-mono text-on-surface">
            {formatNumber(summary.ticketsSold ?? event?.ticketsSold)}
          </span>
          {(summary.capacity ?? event?.capacity) != null && (
            <>
              {' '}
              / <span className="font-mono">{formatNumber(summary.capacity ?? event?.capacity)}</span>
            </>
          )}{' '}
          张
        </p>
        <div className="border border-outline-variant/30 rounded-lg overflow-hidden">
          <DataTable<AdminEventTicket>
            columns={columns}
            data={tickets}
            loading={loading}
            empty={<EmptyState icon={Ticket} title="暂无购票记录" />}
          />
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 页面主体
 * ═══════════════════════════════════════════════════════════════ */

function EventsInner() {
  const me = useAdminInfo();
  const team = isTeam(me?.role);

  const [items, setItems] = useState<AdminEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [ticketsEvent, setTicketsEvent] = useState<AdminEvent | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminEvent | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current;
    setLoading(true);
    try {
      const res = await getAdminEvents({ page, limit: LIMIT });
      if (reqId !== reqRef.current) return;
      const { items, total } = normalizeList<AdminEvent>((res as any).data);
      setItems(items);
      setTotal(total);
    } catch (err: any) {
      if (reqId !== reqRef.current) return;
      toast.error(err?.message || '加载活动列表失败');
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  /** 停售/恢复（行内直接切换） */
  const handleStatus = async (ev: AdminEvent, status: AdminEventStatus) => {
    setStatusUpdatingId(ev.id);
    try {
      await updateAdminEventStatus(ev.id, status);
      toast.success(status === 'closed' ? '活动已停售' : '活动已恢复售票');
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  /** 取消活动（不可逆，走确认弹窗） */
  const handleCancel = async () => {
    if (!cancelTarget) return;
    setSubmitting(true);
    try {
      await updateAdminEventStatus(cancelTarget.id, 'cancelled');
      toast.success('活动已取消');
      setCancelTarget(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<AdminEvent>[] = [
    {
      key: 'title',
      title: '活动',
      render: (ev) => (
        <div className="max-w-[220px]">
          <p className="font-bold text-on-surface truncate">{ev.title}</p>
          {ev.venue && <p className="text-xs text-on-surface-variant truncate">{ev.venue}</p>}
        </div>
      ),
    },
    {
      key: 'school',
      title: '学校',
      render: (ev) => (
        <span className="text-sm whitespace-nowrap">
          {ev.school || <span className="text-on-surface-variant">全网</span>}
        </span>
      ),
    },
    {
      key: 'time',
      title: '时间',
      render: (ev) => (
        <div className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          <p>{formatDateTime(ev.startAt)}</p>
          {ev.endAt && <p className="text-outline">至 {formatDateTime(ev.endAt)}</p>}
        </div>
      ),
    },
    {
      key: 'price',
      title: '票价',
      align: 'right',
      render: (ev) =>
        ev.priceCents > 0 ? (
          <Money cents={ev.priceCents} />
        ) : (
          <Badge variant="outline">免费</Badge>
        ),
    },
    {
      key: 'sold',
      title: '已售',
      align: 'right',
      render: (ev) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {formatNumber(ev.ticketsSold)}
          {ev.capacity != null && (
            <span className="text-outline"> / {formatNumber(ev.capacity)}</span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (ev) => (
        <Badge variant={EVENT_STATUS_VARIANTS[ev.status] ?? 'neutral'}>
          {EVENT_STATUS_LABELS[ev.status] ?? ev.status}
        </Badge>
      ),
    },
    {
      key: 'creator',
      title: '创建者',
      render: (ev) => (
        <div className="max-w-[140px]">
          <p className="text-sm text-on-surface truncate">{ev.createdByAdmin?.name || '-'}</p>
          {ev.createdByAdmin?.organizationName && (
            <p className="text-[10px] text-outline truncate">
              {ev.createdByAdmin.organizationName}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (ev) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <button
            className="btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setTicketsEvent(ev);
            }}
          >
            购票名单
          </button>
          {ev.status === 'published' && (
            <button
              className="btn-secondary btn-sm"
              disabled={statusUpdatingId === ev.id}
              onClick={(e) => {
                e.stopPropagation();
                handleStatus(ev, 'closed');
              }}
            >
              {statusUpdatingId === ev.id ? '处理中…' : '停售'}
            </button>
          )}
          {ev.status === 'closed' && (
            <button
              className="btn-primary btn-sm"
              disabled={statusUpdatingId === ev.id}
              onClick={(e) => {
                e.stopPropagation();
                handleStatus(ev, 'published');
              }}
            >
              {statusUpdatingId === ev.id ? '处理中…' : '恢复'}
            </button>
          )}
          {ev.status !== 'cancelled' && (
            <button
              className="btn-danger btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setCancelTarget(ev);
              }}
            >
              取消
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        caption="EVENTS"
        title="活动管理"
        sub={
          team
            ? '发布活动 · 售票 · 入场核销'
            : `${me?.schoolName ?? '本校'} · 发布活动 · 售票 · 入场核销`
        }
        actions={
          <button className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <CalendarDays size={15} />
            发布活动
          </button>
        }
      />

      <CheckinBar onCheckedIn={load} />

      <div className="card p-0 overflow-hidden">
        <DataTable<AdminEvent>
          columns={columns}
          data={items}
          loading={loading}
          empty={
            <EmptyState
              icon={CalendarDays}
              title="暂无活动"
              sub="点击右上角「发布活动」创建第一个活动。"
            />
          }
        />
        <Pager page={page} total={total} onPage={setPage} />
      </div>

      <CreateEventModal
        open={createOpen}
        team={team}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setPage(1);
          load();
        }}
      />

      <TicketsModal event={ticketsEvent} onClose={() => setTicketsEvent(null)} />

      <ConfirmDialog
        open={!!cancelTarget}
        title="取消活动"
        message={
          cancelTarget ? (
            <>
              确认取消「{cancelTarget.title}」？取消后停止售票，已售{' '}
              {formatNumber(cancelTarget.ticketsSold)} 张（{fenToYuan(
                cancelTarget.priceCents * cancelTarget.ticketsSold,
              )}）。此操作不可恢复。
            </>
          ) : null
        }
        confirmText="确认取消"
        danger
        loading={submitting}
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}

export default function EventsPage() {
  return (
    <RoleGate allow={['SUPER', 'TEAM', 'STUDENT_UNION']}>
      <EventsInner />
    </RoleGate>
  );
}
