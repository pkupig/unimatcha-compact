'use client';

/**
 * 赞助商管理（STUDENT_UNION）— spec §5
 * 学生会创建/管理自己拉来的 SPONSOR 账号：
 * 后端强制 role=SPONSOR、sourcedBySchoolId=本校；列表仅返回本校来源的商家。
 * 自拉商家的广告仅可投放本校，收入按本校「自拉档」分成。
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Ban, CheckCircle } from 'lucide-react';
import { listAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser } from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  PageHeader,
  Card,
  DataTable,
  Badge,
  Modal,
  ConfirmDialog,
  RoleGate,
  Field,
  Input,
  useAdminInfo,
  type Column,
} from '@/components/ui';

const LIMIT = 20;

interface SponsorRow {
  id: string;
  email: string;
  name: string;
  organizationName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function SponsorsPage() {
  return (
    <RoleGate allow={['STUDENT_UNION']}>
      <SponsorsContent />
    </RoleGate>
  );
}

function SponsorsContent() {
  const me = useAdminInfo();
  const [rows, setRows] = useState<SponsorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    email: '',
    name: '',
    password: '',
    organizationName: '',
    contactName: '',
    contactPhone: '',
  });
  const [saving, setSaving] = useState(false);

  const [toggleTarget, setToggleTarget] = useState<SponsorRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 后端对 STUDENT_UNION 自动 scope：仅返回本校来源的 SPONSOR
      const res: any = await listAdminUsers({ role: 'SPONSOR', page, limit: LIMIT });
      const data = res.data;
      setRows(data.admins ?? data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      /* 拦截器已 toast */
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const submitCreate = async () => {
    if (!form.email || !form.name || !form.password || !form.organizationName) {
      toast.error('邮箱、名称、密码、组织名为必填');
      return;
    }
    if (form.password.length < 8) {
      toast.error('密码至少 8 位');
      return;
    }
    setSaving(true);
    try {
      await createAdminUser({ ...form, role: 'SPONSOR' });
      toast.success('赞助商账号已创建');
      setCreateOpen(false);
      setForm({ email: '', name: '', password: '', organizationName: '', contactName: '', contactPhone: '' });
      load();
    } catch {
      /* 拦截器已 toast */
    } finally {
      setSaving(false);
    }
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    try {
      if (toggleTarget.isActive) await deleteAdminUser(toggleTarget.id);
      else await updateAdminUser(toggleTarget.id, { isActive: true });
      toast.success(toggleTarget.isActive ? '已停用' : '已启用');
      setToggleTarget(null);
      load();
    } catch {
      setToggleTarget(null);
    }
  };

  const columns: Column<SponsorRow>[] = [
    {
      key: 'organizationName',
      title: '组织名',
      render: (r) => (
        <span className="font-display font-bold text-on-surface">{r.organizationName || r.name}</span>
      ),
    },
    { key: 'email', title: '登录邮箱', render: (r) => <span className="font-mono text-xs">{r.email}</span> },
    {
      key: 'contact',
      title: '联系方式',
      render: (r) =>
        r.contactName || r.contactPhone ? (
          <span>
            {r.contactName || '-'}
            {r.contactPhone ? <span className="font-mono text-xs text-on-surface-variant"> · {r.contactPhone}</span> : null}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'isActive',
      title: '状态',
      render: (r) => <Badge variant={r.isActive ? 'neon' : 'pink'}>{r.isActive ? '正常' : '已停用'}</Badge>,
    },
    {
      key: 'createdAt',
      title: '创建时间',
      render: (r) => <span className="font-mono text-xs">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (r) => (
        <button
          className={r.isActive ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
          onClick={(e) => {
            e.stopPropagation();
            setToggleTarget(r);
          }}
        >
          {r.isActive ? (
            <>
              <Ban size={14} />
              停用
            </>
          ) : (
            <>
              <CheckCircle size={14} />
              启用
            </>
          )}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Sponsors"
        title="赞助商管理"
        sub={`${me?.schoolName ?? '本校'} · 自拉赞助商账号（其广告仅可投放本校，按自拉档分成）`}
        actions={
          <button className="btn-cta" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            新建赞助商
          </button>
        }
      />

      <Card bodyClassName="-m-6">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          empty={
            <div className="py-10 text-center text-on-surface-variant text-sm">
              暂无赞助商 · 点击右上角「新建赞助商」为本校合作商家开通投放账号
            </div>
          }
        />
        {total > LIMIT && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-outline-variant/40">
            <span className="text-xs text-on-surface-variant font-mono">
              共 {total} 个 · 第 {page} / {Math.max(1, Math.ceil(total / LIMIT))} 页
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <button
                className="btn-secondary btn-sm"
                disabled={page >= Math.ceil(total / LIMIT)}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </Card>

      <Modal open={createOpen} title="新建赞助商账号" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <Field label="组织名" required>
            <Input
              value={form.organizationName}
              onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
              placeholder="如：一点点奶茶·考文垂"
            />
          </Field>
          <Field label="账号名称" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="账号显示名"
            />
          </Field>
          <Field label="登录邮箱" required>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="sponsor@example.com"
            />
          </Field>
          <Field label="初始密码" required hint="至少 8 位，交付商家后建议其自行修改">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="联系人">
              <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </Field>
            <Field label="联系电话">
              <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>
              取消
            </button>
            <button className="btn-cta" onClick={submitCreate} disabled={saving}>
              {saving ? '创建中…' : '创建'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toggleTarget}
        danger={!!toggleTarget?.isActive}
        title={toggleTarget?.isActive ? '停用赞助商账号' : '启用赞助商账号'}
        message={
          toggleTarget?.isActive
            ? `停用后「${toggleTarget?.organizationName || toggleTarget?.name}」将无法登录与投放，进行中的广告不受影响。`
            : `确认重新启用「${toggleTarget?.organizationName || toggleTarget?.name}」？`
        }
        onConfirm={confirmToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}
