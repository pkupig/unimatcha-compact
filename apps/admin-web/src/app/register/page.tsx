'use client';

/**
 * /register — 商家经学生会邀请码公开自注册页。
 * 与 /login 同层（(dashboard) 组外）：不进 permissions/Guard，无鉴权可达；
 * 表单三态（校验中 / 无效原因 / 有效邀请卡）由 RegisterSponsorForm 内部承载。
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { RegisterSponsorForm } from '@/components/register/RegisterSponsorForm';

/** 内层读 ?code=（useSearchParams 须包 Suspense，Next 14 硬要求） */
function RegisterInner() {
  const params = useSearchParams();
  const initialCode = params.get('code') ?? '';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="font-display font-extrabold tracking-wide text-2xl text-ink">
            UNIMATCHA
            <span className="text-[10px] align-super font-mono text-neon-dark ml-0.5">ADMIN</span>
          </p>
          <p className="caption mt-2">Sponsor Registration</p>
          <p className="text-sm text-on-surface-variant mt-3">
            凭学生会邀请码入驻，注册即可登录投放
          </p>
        </div>

        <RegisterSponsorForm initialCode={initialCode} />

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          已有账号？{' '}
          <Link href="/login" className="font-medium text-neon-dark hover:underline">
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}
