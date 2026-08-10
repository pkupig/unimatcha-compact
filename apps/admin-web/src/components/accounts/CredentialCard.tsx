'use client';

/**
 * 一次性凭据展示卡（跨域契约组件：accounts 创建流 / submissions 开通流共用）。
 * 密码只在接口响应里出现一次，关闭即不可再查——必须当场复制交付。
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, Copy } from 'lucide-react';

/** 剪贴板写入——clipboard API 优先，非安全上下文（http 内网）降级 execCommand */
async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* 权限被拒/非安全上下文，走降级路径 */
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (await copyText(value)) {
      setCopied(true);
      toast.success(`${label}已复制`);
      // 短暂展示「已复制」后还原，支持反复复制
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('复制失败，请手动选中复制');
    }
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
