'use client';

/**
 * /submissions — 官网提交（spec §5.6，SUPER/TEAM only）
 * tab1 赞助申请（type=SPONSOR）：标记已联系 / 开通账号（一键创建学生会或商家后台账号，
 *      成功后展示一次性凭据卡）/ 关闭（原因必填）/ 重新打开
 * tab2 候补名单（type=WAITLIST）：只读 + 标记已联系 / 关闭 / 重新打开
 * 已开通（APPROVED）的行展示 convertedAdmin 名字并链接 /accounts，无操作。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Inbox, Copy, Dices, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  getSubmissions,
  updateSubmission,
  convertSubmission,
  getSchools,
  type AdminSubmission,
  type PublicSubmissionType,
  type PublicSubmissionStatus,
  type ConvertSubmissionInput,
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  PageHeader,
  DataTable,
  Badge,
  Modal,
  EmptyState,
  Tabs,
  Field,
  Input,
  Select,
  Textarea,
  RoleGate,
  type Column,
  type BadgeVariant,
} from '@/components/ui';

const LIMIT = 20;

/* ═══════════════════════════════════════════════════════════════
 * 标签映射 & 工具
 * ═══════════════════════════════════════════════════════════════ */

const STATUS_LABELS: Record<PublicSubmissionStatus, string> = {
  PENDING: '待处理',
  CONTACTED: '已联系',
  APPROVED: '已开通',
  REJECTED: '已关闭',
};

const STATUS_VARIANTS: Record<PublicSubmissionStatus, BadgeVariant> = {
  PENDING: 'ink',
  CONTACTED: 'outline',
  APPROVED: 'neon',
  REJECTED: 'pink',
};

const TYPE_LABELS: Record<PublicSubmissionType, string> = {
  SPONSOR: '赞助申请',
  WAITLIST: '候补名单',
};

/** 列表响应归一化（契约为 {items,total,page,limit}，兜底裸数组） */
function normalizeList<T = any>(data: any): { items: T[]; total: number } {
  if (Array.isArray(data)) return { items: data, total: data.length };
  const items = data?.items || data?.list || [];
  return { items, total: data?.total ?? items.length };
}

/** 输入防抖（搜索） */
function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** 随机初始密码：12 位，crypto.getRandomValues，保证含大写/小写/数字（去易混淆字符） */
function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const rand = new Uint32Array(12);
  crypto.getRandomValues(rand);
  const chars = Array.from(rand, (r, i) => {
    if (i === 0) return upper[r % upper.length];
    if (i === 1) return lower[r % lower.length];
    if (i === 2) return digits[r % digits.length];
    return all[r % all.length];
  });
  // Fisher–Yates 打乱，避免前三位固定为 大写/小写/数字
  const swap = new Uint32Array(chars.length);
  crypto.getRandomValues(swap);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = swap[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** 复制到剪贴板（navigator.clipboard 优先，textarea select 兜底） */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="btn-secondary btn-sm shrink-0"
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) toast.success('已复制');
        else toast.error('复制失败，请手动选择复制');
      }}
    >
      <Copy size={13} />
      复制
    </button>
  );
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/30">
      <span className="text-xs text-on-surface-variant font-mono">
        第 {page} / {totalPages} 页 · 共 {total} 条
      </span>
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          上一页
        </button>
        <button
          className="btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 开通账号 Modal（仅赞助申请 tab）
 * 表单态 → 提交 convertSubmission → 成功切换为一次性凭据卡
 * ═══════════════════════════════════════════════════════════════ */

const NEW_SCHOOL = '__new__';

function ConvertModal({
  submission,
  onClose,
  onConverted,
}: {
  submission: AdminSubmission;
  onClose: () => void;
  /** 开通成功即刷新列表（modal 停留在凭据卡） */
  onConverted: () => void;
}) {
  const [role, setRole] = useState<'STUDENT_UNION' | 'SPONSOR'>('STUDENT_UNION');
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolCity, setNewSchoolCity] = useState('');
  const [organizationName, setOrganizationName] = useState(submission.organization ?? '');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [sourceSchoolId, setSourceSchoolId] = useState('');
  const [name, setName] = useState(submission.organization ?? '');
  const [email, setEmail] = useState(submission.email);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [creds, setCreds] = useState<{
    email: string;
    password: string;
    adminName?: string;
    schoolName?: string | null;
  } | null>(null);

  // 学校下拉（现有学校 + 新建）
  useEffect(() => {
    getSchools({ limit: 500 })
      .then((res: any) => setSchools(normalizeList<{ id: string; name: string }>(res.data).items))
      .catch(() => toast.error('加载学校列表失败'));
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('请填写账号名');
      return;
    }
    if (!password) {
      toast.error('请填写初始密码或点击随机生成');
      return;
    }
    if (role === 'STUDENT_UNION') {
      if (!schoolId) {
        toast.error('请选择学校');
        return;
      }
      if (schoolId === NEW_SCHOOL && !newSchoolName.trim()) {
        toast.error('请填写新学校名称');
        return;
      }
    } else if (!organizationName.trim()) {
      toast.error('请填写组织名称');
      return;
    }

    const body: ConvertSubmissionInput = {
      accountRole: role,
      name: name.trim(),
      password,
      email: email.trim() || undefined,
    };
    if (role === 'STUDENT_UNION') {
      if (schoolId === NEW_SCHOOL) {
        body.newSchoolName = newSchoolName.trim();
        if (newSchoolCity.trim()) body.newSchoolCity = newSchoolCity.trim();
      } else {
        body.schoolId = schoolId;
      }
    } else {
      body.organizationName = organizationName.trim();
      if (contactName.trim()) body.contactName = contactName.trim();
      if (contactPhone.trim()) body.contactPhone = contactPhone.trim();
      if (sourceSchoolId) body.schoolId = sourceSchoolId;
    }

    setSubmitting(true);
    try {
      const res: any = await convertSubmission(submission.id, body);
      const data = res.data ?? {};
      setCreds({
        email: data.admin?.email ?? email.trim() ?? submission.email,
        password: data.initialPassword ?? password,
        adminName: data.admin?.name,
        schoolName: data.school?.name ?? null,
      });
      toast.success('账号已开通');
      onConverted();
    } catch (err: any) {
      toast.error(err?.message || '开通失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      caption="CONVERT"
      title={creds ? '账号已开通' : '开通账号'}
      widthClassName="max-w-lg"
      footer={
        creds ? (
          <button className="btn-primary btn-sm" onClick={onClose}>
            完成
          </button>
        ) : (
          <>
            <button className="btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button className="btn-cta btn-sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '开通中…' : '开通账号'}
            </button>
          </>
        )
      }
    >
      {creds ? (
        /* ── 一次性凭据卡 ── */
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-on-surface">
            <CheckCircle2 size={18} className="text-ink shrink-0" />
            <span>
              后台账号
              {creds.adminName ? (
                <span className="font-bold">「{creds.adminName}」</span>
              ) : null}
              已创建
              {creds.schoolName ? <>，学校：{creds.schoolName}</> : null}。
            </span>
          </div>
          <div className="rounded-lg border-2 border-neon bg-surface-low p-5 space-y-4">
            <div>
              <p className="caption mb-1">登录邮箱</p>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm text-on-surface break-all">{creds.email}</span>
                <CopyButton text={creds.email} />
              </div>
            </div>
            <div>
              <p className="caption mb-1">初始密码</p>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-lg font-bold text-on-surface tracking-wider break-all">
                  {creds.password}
                </span>
                <CopyButton text={creds.password} />
              </div>
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-neon-pink">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            密码仅此一次展示，请立即复制并线下交付。
          </p>
        </div>
      ) : (
        /* ── 开通表单 ── */
        <div className="space-y-4">
          <Field label="账号类型" required>
            <div className="flex items-center gap-5 pt-1">
              {(
                [
                  ['STUDENT_UNION', '学生会'],
                  ['SPONSOR', '商家'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="convert-account-role"
                    className="accent-ink"
                    checked={role === value}
                    onChange={() => setRole(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>

          {role === 'STUDENT_UNION' ? (
            <>
              <Field label="学校" required>
                <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                  <option value="">请选择学校</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value={NEW_SCHOOL}>新建学校…</option>
                </Select>
              </Field>
              {schoolId === NEW_SCHOOL && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="新学校名称" required>
                    <Input
                      value={newSchoolName}
                      onChange={(e) => setNewSchoolName(e.target.value)}
                      placeholder="如 University of Warwick"
                    />
                  </Field>
                  <Field label="城市">
                    <Input
                      value={newSchoolCity}
                      onChange={(e) => setNewSchoolCity(e.target.value)}
                      placeholder="选填"
                    />
                  </Field>
                </div>
              )}
            </>
          ) : (
            <>
              <Field label="组织名称" required>
                <Input
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="商家 / 机构名称"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="联系人">
                  <Input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="选填"
                  />
                </Field>
                <Field label="联系电话">
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="选填"
                  />
                </Field>
              </div>
              <Field label="来源学校" hint="学生会自拉商家选来源学校；平台直签留空">
                <Select value={sourceSchoolId} onChange={(e) => setSourceSchoolId(e.target.value)}>
                  <option value="">平台直签</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <Field label="账号名" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="后台展示名称"
            />
          </Field>
          <Field label="登录邮箱" hint="默认使用申请邮箱，可修改">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={submission.email}
            />
          </Field>
          <Field label="初始密码" required>
            <div className="flex gap-2">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入或随机生成"
                className="font-mono"
              />
              <button
                type="button"
                className="btn-secondary btn-sm shrink-0 self-stretch"
                onClick={() => setPassword(generatePassword())}
              >
                <Dices size={14} />
                随机生成
              </button>
            </div>
          </Field>
        </div>
      )}
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 单个 tab 面板（赞助申请 / 候补名单）
 * ═══════════════════════════════════════════════════════════════ */

function SubmissionsPanel({ type }: { type: PublicSubmissionType }) {
  const sponsor = type === 'SPONSOR';

  const [items, setItems] = useState<AdminSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // 筛选
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim());

  // 弹窗状态
  const [viewTarget, setViewTarget] = useState<AdminSubmission | null>(null);
  const [contactTarget, setContactTarget] = useState<AdminSubmission | null>(null);
  const [contactNote, setContactNote] = useState('');
  const [rejectTarget, setRejectTarget] = useState<AdminSubmission | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [convertTarget, setConvertTarget] = useState<AdminSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  // 筛选变化回第 1 页
  useEffect(() => {
    setPage(1);
  }, [status, search]);

  // 防乱序：只采纳最后一次请求的响应
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current;
    setLoading(true);
    try {
      const res = await getSubmissions({
        type,
        status: status || undefined,
        search: search || undefined,
        page,
        limit: LIMIT,
      });
      if (reqId !== reqRef.current) return;
      const { items, total } = normalizeList<AdminSubmission>((res as any).data);
      setItems(items);
      setTotal(total);
    } catch (err: any) {
      if (reqId !== reqRef.current) return;
      toast.error(err?.message || '加载官网提交失败');
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [type, status, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const closeContact = () => {
    setContactTarget(null);
    setContactNote('');
  };

  const handleContact = async () => {
    if (!contactTarget) return;
    setSubmitting(true);
    try {
      const note = contactNote.trim();
      await updateSubmission(contactTarget.id, {
        status: 'CONTACTED',
        ...(note ? { note } : {}),
      });
      toast.success('已标记为已联系');
      closeContact();
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const closeReject = () => {
    setRejectTarget(null);
    setRejectNote('');
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const note = rejectNote.trim();
    if (!note) {
      toast.error('请填写关闭原因');
      return;
    }
    setSubmitting(true);
    try {
      await updateSubmission(rejectTarget.id, { status: 'REJECTED', note });
      toast.success('提交已关闭');
      closeReject();
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async (s: AdminSubmission) => {
    setReopeningId(s.id);
    try {
      await updateSubmission(s.id, { status: 'PENDING' });
      toast.success('已重新打开');
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setReopeningId(null);
    }
  };

  const columns: Column<AdminSubmission>[] = [
    {
      key: 'organization',
      title: '组织',
      render: (s) =>
        s.organization ? (
          <span className="font-bold text-on-surface whitespace-nowrap max-w-[180px] truncate inline-block align-middle">
            {s.organization}
          </span>
        ) : (
          <span className="text-outline">-</span>
        ),
    },
    {
      key: 'email',
      title: '邮箱',
      render: (s) => (
        <span className="font-mono text-xs text-on-surface-variant break-all">{s.email}</span>
      ),
    },
    {
      key: 'message',
      title: '留言',
      render: (s) => (
        <div className="flex items-center gap-2 max-w-[240px]">
          <span className="text-sm text-on-surface-variant truncate">
            {s.message || <span className="text-outline">-</span>}
          </span>
          <button
            className="btn-secondary btn-sm shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setViewTarget(s);
            }}
          >
            查看
          </button>
        </div>
      ),
    },
    {
      key: 'createdAt',
      title: '提交时间',
      render: (s) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDateTime(s.createdAt)}
        </span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (s) => (
        <Badge variant={STATUS_VARIANTS[s.status] ?? 'neutral'}>
          {STATUS_LABELS[s.status] ?? s.status}
        </Badge>
      ),
    },
    {
      key: 'handle',
      title: '处理',
      render: (s) =>
        s.handleNote || s.handledAt ? (
          <div className="max-w-[160px]">
            {s.handleNote && (
              <p className="text-xs text-on-surface truncate" title={s.handleNote}>
                {s.handleNote}
              </p>
            )}
            {s.handledAt && (
              <p className="font-mono text-[10px] text-outline mt-0.5 whitespace-nowrap">
                {formatDateTime(s.handledAt)}
              </p>
            )}
          </div>
        ) : (
          <span className="text-outline">-</span>
        ),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (s) => {
        if (s.status === 'APPROVED') {
          return s.convertedAdmin ? (
            <Link
              href="/accounts"
              className="text-sm font-bold text-on-surface underline underline-offset-2 hover:text-ink whitespace-nowrap"
              onClick={(e) => e.stopPropagation()}
            >
              {s.convertedAdmin.name}
            </Link>
          ) : (
            <span className="text-outline text-xs">已开通</span>
          );
        }
        if (s.status === 'REJECTED') {
          return (
            <button
              className="btn-secondary btn-sm"
              disabled={reopeningId === s.id}
              onClick={(e) => {
                e.stopPropagation();
                handleReopen(s);
              }}
            >
              {reopeningId === s.id ? '处理中…' : '重新打开'}
            </button>
          );
        }
        // PENDING / CONTACTED
        return (
          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
            <button
              className="btn-secondary btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setContactTarget(s);
              }}
            >
              标记已联系
            </button>
            {sponsor && (
              <button
                className="btn-cta btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setConvertTarget(s);
                }}
              >
                开通账号
              </button>
            )}
            <button
              className="btn-danger btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setRejectTarget(s);
              }}
            >
              关闭
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* 筛选行 */}
      <div className="card py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="状态">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部</option>
              <option value="PENDING">待处理</option>
              <option value="CONTACTED">已联系</option>
              <option value="APPROVED">已开通</option>
              <option value="REJECTED">已关闭</option>
            </Select>
          </Field>
          <Field label="搜索" className="lg:col-span-2">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="邮箱 / 组织关键词"
            />
          </Field>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <DataTable<AdminSubmission>
          columns={columns}
          data={items}
          loading={loading}
          empty={
            <EmptyState
              icon={Inbox}
              title={sponsor ? '暂无赞助申请' : '暂无候补名单'}
              sub="官网提交会实时出现在这里。"
            />
          }
        />
        <Pager page={page} total={total} onPage={setPage} />
      </div>

      {/* 留言全文 + 提交元信息 */}
      <Modal
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        caption="SUBMISSION DETAIL"
        title={viewTarget?.organization || TYPE_LABELS[type]}
        widthClassName="max-w-xl"
      >
        {viewTarget && (
          <div className="space-y-4">
            {viewTarget.message ? (
              <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">
                {viewTarget.message}
              </p>
            ) : (
              <p className="text-sm text-outline">（无留言）</p>
            )}
            <div className="rounded-lg bg-surface-low p-4 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">类型 · 状态</span>
                <span>
                  {TYPE_LABELS[viewTarget.type] ?? viewTarget.type} ·{' '}
                  <Badge variant={STATUS_VARIANTS[viewTarget.status] ?? 'neutral'}>
                    {STATUS_LABELS[viewTarget.status] ?? viewTarget.status}
                  </Badge>
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-on-surface-variant shrink-0">邮箱</span>
                <span className="font-mono text-xs break-all">{viewTarget.email}</span>
              </div>
              {viewTarget.organization && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-on-surface-variant shrink-0">组织</span>
                  <span className="text-right">{viewTarget.organization}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">提交语言</span>
                <span className="font-mono text-xs uppercase">{viewTarget.locale || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">提交时间</span>
                <span className="font-mono text-xs">{formatDateTime(viewTarget.createdAt)}</span>
              </div>
              {(viewTarget.handleNote || viewTarget.handledAt) && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-on-surface-variant shrink-0">处理</span>
                  <span className="text-right">
                    {viewTarget.handleNote || '-'}
                    {viewTarget.handledAt && (
                      <span className="font-mono text-xs text-outline">
                        {' '}
                        · {formatDateTime(viewTarget.handledAt)}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {viewTarget.convertedAdmin && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-on-surface-variant shrink-0">开通账号</span>
                  <Link
                    href="/accounts"
                    className="font-bold underline underline-offset-2 hover:text-ink"
                  >
                    {viewTarget.convertedAdmin.name}
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 标记已联系（备注选填） */}
      <Modal
        open={!!contactTarget}
        onClose={closeContact}
        caption="MARK CONTACTED"
        title="标记已联系"
        widthClassName="max-w-md"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={closeContact} disabled={submitting}>
              取消
            </button>
            <button className="btn-primary btn-sm" onClick={handleContact} disabled={submitting}>
              {submitting ? '处理中…' : '确认标记'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant leading-relaxed">
            标记后状态变为「已联系」。
            {contactTarget && (
              <span className="block mt-1 font-mono text-xs text-on-surface truncate">
                {contactTarget.organization ? `${contactTarget.organization} · ` : ''}
                {contactTarget.email}
              </span>
            )}
          </p>
          <Field label="备注" hint="选填，如联系方式 / 沟通结论">
            <Textarea
              rows={3}
              value={contactNote}
              onChange={(e) => setContactNote(e.target.value)}
              placeholder="选填"
            />
          </Field>
        </div>
      </Modal>

      {/* 关闭（原因必填） */}
      <Modal
        open={!!rejectTarget}
        onClose={closeReject}
        caption="CLOSE"
        title="关闭提交"
        widthClassName="max-w-md"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={closeReject} disabled={submitting}>
              取消
            </button>
            <button className="btn-danger btn-sm" onClick={handleReject} disabled={submitting}>
              {submitting ? '处理中…' : '确认关闭'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant leading-relaxed">
            关闭后不再跟进，可随时重新打开。
            {rejectTarget && (
              <span className="block mt-1 font-mono text-xs text-on-surface truncate">
                {rejectTarget.organization ? `${rejectTarget.organization} · ` : ''}
                {rejectTarget.email}
              </span>
            )}
          </p>
          <Field label="关闭原因" required>
            <Textarea
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="必填，例如：不符合合作方向 / 无法取得联系"
            />
          </Field>
        </div>
      </Modal>

      {/* 开通账号（仅赞助申请） */}
      {convertTarget && (
        <ConvertModal
          submission={convertTarget}
          onClose={() => setConvertTarget(null)}
          onConverted={load}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 页面入口（SUPER/TEAM；其余角色由 RoleGate 拦截）
 * ═══════════════════════════════════════════════════════════════ */

function SubmissionsInner() {
  const [tab, setTab] = useState<PublicSubmissionType>('SPONSOR');

  return (
    <div className="space-y-6">
      <PageHeader caption="Submissions" title="官网提交" sub="赞助申请 · 候补名单" />
      <Tabs
        value={tab}
        onChange={(k) => setTab(k as PublicSubmissionType)}
        items={[
          { key: 'SPONSOR', label: '赞助申请' },
          { key: 'WAITLIST', label: '候补名单' },
        ]}
      />
      {/* key 让切换 tab 时筛选/分页状态重置 */}
      <SubmissionsPanel key={tab} type={tab} />
    </div>
  );
}

export default function SubmissionsPage() {
  return (
    <RoleGate allow={['SUPER', 'TEAM']}>
      <SubmissionsInner />
    </RoleGate>
  );
}
