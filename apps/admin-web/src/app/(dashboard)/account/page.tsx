'use client';

/**
 * /account — 账户（SPONSOR 导航入口，任意角色可用）
 * 账户信息卡：组织/联系人/电话/来源 只读（后端仅允许非 SUPER 自编辑 name/password）
 * 基本资料卡：显示名称修改
 * 修改密码卡：新密码 + 确认（后端 PUT /admin/admin-users/:id 自编辑无需原密码，reconcile 阶段核对）
 */

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UserRound, KeyRound } from 'lucide-react';
import { updateAdminUser } from '@/lib/api';
import { getAdminInfo, isSponsor, ROLE_LABELS } from '@/lib/auth';
import {
  PageHeader,
  Card,
  Badge,
  Field,
  Input,
  useAdminInfo,
} from '@/components/ui';

/** 只读信息行 */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm py-2.5 border-b border-outline-variant/20 last:border-b-0">
      <span className="text-on-surface-variant shrink-0">{label}</span>
      <span className="font-medium text-on-surface text-right truncate">{value ?? '-'}</span>
    </div>
  );
}

export default function AccountPage() {
  const admin = useAdminInfo();

  // 基本资料
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // 修改密码
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (admin) setName(admin.name || '');
  }, [admin]);

  if (!admin) return null;

  const extra = admin as any; // contactName/contactPhone/sourcedBySchoolName 未在 AdminInfo 声明，后端冗余返回时展示
  const sourceLabel = isSponsor(admin.role)
    ? admin.sourcedBySchoolId
      ? extra.sourcedBySchoolName || '学生会自拉'
      : '平台直签'
    : null;

  const handleSaveName = async () => {
    const next = name.trim();
    if (!next) {
      toast.error('请输入显示名称');
      return;
    }
    setSavingName(true);
    try {
      await updateAdminUser(admin.id, { name: next });
      // 同步本地缓存，让侧边栏立即生效
      const cached = getAdminInfo();
      if (cached) {
        localStorage.setItem('admin_info', JSON.stringify({ ...cached, name: next }));
      }
      toast.success('名称已更新');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('新密码至少 8 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的密码不一致');
      return;
    }
    setSavingPassword(true);
    try {
      await updateAdminUser(admin.id, { password: newPassword });
      toast.success('密码已更新，下次登录请使用新密码');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err?.message || '修改失败');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader caption="ACCOUNT" title="账户" sub="账户信息与登录安全" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* 账户信息（只读） */}
        <Card caption="PROFILE" title="账户信息">
          <div>
            {isSponsor(admin.role) && (
              <InfoRow label="组织名" value={admin.organizationName || '-'} />
            )}
            <InfoRow label="登录邮箱" value={<span className="font-mono text-xs">{admin.email}</span>} />
            <InfoRow
              label="角色"
              value={<Badge variant="ink">{ROLE_LABELS[admin.role] ?? admin.role}</Badge>}
            />
            {admin.schoolName && <InfoRow label="所属学校" value={admin.schoolName} />}
            {extra.contactName && <InfoRow label="联系人" value={extra.contactName} />}
            {extra.contactPhone && (
              <InfoRow label="联系电话" value={<span className="font-mono">{extra.contactPhone}</span>} />
            )}
            {sourceLabel && (
              <InfoRow
                label="来源"
                value={
                  <Badge variant={admin.sourcedBySchoolId ? 'ink' : 'outline'}>{sourceLabel}</Badge>
                }
              />
            )}
          </div>
          <p className="text-xs text-outline mt-4">
            组织与联系方式由平台/学生会维护，如需变更请联系对接人员。
          </p>
        </Card>

        <div className="space-y-4">
          {/* 基本资料：显示名称 */}
          <Card caption="DISPLAY NAME" title="基本资料">
            <div className="space-y-4">
              <Field label="显示名称" required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="控制台中显示的名称"
                />
              </Field>
              <div className="flex justify-end">
                <button
                  className="btn-primary btn-sm"
                  onClick={handleSaveName}
                  disabled={savingName || !name.trim() || name.trim() === admin.name}
                >
                  <UserRound size={14} />
                  {savingName ? '保存中…' : '保存名称'}
                </button>
              </div>
            </div>
          </Card>

          {/* 修改密码 */}
          <Card caption="PASSWORD" title="修改密码">
            <div className="space-y-4">
              <Field label="新密码" required hint="至少 8 位，建议包含大小写字母与数字">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="输入新密码"
                />
              </Field>
              <Field label="确认新密码" required>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                />
              </Field>
              <div className="flex justify-end">
                <button
                  className="btn-primary btn-sm"
                  onClick={handleChangePassword}
                  disabled={savingPassword || !newPassword || !confirmPassword}
                >
                  <KeyRound size={14} />
                  {savingPassword ? '提交中…' : '更新密码'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
