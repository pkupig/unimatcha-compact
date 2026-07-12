'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminLogin } from '@/lib/api';
import { setToken } from '@/lib/auth';
import toast from 'react-hot-toast';

/** 三角色说明（登录页提示行） */
const ROLE_HINTS = [
  { zh: '平台团队', en: 'TEAM', desc: '全平台运营与审核' },
  { zh: '学生会', en: 'STUDENT UNION', desc: '本校运营与收益' },
  { zh: '商家', en: 'SPONSOR', desc: '广告投放管理' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await adminLogin(email, password);
      const { token, admin } = (res as any).data;
      setToken(token, admin);
      toast.success(`欢迎回来，${admin.name}`);
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err?.message || '登录失败，请检查邮箱与密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 relative overflow-hidden">
      {/* 装饰细线圆环 */}
      <div className="absolute -bottom-16 -left-16 w-72 h-72 border-[0.5px] border-outline-variant opacity-20 rounded-full pointer-events-none" />
      <div className="absolute top-1/4 -right-24 w-96 h-96 border-[0.5px] border-outline-variant opacity-10 rounded-full pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Wordmark */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2">
            <h1 className="font-display text-3xl font-extrabold tracking-tighter text-on-surface">
              UniMatcha
            </h1>
            <span className="w-2.5 h-2.5 rounded-full bg-neon" aria-hidden />
          </div>
          <p className="text-outline text-[11px] font-display font-bold tracking-[0.3em] uppercase mt-2">
            Admin Console
          </p>
        </div>

        <div className="card">
          <h2 className="font-display text-xl font-extrabold text-on-surface mb-1 tracking-tight">
            管理后台登录
          </h2>
          <p className="text-[11px] font-display font-bold tracking-[0.2em] uppercase text-on-surface-variant mb-6">
            Sign In
          </p>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="label">邮箱 · Email</label>
              <input
                type="email"
                className="input"
                placeholder="admin@unimatcha.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">密码 · Password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-cta w-full mt-2">
              {loading ? '登录中…' : '登 录'}
            </button>
          </form>
        </div>

        {/* 三角色提示行 */}
        <div className="grid grid-cols-3 gap-2 mt-6">
          {ROLE_HINTS.map((r) => (
            <div
              key={r.en}
              className="bg-white rounded-lg border border-outline-variant/40 px-3 py-2.5 text-center"
            >
              <p className="text-xs font-display font-bold text-on-surface">{r.zh}</p>
              <p className="text-[9px] font-display font-bold tracking-[0.15em] uppercase text-outline mt-0.5">
                {r.en}
              </p>
              <p className="text-[10px] text-on-surface-variant mt-1">{r.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-center mt-6 text-[10px] text-outline font-medium tracking-widest">
          © 2026 UniMatcha · All Rights Reserved
        </p>
      </div>
    </div>
  );
}
