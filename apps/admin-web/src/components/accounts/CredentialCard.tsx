'use client';

/**
 * 一次性凭据展示卡（跨域契约组件：accounts 创建流 / submissions 开通流共用）。
 * 密码只在接口响应里出现一次，关闭即不可再查——必须当场复制交付。
 */
import { useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { copyText } from '@/lib/clipboard';

function CredentialRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    // 成功/失败 toast 由共享 copyText 统一处理（失败极罕见：双路径全挂才会），
    // 这里只管按钮的「已复制」短暂反馈，2s 后还原支持反复复制
    await copyText(value, `${label}已复制`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-white rounded-lg border border-outline-variant/40 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] text-on-surface-variant">{label}</p>
        <p className="font-mono text-sm text-on-surface break-all select-all">{value}</p>
      </div>
      <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => void onCopy()}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  );
}

export function CredentialCard({ email, password }: { email: string; password: string }) {
  return (
    <div className="space-y-3 rounded-lg bg-surface-low p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={15} className="text-neon-pink shrink-0 mt-0.5" />
        <p className="text-xs text-on-surface-variant">
          <span className="font-bold text-on-surface">密码仅此一次展示</span>
          ，关闭后无法再次查看，请立即复制并妥善交付对方。
        </p>
      </div>
      <CredentialRow label="登录邮箱" value={email} />
      <CredentialRow label="初始密码" value={password} />
    </div>
  );
}
