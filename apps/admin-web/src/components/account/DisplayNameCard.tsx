'use client';

import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/form';
import { updateMyProfile } from '@/lib/api/auth';
import { useAdmin } from '@/lib/auth-context';
import { toastError } from '@/lib/toast';
import type { AdminInfo } from '@/lib/types';

/** ACT-2：显示名称自助修改；保存后 refresh() 重拉 /me，侧栏名字即时更新 */
export function DisplayNameCard({ admin }: { admin: AdminInfo }) {
  const { refresh } = useAdmin();
  const [name, setName] = useState(admin.name);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const unchanged = trimmed === admin.name;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || unchanged) return;
    setSaving(true);
    try {
      await updateMyProfile(admin.id, { name: trimmed });
      // 身份唯一真源是 /me：重拉而非本地拼装，侧栏与后续页面同步生效
      await refresh();
      toast.success('显示名称已更新');
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card caption="DISPLAY NAME" title="显示名称">
      <form onSubmit={submit} className="space-y-4">
        <Field label="显示名称" hint="展示在后台侧栏与操作记录中">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
        </Field>
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={saving}
            disabled={!trimmed || unchanged}
          >
            保存
          </Button>
        </div>
      </form>
    </Card>
  );
}
