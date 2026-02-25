'use client';

import { useEffect, useState } from 'react';
import { getUsers, updateUserStatus, resetUserMode } from '@/lib/api';
import { Search, Ban, CheckCircle, RefreshCw, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import clsx from 'clsx';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const LIMIT = 20;

  useEffect(() => { loadUsers(); }, [page, search, statusFilter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await getUsers({ page, limit: LIMIT, search: search || undefined, status: statusFilter || undefined });
      const data = (res as any).data;
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch { toast.error('加载用户列表失败'); }
    finally { setLoading(false); }
  };

  const handleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'BANNED' : 'ACTIVE';
    try {
      await updateUserStatus(id, newStatus);
      toast.success(newStatus === 'BANNED' ? '用户已封禁' : '用户已解封');
      loadUsers();
    } catch (err: any) { toast.error(err?.message || '操作失败'); }
  };

  const handleResetMode = async (id: string) => {
    try {
      await resetUserMode(id);
      toast.success('用户模式已重置为匹配模式');
      loadUsers();
    } catch (err: any) { toast.error(err?.message || '操作失败'); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
        <p className="text-sm text-gray-500 mt-0.5">共 {total} 位用户</p>
      </div>

      {/* Filters */}
      <div className="card py-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索邮箱或昵称..."
              className="input pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="input w-full sm:w-40"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">全部状态</option>
            <option value="ACTIVE">正常</option>
            <option value="BANNED">已封禁</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['邮箱', '昵称', '学校', '模式', '状态', '注册时间', '操作'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">加载中...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">暂无用户数据</td></tr>
              ) : users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{user.email}</td>
                  <td className="px-4 py-3 text-gray-600">{user.profile?.nickname || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{user.profile?.school || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge', user.mode === 'RELATIONSHIP_MODE' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700')}>
                      {user.mode === 'RELATIONSHIP_MODE' ? '💕 恋爱中' : '🔍 匹配中'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge', user.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                      {user.status === 'ACTIVE' ? '正常' : '已封禁'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link href={`/users/${user.id}`} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700" title="查看详情">
                        <Eye size={15} />
                      </Link>
                      {user.mode === 'RELATIONSHIP_MODE' && (
                        <button onClick={() => handleResetMode(user.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-purple-600" title="重置为匹配模式">
                          <RefreshCw size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => handleStatus(user.id, user.status)}
                        className={clsx('p-1.5 rounded hover:bg-gray-100', user.status === 'ACTIVE' ? 'text-gray-500 hover:text-red-600' : 'text-gray-500 hover:text-green-600')}
                        title={user.status === 'ACTIVE' ? '封禁用户' : '解封用户'}
                      >
                        {user.status === 'ACTIVE' ? <Ban size={15} /> : <CheckCircle size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">第 {page} / {totalPages} 页</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">上一页</button>
              <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40">下一页</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
