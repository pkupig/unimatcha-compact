'use client';

/**
 * EVT-4 发布/编辑活动弹窗（创建成功即同时生成广场活动帖）。
 * - 活动学生会专属（SUPER 超管兜底）：SUPER 创建须指定学校，学生会由服务端自动填本校；编辑态学校不可改
 * - 票价「能量」输入（priceCents 数值 ≡ 能量数，0=免费；用户按格支付，1 格=100 能量）；名额空=不限（正整数）
 * - 活动帖恒发校园墙（产品规则 2026-08-13）：板块选择已移除，dto.board 后端已废弃
 * - 编辑走 PATCH :id/content 且只发生变字段：未动的票价不进 payload，避免误触「已售票禁止改价」的后端 400
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { createEvent, updateEventContent } from '@/lib/api/events';
import { listSchools } from '@/lib/api/schools';
import type { AdminEvent, CreateEventInput, UpdateEventContentInput } from '@/lib/types';
import { isTeam } from '@/lib/auth';
import { useAdmin } from '@/lib/auth-context';
import { toastError } from '@/lib/toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/form';

/** datetime-local 值 → ISO 串；空/非法返回 null */
function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** ISO 串 → datetime-local 值（本地时区、分钟精度）；空/非法返回 '' */
function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const EMPTY_FORM = {
  title: '',
  content: '',
  school: '',
  venue: '',
  startAt: '',
  endAt: '',
  priceEnergy: '0',
  capacity: '',
  images: '',
};

/** 编辑态预填（时间经 isoToLocal 归到分钟精度，diff 时同源比较，秒差不算改动） */
function formFromEvent(ev: AdminEvent): typeof EMPTY_FORM {
  return {
    title: ev.title,
    content: ev.content,
    school: ev.school ?? '',
    venue: ev.venue ?? '',
    startAt: isoToLocal(ev.startAt),
    endAt: isoToLocal(ev.endAt),
    priceEnergy: String(ev.priceCents),
    capacity: ev.capacity == null ? '' : String(ev.capacity),
    images: ev.images.join('\n'),
  };
}

export function EventFormModal({
  event,
  onClose,
  onDone,
}: {
  /** 有值 = 编辑既有活动（PATCH :id/content），否则创建 */
  event?: AdminEvent;
  onClose: () => void;
  onDone: () => void;
}) {
  const { admin } = useAdmin();
  const team = isTeam(admin?.role);
  const priceLocked = !!event && event.ticketsSold > 0;

  const [form, setForm] = useState(() => (event ? formFromEvent(event) : { ...EMPTY_FORM }));
  const [busy, setBusy] = useState(false);
  // 团队学校输入的 datalist 联想（后端要求学校名必须已录入；拉取失败仍可手输）
  const [schoolNames, setSchoolNames] = useState<string[]>([]);

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!team || event) return;
    listSchools({ isActive: 'true', limit: 100 })
      .then((res) => setSchoolNames(res.items.map((s) => s.name)))
      .catch(() => undefined);
  }, [team, event]);

  const submit = async () => {
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
    // priceCents 数值 ≡ 能量数（1 格 = 100 能量，用户按格支付），只收非负整数
    const priceRaw = form.priceEnergy.trim() || '0';
    if (!/^\d+$/.test(priceRaw)) {
      toast.error('票价需为非负整数能量值（0 = 免费）');
      return;
    }
    const priceCents = Number(priceRaw);
    let capacity: number | undefined;
    if (form.capacity.trim()) {
      if (!/^\d+$/.test(form.capacity.trim()) || Number(form.capacity) <= 0) {
        toast.error('名额需为正整数（留空 = 不限）');
        return;
      }
      capacity = Number(form.capacity);
    }
    const images = form.images
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (event) {
      const initial = formFromEvent(event);
      const venue = form.venue.trim();
      const payload: UpdateEventContentInput = {
        ...(title !== event.title ? { title } : {}),
        ...(content !== event.content ? { content } : {}),
        ...(images.join('\n') !== event.images.join('\n') ? { images } : {}),
        ...(venue !== (event.venue ?? '') ? { venue } : {}),
        ...(form.startAt !== initial.startAt ? { startAt } : {}),
        ...(endAt && form.endAt !== initial.endAt ? { endAt } : {}),
        ...(priceCents !== event.priceCents ? { priceCents } : {}),
        // 三态：清空输入 = 改为不限（null，后端已支持且已售票时放宽恒可）；数值变化才发；未变省略
        ...(capacity === undefined
          ? event.capacity != null
            ? { capacity: null }
            : {}
          : capacity !== event.capacity
            ? { capacity }
            : {}),
      };
      if (Object.keys(payload).length === 0) {
        toast('没有改动需要保存');
        return;
      }
      setBusy(true);
      try {
        await updateEventContent(event.id, payload);
        toast.success('活动修改已保存');
        onDone();
        onClose();
      } catch (e) {
        toastError(e);
      } finally {
        setBusy(false);
      }
      return;
    }

    const school = team ? form.school.trim() : '';
    // 活动帖恒发校园墙且必须带校：学生会由服务端自动填本校，SUPER 必须显式指定
    if (team && !school) {
      toast.error('活动必须指定学校（活动帖恒发该校校园墙）');
      return;
    }

    const body: CreateEventInput = {
      title,
      content,
      startAt,
      priceCents,
      ...(images.length ? { images } : {}),
      ...(school ? { school } : {}),
      ...(form.venue.trim() ? { venue: form.venue.trim() } : {}),
      ...(endAt ? { endAt } : {}),
      ...(capacity !== undefined ? { capacity } : {}),
    };

    setBusy(true);
    try {
      await createEvent(body);
      toast.success('活动已发布，广场活动帖已同步生成');
      onDone();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={event ? '编辑活动' : '发布活动'}
      caption={event ? 'EDIT EVENT' : 'NEW EVENT'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void submit()}>
            {event ? '保存修改' : '确认发布'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="活动标题" required>
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="例如：周末桌游之夜" maxLength={100} />
        </Field>
        <Field label="活动介绍" required>
          <Textarea rows={4} value={form.content} onChange={(e) => set('content', e.target.value)} placeholder="活动内容、流程、注意事项…" maxLength={2000} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {team && !event && (
            <Field label="学校" required hint="活动帖恒发该校校园墙；须为已录入的学校名">
              <Input
                list="event-school-options"
                value={form.school}
                onChange={(e) => set('school', e.target.value)}
                placeholder="学校名，如 University of Warwick"
              />
              <datalist id="event-school-options">
                {schoolNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
          )}
          {team && event && (
            <Field label="学校" hint="学校不可修改">
              <p className="text-sm text-on-surface py-2.5">{event.school ?? '全网'}</p>
            </Field>
          )}
          <Field label="活动场地">
            <Input value={form.venue} onChange={(e) => set('venue', e.target.value)} placeholder="例如：学生活动中心 201" maxLength={100} />
          </Field>
          <Field label="开始时间" required>
            <Input type="datetime-local" value={form.startAt} onChange={(e) => set('startAt', e.target.value)} />
          </Field>
          <Field label="结束时间" hint="选填；需晚于开始时间">
            <Input type="datetime-local" value={form.endAt} onChange={(e) => set('endAt', e.target.value)} />
          </Field>
          <Field
            label="票价（能量）"
            hint={priceLocked ? '已售出门票，票价锁定' : '100 能量 = 1 格，用户按格支付；0 = 免费'}
          >
            <Input
              type="number"
              min={0}
              step={1}
              value={form.priceEnergy}
              disabled={priceLocked}
              onChange={(e) => set('priceEnergy', e.target.value)}
            />
          </Field>
          <Field label="名额" hint={event ? '清空 = 改为不限；已售票后容量只可上调' : '留空 = 不限'}>
            <Input type="number" min={1} step={1} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} placeholder="不限" />
          </Field>
        </div>
        <Field label="图片 URL" hint="选填，一行一个">
          <Textarea rows={2} value={form.images} onChange={(e) => set('images', e.target.value)} placeholder={'https://…\nhttps://…'} />
        </Field>
      </div>
    </Modal>
  );
}
