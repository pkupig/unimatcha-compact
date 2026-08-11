'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { login } from '@/lib/api/auth';
import { setToken } from '@/lib/auth';
import { toastError } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/form';

const ROLE_HINTS = [
  { title: '平台团队', desc: '用户 / 内容 / 广告 / 财务的全平台运营' },
  { title: '学生会', desc: '本校用户、校园墙与活动，广告审核与收益提现' },
  { title: '广告商', desc: '广告投放与官方内容发布' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await login(email.trim(), password);
      // 仅存 token——身份以 /me 为唯一真源（AdminProvider 启动拉取）
      setToken(res.token);
      toast.success('欢迎回来');
      router.replace('/dashboard');
    } catch (err) {
      toastError(err, '登录失败，请稍后重试');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="font-display font-extrabold tracking-wide text-2xl text-ink">
            UNIMATCHA<span className="text-[10px] align-super font-mono text-neon-dark ml-0.5">ADMIN</span>
          </p>
          <p className="caption mt-2">Management Console</p>
        </div>

        <form className="card space-y-4" onSubmit={submit}>
          <Field label="邮箱 · Email" required>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@unimatcha.ai"
            />
          </Field>
          <Field label="密码 · Password" required>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" variant="cta" className="w-full" loading={busy}>
            登录
          </Button>
        </form>

        {/* 开放注册入口（与 /register 页「已有账号？登录」次级链接同款式） */}
        <p className="mt-4 text-center text-sm text-on-surface-variant">
          没有账号？{' '}
          <Link href="/register" className="font-medium text-neon-dark hover:underline">
            注册广告商 →
          </Link>
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2">
          {ROLE_HINTS.map((r) => (
            <div key={r.title} className="rounded-lg bg-white/60 border border-outline-variant/40 px-3 py-2.5">
              <p className="text-xs font-display font-bold text-on-surface">{r.title}</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
