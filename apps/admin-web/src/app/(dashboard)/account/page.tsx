'use client';

/**
 * 账号设置（全角色可达）：只读信息卡 + 显示名称自助修改 + 修改密码。
 */
import { PageHeader } from '@/components/ui/PageHeader';
import { useAdmin } from '@/lib/auth-context';
import { AccountInfoCard } from '@/components/account/AccountInfoCard';
import { DisplayNameCard } from '@/components/account/DisplayNameCard';
import { PasswordCard } from '@/components/account/PasswordCard';

export default function AccountPage() {
  const { admin } = useAdmin();
  // Guard 保证 authed 后才挂载；此判断仅做类型收窄
  if (!admin) return null;

  return (
    <>
      <PageHeader caption="Account" title="账号设置" sub={admin.email} />
      <AccountInfoCard admin={admin} />
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <DisplayNameCard admin={admin} />
        <PasswordCard adminId={admin.id} />
      </div>
    </>
  );
}
