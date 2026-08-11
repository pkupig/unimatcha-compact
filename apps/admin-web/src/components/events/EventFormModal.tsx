'use client';

/**
 * EVT-4 发布活动弹窗（创建成功即同时生成广场活动帖）。
 * - 学校字段仅团队显示（空=全网；学生会由服务端自动填本校）
 * - 票价「能量」输入（priceCents 数值 ≡ 能量数，0=免费；用户按格支付，1 格=100 能量）；名额空=不限（正整数）
 * - 板块默认推荐流：团队未指定学校时发校园墙会被后端 400，前端先拦
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { createEvent } from '@/lib/api/events';
import { listSchools } from '@/lib/api/schools';
import type { CreateEventInput, EventBoard } from '@/lib/types';
import { isTeam } from '@/lib/auth';
import { useAdmin } from '@/lib/auth-context';
import { toastError } from '@/lib/toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';

/** datetime-local 值 → ISO 串；空/非法返回 null */
function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
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
  // 默认推荐流：团队 + 校园墙 + 未选学校会被后端 400
  board: 'recommend' as EventBoard,
  images: '',
};

export function EventFormModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { admin } = useAdmin();
  const team = isTeam(admin?.role);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  // 团队学校输入的 datalist 联想（后端要求学校名必须已录入；拉取失败仍可手输）
  const [schoolNames, setSchoolNames] = useState<string[]>([]);

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!team) return;
    listSchools({ isActive: 'true', limit: 100 })
      .then((res) => setSchoolNames(res.items.map((s) => s.name)))
      .catch(() => undefined);
  }, [team]);

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
    const school = team ? form.school.trim() : '';
    if (form.board === 'campus_wall' && team && !school) {
      toast.error('校园墙活动帖必须指定学校（或改发推荐流）');
      return;
    }
    const images = form.images
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const body: CreateEventInput = {
      title,
      content,
      startAt,
      priceCents,
      board: form.board,
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
      title="发布活动"
      caption="NEW EVENT"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void submit()}>
            确认发布
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
          {team && (
            <Field label="学校" hint="留空 = 全网可见；须为已录入的学校名">
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
          <Field label="活动场地">
            <Input value={form.venue} onChange={(e) => set('venue', e.target.value)} placeholder="例如：学生活动中心 201" maxLength={100} />
          </Field>
          <Field label="开始时间" required>
            <Input type="datetime-local" value={form.startAt} onChange={(e) => set('startAt', e.target.value)} />
          </Field>
          <Field label="结束时间" hint="选填；需晚于开始时间">
            <Input type="datetime-local" value={form.endAt} onChange={(e) => set('endAt', e.target.value)} />
          </Field>
          <Field label="票价（能量）" hint="100 能量 = 1 格，用户按格支付；0 = 免费">
            <Input type="number" min={0} step={1} value={form.priceEnergy} onChange={(e) => set('priceEnergy', e.target.value)} />
          </Field>
          <Field label="名额" hint="留空 = 不限">
            <Input type="number" min={1} step={1} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} placeholder="不限" />
          </Field>
          <Field label="发帖板块" hint="创建成功即同时生成广场活动帖">
            <Select value={form.board} onChange={(e) => set('board', e.target.value as EventBoard)}>
              <option value="recommend">推荐流</option>
              <option value="campus_wall">校园墙</option>
            </Select>
          </Field>
        </div>
        <Field label="图片 URL" hint="选填，一行一个">
          <Textarea rows={2} value={form.images} onChange={(e) => set('images', e.target.value)} placeholder={'https://…\nhttps://…'} />
        </Field>
      </div>
    </Modal>
  );
}
