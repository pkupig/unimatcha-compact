'use client';

/**
 * 学校管理（SUPER/TEAM）— spec §5
 * 列表：学校/城市/用户数/进行中广告/累计收入/余额/分成/状态；
 * 新建学校 Modal（name/city）；行点击进详情。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Search } from 'lucide-react';
import { getSchools, createSchool, type School } from '@/lib/api';
import { formatNumber, bpsToPercent } from '@/lib/format';
import {
  PageHeader,
  Card,
  DataTable,
  Badge,
  Modal,
  Money,
  RoleGate,
  Field,
  Input,
  Select,
  type Column,
} from '@/components/ui';

const LIMIT = 20;

export default function SchoolsPage() {
  return (
    <RoleGate allow={['SUPER', 'TEAM']}>
      <SchoolsContent />
    </RoleGate>
  );
}

function SchoolsContent() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // 新建学校 Modal
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, activeFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSchools({
        page,
        limit: LIMIT,
        search: search || undefined,
        isActive: activeFilter || undefined,
      });
      const data = (res as any).data;
      setSchools(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      toast.error(err?.message || '学校列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('请填写学校名称');
      return;
    }
    setSaving(true);
    try {
      await createSchool({ name: name.trim(), city: city.trim() || null });
      toast.success('学校已创建');
      setShowCreate(false);
      setName('');
      setCity('');
      load();
    } catch (err: any) {
      toast.error(err?.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<School>[] = [
    {
      key: 'name',
      title: '学校',
      render: (s) => <span className="font-semibold text-on-surface">{s.name}</span>,
    },
    { key: 'city', title: '城市', render: (s) => s.city || '-' },
    {
      key: 'userCount',
      title: '用户数',
      align: 'right',
      render: (s) => <span className="font-mono">{formatNumber(s.stats?.userCount)}</span>,
    },
    {
      key: 'activeCampaigns',
      title: '进行中广告',
      align: 'right',
      render: (s) => (
        <span className="font-mono">
          {formatNumber(
            (s.stats as any)?.activeCampaignCount ?? s.stats?.activeCampaigns ?? 0,
          )}
        </span>
      ),
    },
    {
      key: 'revenue',
      title: '累计收入',
      align: 'right',
      render: (s) => <Money cents={s.stats?.totalRevenueCents} />,
    },
    {
      key: 'balance',
      title: '余额',
      align: 'right',
      render: (s) => <Money cents={s.stats?.balanceCents} />,
    },
    {
      key: 'share',
      title: '分成',
      render: (s) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          平台 {bpsToPercent(s.platformShareBps)} · 自拉 {bpsToPercent(s.selfSourcedShareBps)}
        </span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (s) => (
        <Badge variant={s.isActive ? 'neon' : 'pink'}>{s.isActive ? '启用' : '停用'}</Badge>
      ),
    },
  ];

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <PageHeader
        caption="SCHOOLS"
        title="学校管理"
        sub={`共 ${formatNumber(total)} 所学校`}
        actions={
          <button className="btn-cta" onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            新建学校
          </button>
        }
      />

      {/* 筛选 */}
      <Card className="py-4" bodyClassName="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <Input
            className="pl-9"
            placeholder="搜索学校名称 / 城市…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          className="w-full sm:w-40"
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部状态</option>
          <option value="true">启用</option>
          <option value="false">停用</option>
        </Select>
      </Card>

      {/* 列表 */}
      <Card className="p-0 overflow-hidden" bodyClassName="">
        <DataTable<School>
          columns={columns}
          data={schools}
          loading={loading}
          onRowClick={(s) => router.push(`/schools/${s.id}`)}
        />
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

      {/* 新建学校 */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        caption="NEW SCHOOL"
        title="新建学校"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="学校名称" required hint="须唯一，将用于与用户资料中的学校字段匹配">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 University of Warwick"
              required
            />
          </Field>
          <Field label="城市">
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="例如 Coventry"
            />
          </Field>
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
    </div>
  );
}
