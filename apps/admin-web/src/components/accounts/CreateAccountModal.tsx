'use client';

/**
 * 创建后管账号弹窗（ACC-5），字段按 kind 条件渲染——
 * union：绑定学校必选；sponsor：组织名必填 + 来源选择（学生会视角来源被服务端
 * 锁定为本校，不渲染该项）；admin：TEAM/SUPER 二选一（SUPER 专属入口）。
 * 后端创建接口不回传密码（密码由创建者当场设定），故此流程不走 CredentialCard。
 */
import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/form';
import { toastError } from '@/lib/toast';
import { listSchools } from '@/lib/api/schools';
import { createAdminUser } from '@/lib/api/accounts';
import { ADMIN_ROLE } from '@/lib/labels';
import type { AccountsListTab, AdminRole, CreateAdminUserData, School } from '@/lib/types';

// kind 限账号三 tab（AccountsListTab）——邀请码 tab 走 CreateInviteModal，与本弹窗无关
const TITLES: Record<AccountsListTab, string> = {
  union: '创建学生会账号',
  sponsor: '创建商家账号',
  admin: '创建管理员账号',
};

const EMAIL_PLACEHOLDERS: Record<AccountsListTab, string> = {
  union: 'union.warwick@unimatcha.ai',
  sponsor: 'sponsor@company.com',
  admin: 'team@unimatcha.ai',
};

export function CreateAccountModal({
  kind,
  unionScoped = false,
  onClose,
  onDone,
}: {
  kind: AccountsListTab;
  /** 学生会视角创建本校自拉商家：来源由服务端强制为本校 */
  unionScoped?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    email: '',
    name: '',
    password: '',
    schoolId: '',
    organizationName: '',
    sourcedBySchoolId: '',
    contactName: '',
    contactPhone: '',
    role: 'TEAM' as AdminRole,
  });
  const [saving, setSaving] = useState(false);

  // 学校下拉仅两处需要：学生会绑定校 / 平台视角商家来源；按需拉取避免无谓请求
  const needSchools = kind === 'union' || (kind === 'sponsor' && !unionScoped);
  const [schools, setSchools] = useState<School[]>([]);
  useEffect(() => {
    if (!needSchools) return;
    listSchools({ limit: 100 })
      .then((res) => setSchools(res.items))
      .catch((e) => toastError(e, '学校列表加载失败'));
  }, [needSchools]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // 校验先行（旧版 btnBusy 先行导致按钮卡死的教训）
    if (form.password.trim().length < 8) {
      toastError(new Error(), '密码至少 8 位');
      return;
    }
    if (kind === 'union' && !form.schoolId) {
      toastError(new Error(), '学生会账号必须绑定学校');
      return;
    }
    if (kind === 'sponsor' && !form.organizationName.trim()) {
      toastError(new Error(), '请填写组织名');
      return;
    }
    const payload: CreateAdminUserData = {
      email: form.email.trim(),
      name: form.name.trim(),
      password: form.password.trim(),
    };
    if (kind === 'union') {
      payload.role = 'STUDENT_UNION';
      payload.schoolId = form.schoolId;
    } else if (kind === 'sponsor') {
      // 学生会视角 role/sourcedBySchoolId 由服务端强制，这里只传平台视角的显式来源
      payload.role = 'SPONSOR';
      payload.organizationName = form.organizationName.trim();
      if (!unionScoped && form.sourcedBySchoolId) payload.sourcedBySchoolId = form.sourcedBySchoolId;
      if (form.contactName.trim()) payload.contactName = form.contactName.trim();
      if (form.contactPhone.trim()) payload.contactPhone = form.contactPhone.trim();
    } else {
      payload.role = form.role;
    }
    setSaving(true);
    try {
      await createAdminUser(payload);
      toast.success('账号已创建');
      onDone();
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={unionScoped ? '新建赞助商账号' : TITLES[kind]}
      caption="NEW ACCOUNT"
      onClose={onClose}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4 pb-4">
        {kind === 'sponsor' && (
          <Field label="组织名" required>
            <Input
              value={form.organizationName}
              onChange={(e) => set('organizationName', e.target.value)}
              placeholder="例如 一点点奶茶·考文垂"
              required
            />
          </Field>
        )}
        <Field label={kind === 'sponsor' ? '账号名称' : '名称'} required>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={
              kind === 'union'
                ? '例如 Warwick 学生会'
                : kind === 'sponsor'
                  ? '账号显示名'
                  : '例如 运营团队-小李'
            }
            required
          />
        </Field>
        <Field label="登录邮箱" required>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder={EMAIL_PLACEHOLDERS[kind]}
            required
          />
        </Field>
        <Field label="初始密码" required hint="至少 8 位；交付对方后建议其自行修改">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            minLength={8}
            required
          />
        </Field>

        {kind === 'union' && (
          <Field label="绑定学校" required hint="学生会账号仅能管理本校数据">
            <Select value={form.schoolId} onChange={(e) => set('schoolId', e.target.value)} required>
              <option value="">请选择学校</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {kind === 'sponsor' && !unionScoped && (
          <Field label="来源" hint="平台直签可多校投放；选择学校=该校学生会自拉，仅能投放来源学校">
            <Select
              value={form.sourcedBySchoolId}
              onChange={(e) => set('sourcedBySchoolId', e.target.value)}
            >
              <option value="">平台直签</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（学生会自拉）
                </option>
              ))}
            </Select>
          </Field>
        )}

        {kind === 'sponsor' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="联系人">
              <Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
            </Field>
            <Field label="联系电话">
              <Input
                className="font-mono"
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
              />
            </Field>
          </div>
        )}

        {kind === 'admin' && (
          <Field label="角色" required hint="超级管理员拥有全部权限（含账号管理与系统配置），请谨慎发放">
            <Select value={form.role} onChange={(e) => set('role', e.target.value as AdminRole)}>
              <option value="TEAM">{ADMIN_ROLE.labels.TEAM}</option>
              <option value="SUPER">{ADMIN_ROLE.labels.SUPER}</option>
            </Select>
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            创建
          </Button>
        </div>
      </form>
    </Modal>
  );
}
