'use client';

/**
 * 生成邀请码弹窗（POST /admin/sponsor-invites）：schoolId 不传——后端恒绑定
 * 当前学生会本校。两段式：表单 → 成功后就地展示完整注册链接当场复制交付
 * （码非一次性凭据，列表里随时可再复制，无「仅此一次」问题）。
 */
import { useState, type FormEvent } from 'react';
import { Link2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/form';
import { toastError } from '@/lib/toast';
import { copyText } from '@/lib/clipboard';
import { createInvite } from '@/lib/api/accounts';
import type { SponsorInvite } from '@/lib/types';

/**
 * 广告商自注册链接拼装（与 /register 页的 ?code= 读取约定配对）。
 * 列表「复制链接」与创建成功页共用同一口径，放本文件避免 Panel↔Modal 循环依赖。
 */
export function inviteRegisterLink(code: string): string {
  return `${window.location.origin}/register?code=${code}`;
}

const DAY_MS = 86_400_000;

export function CreateInviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState(''); // 空串 = 不限次
  const [expireDays, setExpireDays] = useState('30'); // 空串 = 永久有效
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<SponsorInvite | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // 校验先行（btnBusy 先行卡死按钮的老教训）
    const uses = maxUses.trim() === '' ? undefined : Number(maxUses);
    if (uses !== undefined && (!Number.isInteger(uses) || uses < 1)) {
      toastError(new Error(), '限用次数须为不小于 1 的整数');
      return;
    }
    const days = expireDays.trim() === '' ? undefined : Number(expireDays);
    if (days !== undefined && (!Number.isInteger(days) || days < 1)) {
      toastError(new Error(), '有效期天数须为不小于 1 的整数');
      return;
    }
    setSaving(true);
    try {
      const invite = await createInvite({
        note: note.trim() || undefined,
        maxUses: uses,
        expiresAt:
          days === undefined ? undefined : new Date(Date.now() + days * DAY_MS).toISOString(),
      });
      setCreated(invite);
      onDone(); // 创建即刷新列表——无论用户以何种方式关闭弹窗都不丢新码
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    const link = inviteRegisterLink(created.code);
    return (
      <Modal title="邀请码已生成" caption="INVITE READY" onClose={onClose}>
        <div className="space-y-4 pb-4">
          <p className="text-sm text-on-surface-variant">
            把下方链接发给广告商，对方打开即可自注册开通投放账号（恒绑定本校
            「{created.school.name}」，按自拉档分成）。
          </p>
          <div className="space-y-3 rounded-lg bg-surface-low p-4">
            <div>
              <p className="text-[11px] text-on-surface-variant">邀请码</p>
              <p className="font-mono text-sm font-bold text-on-surface">{created.code}</p>
            </div>
            <div className="flex items-center justify-between gap-3 bg-white rounded-lg border border-outline-variant/40 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] text-on-surface-variant">邀请链接</p>
                <p className="font-mono text-xs text-on-surface break-all select-all">{link}</p>
              </div>
              <button
                type="button"
                className="btn-secondary btn-sm shrink-0"
                onClick={() => void copyText(link, '邀请链接已复制')}
              >
                <Link2 size={13} />
                复制链接
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              完成
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="生成邀请码" caption="NEW INVITE" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-4 pb-4">
        <Field label="备注" hint="仅后台可见，用于标记用途（如「五一集市招商」）">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={64}
            placeholder="选填"
          />
        </Field>
        <Field label="限用次数" hint="留空=不限次；定向邀请单个广告商可设 1">
          <Input
            type="number"
            min={1}
            step={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="不限"
          />
        </Field>
        <Field label="有效期（天）" hint="留空=永久有效；到期后广告商无法再经此码注册">
          <Input
            type="number"
            min={1}
            step={1}
            value={expireDays}
            onChange={(e) => setExpireDays(e.target.value)}
            placeholder="永久"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            生成
          </Button>
        </div>
      </form>
    </Modal>
  );
}
