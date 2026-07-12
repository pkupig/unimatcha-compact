'use client';

/**
 * 账号管理（SUPER/TEAM）— spec §5
 * Tabs：学生会 / 商家 / 管理员（SUPER 专属）。
 * 学生会：STUDENT_UNION 账号列表 + 创建（email/name/password/学校下拉）；
 * 商家：SPONSOR 账号（组织名/来源：平台直签 or 学校名/联系方式/状态）+ 创建；
 * 管理员：SUPER/TEAM 账号创建与停启用（最后一个 SUPER 由后端兜底保护）。
 * 停启用为 SUPER 专属（后端 isActive 变更仅 SUPER 可操作）。
 */

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Ban, CheckCircle } from 'lucide-react';
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  getSchools,
  type School,
} from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ROLE_LABELS, type AdminRole } from '@/lib/auth';
import {
  PageHeader,
  Card,
  DataTable,
  Badge,
  Modal,
  ConfirmDialog,
  Tabs,
  RoleGate,
  Field,
  Input,
  Select,
  useAdminInfo,
  type Column,
} from '@/components/ui';

const LIMIT = 20;

interface AccountRow {
  id: string;
  email: string;
  name: string;
  role: AdminRole | null;
  schoolId?: string | null;
  school?: { id: string; name: string } | null;
  organizationName?: string | null;
  sourcedBySchoolId?: string | null;
  sourcedBySchool?: { id: string; name: string } | null;
  contactName?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
  isSuperAdmin?: boolean;
  createdAt: string;
}

type TabKey = 'union' | 'sponsor' | 'admin';

export default function AccountsPage() {
  return (
    <RoleGate allow={['SUPER', 'TEAM']}>
      <AccountsContent />
    </RoleGate>
  );
}

function AccountsContent() {
  const me = useAdminInfo();
  const isSuper = me?.role === 'SUPER';

  const [tab, setTab] = useState<TabKey>('union');
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // 学校下拉（学生会绑定 / 商家来源）
  const [schools, setSchools] = useState<School[]>([]);

  // 创建 Modal
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
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

  // 停用确认
  const [disableTarget, setDisableTarget] = useState<AccountRow | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    loadSchools();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  const loadSchools = async () => {
    try {
      const res = await getSchools({ limit: 100 });
      setSchools(((res as any).data?.items as School[]) || []);
    } catch {
      // 下拉加载失败不阻断页面
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'admin') {
        // 后端 role 参数单值：SUPER + TEAM 两次拉取合并（管理员账号数量小）
        const [superRes, teamRes] = await Promise.all([
          listAdminUsers({ role: 'SUPER', page: 1, limit: 100 }),
          listAdminUsers({ role: 'TEAM', page: 1, limit: 100 }),
        ]);
        const merged = [
          ...(((superRes as any).data?.admins as AccountRow[]) || []),
          ...(((teamRes as any).data?.admins as AccountRow[]) || []),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRows(merged);
        setTotal(merged.length);
      } else {
        const res = await listAdminUsers({
          role: tab === 'union' ? 'STUDENT_UNION' : 'SPONSOR',
          page,
          limit: LIMIT,
        });
        const data = (res as any).data;
        setRows((data?.admins as AccountRow[]) || []);
        setTotal(data?.total || 0);
      }
    } catch (err: any) {
      toast.error(err?.message || '账号列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (key: string) => {
    setTab(key as TabKey);
    setPage(1);
  };

  const openCreate = () => {
    setForm({
      email: '',
      name: '',
      password: '',
      schoolId: '',
      organizationName: '',
      sourcedBySchoolId: '',
      contactName: '',
      contactPhone: '',
      role: 'TEAM',
    });
    setShowCreate(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.trim().length < 8) {
      toast.error('密码至少 8 位');
      return;
    }
    if (tab === 'union' && !form.schoolId) {
      toast.error('学生会账号必须绑定学校');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        email: form.email.trim(),
        name: form.name.trim(),
        password: form.password.trim(),
      };
      if (tab === 'union') {
        payload.role = 'STUDENT_UNION';
        payload.schoolId = form.schoolId;
      } else if (tab === 'sponsor') {
        payload.role = 'SPONSOR';
        if (form.organizationName.trim()) payload.organizationName = form.organizationName.trim();
        if (form.sourcedBySchoolId) payload.sourcedBySchoolId = form.sourcedBySchoolId;
        if (form.contactName.trim()) payload.contactName = form.contactName.trim();
        if (form.contactPhone.trim()) payload.contactPhone = form.contactPhone.trim();
      } else {
        payload.role = form.role;
      }
      await createAdminUser(payload);
      toast.success('账号已创建');
      setShowCreate(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!disableTarget) return;
    setToggling(true);
    try {
      await deleteAdminUser(disableTarget.id);
      toast.success('账号已停用');
      setDisableTarget(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setToggling(false);
    }
  };

  const handleEnable = async (row: AccountRow) => {
    try {
      await updateAdminUser(row.id, { isActive: true });
      toast.success('账号已启用');
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    }
  };

  /* ── 各 tab 列定义 ── */

  const statusCol: Column<AccountRow> = {
    key: 'isActive',
    title: '状态',
    render: (a) => (
      <Badge variant={a.isActive ? 'neon' : 'pink'}>{a.isActive ? '启用' : '停用'}</Badge>
    ),
  };
  const createdCol: Column<AccountRow> = {
    key: 'createdAt',
    title: '创建时间',
    render: (a) => <span className="font-mono text-xs">{formatDate(a.createdAt)}</span>,
  };
  const actionCol: Column<AccountRow> = {
    key: 'actions',
    title: '操作',
    align: 'right',
    render: (a) =>
      a.isActive ? (
        <button className="btn-danger btn-sm" onClick={() => setDisableTarget(a)}>
          <Ban size={13} />
          停用
        </button>
      ) : (
        <button className="btn-secondary btn-sm" onClick={() => handleEnable(a)}>
          <CheckCircle size={13} />
          启用
        </button>
      ),
  };

  const unionColumns: Column<AccountRow>[] = [
    {
      key: 'school',
      title: '学校',
      render: (a) => (
        <span className="font-semibold text-on-surface">{a.school?.name || '-'}</span>
      ),
    },
    { key: 'name', title: '名称', render: (a) => a.name },
    { key: 'email', title: 'Email', render: (a) => <span className="font-mono text-xs">{a.email}</span> },
    statusCol,
    createdCol,
    ...(isSuper ? [actionCol] : []),
  ];

  const sponsorColumns: Column<AccountRow>[] = [
    {
      key: 'organizationName',
      title: '组织名',
      render: (a) => (
        <span className="font-semibold text-on-surface">{a.organizationName || a.name}</span>
      ),
    },
    {
      key: 'source',
      title: '来源',
      render: (a) =>
        a.sourcedBySchool?.name ? (
          <Badge variant="ink">{a.sourcedBySchool.name}</Badge>
        ) : (
          <Badge variant="outline">平台直签</Badge>
        ),
    },
    {
      key: 'contact',
      title: '联系方式',
      render: (a) =>
        a.contactName || a.contactPhone ? (
          <span className="text-sm">
            {a.contactName || '-'}
            {a.contactPhone && (
              <span className="font-mono text-xs text-on-surface-variant ml-2">
                {a.contactPhone}
              </span>
            )}
          </span>
        ) : (
          '-'
        ),
    },
    { key: 'email', title: 'Email', render: (a) => <span className="font-mono text-xs">{a.email}</span> },
    statusCol,
    createdCol,
    ...(isSuper ? [actionCol] : []),
  ];

  const adminColumns: Column<AccountRow>[] = [
    { key: 'name', title: '名称', render: (a) => <span className="font-semibold text-on-surface">{a.name}</span> },
    { key: 'email', title: 'Email', render: (a) => <span className="font-mono text-xs">{a.email}</span> },
    {
      key: 'role',
      title: '角色',
      render: (a) => (
        <Badge variant={a.role === 'SUPER' ? 'ink' : 'outline'}>
          {a.role ? ROLE_LABELS[a.role] ?? a.role : '-'}
        </Badge>
      ),
    },
    statusCol,
    createdCol,
    ...(isSuper ? [actionCol] : []),
  ];

  const columns =
    tab === 'union' ? unionColumns : tab === 'sponsor' ? sponsorColumns : adminColumns;

  const tabItems = [
    { key: 'union', label: '学生会' },
    { key: 'sponsor', label: '商家' },
    ...(isSuper ? [{ key: 'admin', label: '管理员' }] : []),
  ];

  const createLabel =
    tab === 'union' ? '创建学生会账号' : tab === 'sponsor' ? '创建商家账号' : '创建管理员账号';

  const totalPages = tab === 'admin' ? 1 : Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <PageHeader
        caption="ACCOUNTS"
        title="账号管理"
        sub="学生会 / 商家 / 管理员账号的创建与停启用"
        actions={
          <button className="btn-cta" onClick={openCreate}>
            <Plus size={16} />
            {createLabel}
          </button>
        }
      />

      <Tabs items={tabItems} value={tab} onChange={switchTab} />

      <Card className="p-0 overflow-hidden" bodyClassName="">
        <DataTable<AccountRow> columns={columns} data={rows} loading={loading} />
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/30">
            <span className="text-sm text-on-surface-variant font-mono">
              {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="btn-secondary btn-sm"
              >
                上一页
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="btn-secondary btn-sm"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* 创建账号 Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        caption="NEW ACCOUNT"
        title={createLabel}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Email" required>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder={
                tab === 'union'
                  ? 'union.warwick@unimatcha.com'
                  : tab === 'sponsor'
                    ? 'sponsor@company.com'
                    : 'team@unimatcha.com'
              }
              required
            />
          </Field>
          <Field label="名称" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={
                tab === 'union' ? '例如 Warwick 学生会' : tab === 'sponsor' ? '例如 星巴克校园' : '例如 运营团队-小李'
              }
              required
            />
          </Field>
          <Field label="登录密码" required hint="至少 8 位">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
            />
          </Field>

          {tab === 'union' && (
            <Field label="绑定学校" required hint="学生会账号仅能管理本校数据">
              <Select
                value={form.schoolId}
                onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
                required
              >
                <option value="">请选择学校</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {tab === 'sponsor' && (
            <>
              <Field label="组织名">
                <Input
                  value={form.organizationName}
                  onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                  placeholder="例如 Starbucks UK"
                />
              </Field>
              <Field label="来源" hint="平台直签商家可多校投放；自拉商家仅能投放来源学校">
                <Select
                  value={form.sourcedBySchoolId}
                  onChange={(e) => setForm({ ...form, sourcedBySchoolId: e.target.value })}
                >
                  <option value="">平台直签</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}（学生会自拉）
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="联系人">
                  <Input
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  />
                </Field>
                <Field label="联系电话">
                  <Input
                    className="font-mono"
                    value={form.contactPhone}
                    onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  />
                </Field>
              </div>
            </>
          )}

          {tab === 'admin' && (
            <Field label="角色" required hint="SUPER 拥有全部权限（含账号管理与系统配置）">
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}
              >
                <option value="TEAM">{ROLE_LABELS.TEAM}</option>
                <option value="SUPER">{ROLE_LABELS.SUPER}</option>
              </Select>
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
              取消
            </button>
            <button type="submit" className="btn-cta" disabled={saving}>
              {saving ? '创建中…' : '创建'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 停用确认 */}
      <ConfirmDialog
        open={!!disableTarget}
        danger
        title="停用账号"
        message={`确认停用账号「${disableTarget?.name ?? ''}」？停用后该账号将无法登录（可随时重新启用）。`}
        confirmText="停用"
        loading={toggling}
        onConfirm={handleDisable}
        onCancel={() => setDisableTarget(null)}
      />
    </div>
  );
}
