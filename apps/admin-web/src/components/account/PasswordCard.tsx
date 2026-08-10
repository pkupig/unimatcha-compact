'use client';

import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/form';
import { updateMyProfile } from '@/lib/api/auth';
import { toastError } from '@/lib/toast';

/** ACT-3：修改密码（新密码 ≥8 位 + 二次确认；成功后建议重新登录） */
export function PasswordCard({ adminId }: { adminId: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('新密码至少 8 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateMyProfile(adminId, { password });
      setPassword('');
      setConfirm('');
      toast.success('密码已修改，建议重新登录');
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card caption="PASSWORD" title="修改密码">
      <form onSubmit={submit} className="space-y-4">
        <Field label="新密码" required error={error} hint="至少 8 位">
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="确认新密码" required>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={saving}
            disabled={!password || !confirm}
          >
            修改密码
          </Button>
        </div>
      </form>
    </Card>
  );
}
