'use client';

/**
 * 广告商自注册表单（公开页 /register 专用）：
 * 邀请码选填——空码=平台直签（不调预校验，展示中性说明卡，可直接提交）；
 * 填码走防抖预校验三态（校验中 / 无效原因 / 有效展示邀请学校），无效码禁提交。
 * 预校验接口恒 200 不抛错；网络错误不拦提交——最终校验以后端注册接口为准。
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { BadgeCheck, AlertCircle } from 'lucide-react';
import { getInviteInfo, registerSponsor, type InviteInfo, type InviteInvalidReason } from '@/lib/api/invites';
import { setToken } from '@/lib/auth';
import { toastError } from '@/lib/toast';
import { useDebounced } from '@/hooks/useDebounced';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Field, Input } from '@/components/ui/form';

const REASON_TEXT: Record<InviteInvalidReason, string> = {
  NOT_FOUND: '邀请码无效，请核对后重新输入',
  DISABLED: '该邀请码已停用，请联系学生会获取新码',
  EXPIRED: '该邀请码已过期，请联系学生会获取新码',
  EXHAUSTED: '该邀请码使用次数已用完，请联系学生会获取新码',
};

/** 邀请码三态提示卡（空码不查不提示） */
function InviteStateCard({ checking, info }: { checking: boolean; info: InviteInfo | null }) {
  if (checking) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-surface-low px-4 py-3 text-sm text-on-surface-variant">
        <Spinner size={14} /> 正在校验邀请码…
      </div>
    );
  }
  if (!info) return null;
  if (info.valid) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-neon/15 border border-neon/40 px-4 py-3 text-sm text-on-surface">
        <BadgeCheck size={16} className="text-neon-dark shrink-0" />
        <span>
          <span className="font-bold">{info.schoolName}</span> 学生会邀请你入驻
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-neon-pink/10 border border-neon-pink/30 px-4 py-3 text-sm text-on-surface">
      <AlertCircle size={16} className="text-neon-pink shrink-0" />
      <span>{info.reason ? REASON_TEXT[info.reason] : '邀请码无效'}</span>
    </div>
  );
}

export function RegisterSponsorForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 邀请码预校验：挂载/码变更防抖触发；单调计数丢弃过期响应（快速改码不闪旧结果）
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const debouncedCode = useDebounced(code.trim(), 400);
  const seqRef = useRef(0);
  useEffect(() => {
    const id = ++seqRef.current;
    if (!debouncedCode) {
      setInfo(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    getInviteInfo(debouncedCode)
      .then((r) => {
        if (id === seqRef.current) setInfo(r);
      })
      .catch(() => {
        // 预校验只是体验增强：网络错误不展示无效卡、不拦提交
        if (id === seqRef.current) setInfo(null);
      })
      .finally(() => {
        if (id === seqRef.current) setChecking(false);
      });
  }, [debouncedCode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwBad = password.length < 8 ? '密码至少 8 位' : null;
    const confirmBad = confirm !== password ? '两次输入的密码不一致' : null;
    setPwError(pwBad);
    setConfirmError(confirmBad);
    if (pwBad || confirmBad) return;
    setBusy(true);
    try {
      const res = await registerSponsor({
        // 空码不发字段（invites.ts 内省略）——无码 = 平台直签
        code: code.trim() || undefined,
        email: email.trim(),
        password,
        organizationName: orgName.trim(),
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim() || undefined,
      });
      // 同 /login：仅存 token，身份以 /me 为唯一真源（AdminProvider 启动拉取）
      setToken(res.token);
      toast.success('注册成功，欢迎入驻');
      router.replace('/dashboard');
    } catch (err) {
      toastError(err, '注册失败，请稍后重试');
      setBusy(false);
    }
  };

  // 明确无效的码直接禁提交；空码可提交（平台直签）；校验中/网络未知不拦（后端兜底）
  const blocked = !!info && !info.valid;

  return (
    <form className="card space-y-4" onSubmit={submit}>
      <Field label="邀请码 · Invite Code（选填）">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="INV-XXXXXXXXXXXX"
          className="font-mono"
        />
      </Field>
      {code.trim() ? (
        <InviteStateCard checking={checking} info={info} />
      ) : (
        <div className="rounded-lg bg-surface-low px-4 py-3 text-sm text-on-surface-variant leading-relaxed">
          不填邀请码将注册为平台直签广告商（广告由平台审核）；有学生会邀请码可填写，归属该校并享自拉分成通道。
        </div>
      )}
      <Field label="组织名称 · Organization" required>
        <Input
          required
          maxLength={80}
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="校门口奶茶店"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="联系人" required>
          <Input required maxLength={40} value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </Field>
        <Field label="联系电话">
          <Input maxLength={30} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </Field>
      </div>
      <Field label="邮箱 · Email" required>
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="sponsor@example.com"
        />
      </Field>
      <Field label="密码 · Password" required error={pwError} hint="至少 8 位">
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setPwError(null);
          }}
          placeholder="••••••••"
        />
      </Field>
      <Field label="确认密码 · Confirm" required error={confirmError}>
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setConfirmError(null);
          }}
          placeholder="••••••••"
        />
      </Field>
      <Button type="submit" variant="cta" className="w-full" loading={busy} disabled={blocked}>
        注册并入驻
      </Button>
    </form>
  );
}
