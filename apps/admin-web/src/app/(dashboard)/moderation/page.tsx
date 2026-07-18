'use client';

/**
 * /moderation — 广场管理与举报处理（spec §5.5）
 * SUPER/TEAM：「广场管理」全部帖子 + 举报队列 + 用户反馈（Report 表）
 * STUDENT_UNION：「校园墙管理」后端强制 scope 本校帖子 + 举报队列（无用户反馈 tab，后端 403）
 * tab1 帖子管理：筛选（板块/学校(仅 TEAM)/状态/搜索）+ 查看/下架(原因必填)/恢复
 * tab2 举报队列：reported=true 预筛，多一个「清除举报」操作
 * tab3 投票审核：校园墙投票帖 pending/approved/rejected 三态，通过/驳回(可填理由)
 * tab4 用户反馈（TEAM）：分类/内容/联系方式/提交用户/状态 + 标记已处理
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldAlert, MessageSquareWarning, Inbox, Vote } from 'lucide-react';
import {
  getSquarePostsAdmin,
  deleteSquarePostAdmin,
  restoreSquarePost,
  dismissPostReports,
  getAdminReports,
  updateAdminReport,
  getAdminPolls,
  reviewAdminPoll,
  type AdminSquarePost,
  type AdminReport,
  type SquareAuthorType,
  type AdminPollPost,
  type PollReviewStatus,
} from '@/lib/api';
import { isTeam } from '@/lib/auth';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import {
  PageHeader,
  DataTable,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  Tabs,
  Field,
  Input,
  Select,
  Textarea,
  RoleGate,
  useAdminInfo,
  type Column,
  type BadgeVariant,
} from '@/components/ui';

const LIMIT = 20;

/* ═══════════════════════════════════════════════════════════════
 * 标签映射
 * ═══════════════════════════════════════════════════════════════ */

const BOARD_LABELS: Record<string, string> = {
  RECOMMEND: '推荐流',
  CAMPUS_WALL: '校园墙',
};

const AUTHOR_TYPE_LABELS: Record<SquareAuthorType, string> = {
  USER: '用户',
  STUDENT_UNION: '学生会',
  TEAM: '团队',
  SPONSOR: '商家',
};

const AUTHOR_TYPE_VARIANTS: Record<SquareAuthorType, BadgeVariant> = {
  USER: 'neutral',
  STUDENT_UNION: 'ink',
  TEAM: 'neon',
  SPONSOR: 'outline',
};

/** h5 反馈表单的固定分类（apps/h5/index.html #report-category），其余原样展示 */
const REPORT_CATEGORY_LABELS: Record<string, string> = {
  bug: '功能问题',
  user: '举报用户',
  content: '不当内容',
  other: '其他',
};

/** 列表响应归一化（契约为 {items,total,page,limit}，兜底裸数组） */
function normalizeList<T = any>(data: any): { items: T[]; total: number } {
  if (Array.isArray(data)) return { items: data, total: data.length };
  const items = data?.items || data?.list || data?.posts || [];
  return { items, total: data?.total ?? items.length };
}

/** 输入防抖（搜索/学校筛选） */
function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
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

/** 隐藏原因（deletedBy='reporter:auto' 优先展示自动隐藏说明） */
function hiddenNote(p: AdminSquarePost): string {
  if (p.deletedBy === 'reporter:auto') return '举报自动隐藏';
  return p.deleteReason || '';
}

/** 作者单元格：类型徽章 + 名字/昵称 + 匿名徽章 */
function AuthorCell({ p }: { p: AdminSquarePost }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge variant={AUTHOR_TYPE_VARIANTS[p.authorType] ?? 'neutral'}>
        {AUTHOR_TYPE_LABELS[p.authorType] ?? p.authorType}
      </Badge>
      <span className="text-sm text-on-surface whitespace-nowrap">
        {p.author?.nickname || p.author?.name || '-'}
      </span>
      {p.anonymous && <Badge variant="outline">匿名</Badge>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * tab1/tab2 帖子表格（tab2 = reported 预筛 + 清除举报操作）
 * ═══════════════════════════════════════════════════════════════ */

function PostsPanel({ reported, team }: { reported?: boolean; team: boolean }) {
  const [items, setItems] = useState<AdminSquarePost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // 筛选
  const [board, setBoard] = useState('');
  const [status, setStatus] = useState('');
  const [schoolInput, setSchoolInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const school = useDebounced(schoolInput.trim());
  const search = useDebounced(searchInput.trim());

  // 弹窗状态
  const [viewPost, setViewPost] = useState<AdminSquarePost | null>(null);
  const [takedownTarget, setTakedownTarget] = useState<AdminSquarePost | null>(null);
  const [takedownReason, setTakedownReason] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<AdminSquarePost | null>(null);
  const [dismissTarget, setDismissTarget] = useState<AdminSquarePost | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 筛选变化回第 1 页
  useEffect(() => {
    setPage(1);
  }, [board, status, school, search]);

  // 防乱序：筛选/翻页可能触发并发请求，只采纳最后一次的响应
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current;
    setLoading(true);
    try {
      const res = await getSquarePostsAdmin({
        board: board || undefined,
        school: (team ? school : undefined) || undefined,
        status: status || undefined,
        reported: reported ? true : undefined,
        search: search || undefined,
        page,
        limit: LIMIT,
      });
      if (reqId !== reqRef.current) return;
      const { items, total } = normalizeList<AdminSquarePost>((res as any).data);
      setItems(items);
      setTotal(total);
    } catch (err: any) {
      if (reqId !== reqRef.current) return;
      toast.error(err?.message || '加载帖子列表失败');
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [board, status, school, search, page, reported, team]);

  useEffect(() => {
    load();
  }, [load]);

  const closeTakedown = () => {
    setTakedownTarget(null);
    setTakedownReason('');
  };

  const handleTakedown = async () => {
    if (!takedownTarget) return;
    const reason = takedownReason.trim();
    if (!reason) {
      toast.error('请填写下架原因');
      return;
    }
    setSubmitting(true);
    try {
      await deleteSquarePostAdmin(takedownTarget.id, reason);
      toast.success('帖子已下架');
      closeTakedown();
      load();
    } catch (err: any) {
      toast.error(err?.message || '下架失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setSubmitting(true);
    try {
      await restoreSquarePost(restoreTarget.id);
      toast.success('帖子已恢复展示');
      setRestoreTarget(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || '恢复失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    if (!dismissTarget) return;
    setSubmitting(true);
    try {
      await dismissPostReports(dismissTarget.id);
      toast.success('举报记录已清除');
      setDismissTarget(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<AdminSquarePost>[] = [
    {
      key: 'content',
      title: '内容',
      render: (p) => (
        <div className="max-w-[240px]">
          {p.title && <p className="font-bold text-on-surface truncate">{p.title}</p>}
          <p className="text-xs text-on-surface-variant truncate">{p.content}</p>
          {(p.images?.length ?? 0) > 0 && (
            <p className="text-[10px] font-mono text-outline mt-0.5">图 x{p.images.length}</p>
          )}
        </div>
      ),
    },
    { key: 'author', title: '作者', render: (p) => <AuthorCell p={p} /> },
    {
      key: 'school',
      title: '学校',
      render: (p) => (
        <span className="text-sm whitespace-nowrap">
          {p.school || <span className="text-on-surface-variant">跨校</span>}
        </span>
      ),
    },
    {
      key: 'board',
      title: '板块',
      render: (p) => (
        <span className="text-sm whitespace-nowrap">{BOARD_LABELS[p.board] ?? p.board}</span>
      ),
    },
    {
      key: 'stats',
      title: '互动',
      render: (p) => (
        <span className="font-mono text-xs whitespace-nowrap text-on-surface-variant">
          赞 {formatNumber(p.likeCount)} · 评 {formatNumber(p.commentCount)}
        </span>
      ),
    },
    {
      key: 'reports',
      title: '举报',
      align: 'center',
      render: (p) =>
        p.reportCount > 0 ? (
          <Badge variant="pink">{p.reportCount}</Badge>
        ) : (
          <span className="text-outline">-</span>
        ),
    },
    {
      key: 'status',
      title: '状态',
      render: (p) =>
        p.isHidden ? (
          <div>
            <Badge variant="pink">已隐藏</Badge>
            {hiddenNote(p) && (
              <p
                className="text-[10px] text-outline mt-1 max-w-[140px] truncate"
                title={hiddenNote(p)}
              >
                {hiddenNote(p)}
              </p>
            )}
          </div>
        ) : (
          <Badge variant="neon">展示中</Badge>
        ),
    },
    {
      key: 'createdAt',
      title: '时间',
      render: (p) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDate(p.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (p) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <button
            className="btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setViewPost(p);
            }}
          >
            查看
          </button>
          {reported && (
            <button
              className="btn-secondary btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setDismissTarget(p);
              }}
            >
              清除举报
            </button>
          )}
          {p.isHidden ? (
            <button
              className="btn-primary btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setRestoreTarget(p);
              }}
            >
              恢复
            </button>
          ) : (
            <button
              className="btn-danger btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setTakedownTarget(p);
              }}
            >
              下架
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 筛选行 */}
      <div className="card py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="板块">
            <Select value={board} onChange={(e) => setBoard(e.target.value)}>
              <option value="">全部</option>
              <option value="RECOMMEND">推荐流</option>
              <option value="CAMPUS_WALL">校园墙</option>
            </Select>
          </Field>
          {team && (
            <Field label="学校">
              <Input
                value={schoolInput}
                onChange={(e) => setSchoolInput(e.target.value)}
                placeholder="学校名，如 University of Warwick"
              />
            </Field>
          )}
          <Field label="状态">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部</option>
              <option value="visible">展示中</option>
              <option value="hidden">已隐藏</option>
            </Select>
          </Field>
          <Field label="搜索">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="标题 / 内容关键词"
            />
          </Field>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <DataTable<AdminSquarePost>
          columns={columns}
          data={items}
          loading={loading}
          empty={
            reported ? (
              <EmptyState icon={ShieldAlert} title="暂无被举报的帖子" />
            ) : (
              <EmptyState icon={Inbox} title="暂无帖子" sub="调整筛选条件后重试。" />
            )
          }
        />
        <Pager page={page} total={total} onPage={setPage} />
      </div>

      {/* 详情弹窗 */}
      <Modal
        open={!!viewPost}
        onClose={() => setViewPost(null)}
        caption="POST DETAIL"
        title={viewPost?.title || '帖子详情'}
        widthClassName="max-w-2xl"
      >
        {viewPost && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <AuthorCell p={viewPost} />
              {viewPost.isSponsored && <Badge variant="neon">Sponsored</Badge>}
              {viewPost.isHidden ? (
                <Badge variant="pink">已隐藏</Badge>
              ) : (
                <Badge variant="neon">展示中</Badge>
              )}
            </div>
            <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">
              {viewPost.content}
            </p>
            {(viewPost.images?.length ?? 0) > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {viewPost.images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt={`图 ${i + 1}`}
                    className="w-full aspect-square object-cover rounded-lg border border-outline-variant/40"
                  />
                ))}
              </div>
            )}
            <div className="rounded-lg bg-surface-low p-4 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">板块 · 学校</span>
                <span>
                  {BOARD_LABELS[viewPost.board] ?? viewPost.board} · {viewPost.school || '跨校'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">互动 · 举报</span>
                <span className="font-mono text-xs">
                  赞 {formatNumber(viewPost.likeCount)} · 评 {formatNumber(viewPost.commentCount)} ·
                  举报 {formatNumber(viewPost.reportCount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">发布时间</span>
                <span className="font-mono text-xs">{formatDateTime(viewPost.createdAt)}</span>
              </div>
              {viewPost.isHidden && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-on-surface-variant shrink-0">下架原因</span>
                  <span className="text-right">
                    {hiddenNote(viewPost) || '-'}
                    {viewPost.deletedAt && (
                      <span className="font-mono text-xs text-outline">
                        {' '}
                        · {formatDateTime(viewPost.deletedAt)}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 下架（原因必填，ConfirmDialog 无输入位 → 用 Modal + Textarea） */}
      <Modal
        open={!!takedownTarget}
        onClose={closeTakedown}
        caption="TAKE DOWN"
        title="下架帖子"
        widthClassName="max-w-md"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={closeTakedown} disabled={submitting}>
              取消
            </button>
            <button className="btn-danger btn-sm" onClick={handleTakedown} disabled={submitting}>
              {submitting ? '处理中…' : '确认下架'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant leading-relaxed">
            下架后该帖对用户不可见，可随时恢复展示。
            {takedownTarget && (
              <span className="block mt-1 text-on-surface font-medium truncate">
                「{takedownTarget.title || takedownTarget.content}」
              </span>
            )}
          </p>
          <Field label="下架原因" required>
            <Textarea
              rows={3}
              value={takedownReason}
              onChange={(e) => setTakedownReason(e.target.value)}
              placeholder="必填，例如：含不当内容 / 广告刷屏"
            />
          </Field>
        </div>
      </Modal>

      {/* 恢复展示 */}
      <ConfirmDialog
        open={!!restoreTarget}
        title="恢复展示"
        message={
          restoreTarget ? (
            <>
              确认恢复「{restoreTarget.title || restoreTarget.content.slice(0, 20)}」的展示？
              将清除下架记录，该帖重新对用户可见。
            </>
          ) : null
        }
        confirmText="确认恢复"
        loading={submitting}
        onConfirm={handleRestore}
        onCancel={() => setRestoreTarget(null)}
      />

      {/* 清除举报 */}
      <ConfirmDialog
        open={!!dismissTarget}
        title="清除举报"
        message="清除该帖的所有举报记录？若因举报自动隐藏将同时恢复展示。"
        confirmText="确认清除"
        loading={submitting}
        onConfirm={handleDismiss}
        onCancel={() => setDismissTarget(null)}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * tab3 投票审核（校园墙投票帖；UNION 后端自动 scope 本校）
 * ═══════════════════════════════════════════════════════════════ */

const POLL_STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
};

function pollStatusVariant(status?: string | null): BadgeVariant {
  switch (status) {
    case 'approved':
      return 'neon';
    case 'rejected':
      return 'pink';
    default:
      return 'ink';
  }
}

function PollsPanel({ team }: { team: boolean }) {
  const [items, setItems] = useState<AdminPollPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PollReviewStatus>('pending');
  const [loading, setLoading] = useState(true);

  // 通过=确认弹窗；驳回=Modal 填理由（选填）
  const [approveTarget, setApproveTarget] = useState<AdminPollPost | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminPollPost | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current;
    setLoading(true);
    try {
      const res = await getAdminPolls({ status, page, limit: LIMIT });
      if (reqId !== reqRef.current) return;
      const { items, total } = normalizeList<AdminPollPost>((res as any).data);
      setItems(items);
      setTotal(total);
    } catch (err: any) {
      if (reqId !== reqRef.current) return;
      toast.error(err?.message || '加载投票列表失败');
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setSubmitting(true);
    try {
      await reviewAdminPoll(approveTarget.id, { action: 'approve' });
      toast.success('投票已通过');
      setApproveTarget(null);
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
    setSubmitting(true);
    try {
      const note = rejectNote.trim();
      await reviewAdminPoll(rejectTarget.id, { action: 'reject', ...(note ? { note } : {}) });
      toast.success('投票已驳回');
      closeReject();
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<AdminPollPost>[] = [
    {
      key: 'content',
      title: '内容',
      render: (p) => (
        <div className="max-w-[260px]">
          {p.title && <p className="font-bold text-on-surface truncate">{p.title}</p>}
          <p className="text-xs text-on-surface-variant truncate">{p.content}</p>
        </div>
      ),
    },
    {
      key: 'options',
      title: '选项',
      render: (p) => (
        <div className="space-y-0.5 max-w-[200px]">
          {(p.pollOptions ?? []).map((o, i) => (
            <p key={i} className="text-xs text-on-surface truncate">
              {o.text}
              <span className="font-mono text-[10px] text-outline ml-1.5">
                {formatNumber(o.votes)} 票
              </span>
            </p>
          ))}
        </div>
      ),
    },
    {
      key: 'school',
      title: '学校',
      render: (p) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm whitespace-nowrap">
            {p.school || <span className="text-on-surface-variant">跨校</span>}
          </span>
          {team && p.hasUnionReviewer && <Badge variant="outline">本校有学生会</Badge>}
        </div>
      ),
    },
    {
      key: 'author',
      title: '作者',
      render: (p) => (
        <span className="text-sm whitespace-nowrap">
          {p.anonymous ? (
            <Badge variant="outline">匿名</Badge>
          ) : (
            p.authorUser?.profile?.nickname || '-'
          )}
        </span>
      ),
    },
    {
      key: 'createdAt',
      title: '提交时间',
      render: (p) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDateTime(p.createdAt)}
        </span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (p) => (
        <div>
          <Badge variant={pollStatusVariant(p.reviewStatus)}>
            {POLL_STATUS_LABELS[p.reviewStatus] ?? p.reviewStatus}
          </Badge>
          {p.reviewStatus === 'rejected' && p.reviewNote && (
            <p
              className="text-[10px] text-outline mt-1 max-w-[140px] truncate"
              title={p.reviewNote}
            >
              {p.reviewNote}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (p) =>
        p.reviewStatus === 'pending' ? (
          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
            <button
              className="btn-primary btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setApproveTarget(p);
              }}
            >
              通过
            </button>
            <button
              className="btn-danger btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setRejectTarget(p);
              }}
            >
              驳回
            </button>
          </div>
        ) : (
          <span className="text-outline text-xs">-</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="card py-4">
        <Select
          className="w-full sm:w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as PollReviewStatus);
            setPage(1);
          }}
        >
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
        </Select>
      </div>

      <div className="card p-0 overflow-hidden">
        <DataTable<AdminPollPost>
          columns={columns}
          data={items}
          loading={loading}
          empty={
            <EmptyState
              icon={Vote}
              title={status === 'pending' ? '暂无待审核的投票' : '暂无投票'}
            />
          }
        />
        <Pager page={page} total={total} onPage={setPage} />
      </div>

      {/* 通过 */}
      <ConfirmDialog
        open={!!approveTarget}
        title="通过投票"
        message={
          approveTarget ? (
            <>
              确认通过「{approveTarget.title || approveTarget.content.slice(0, 20)}」？
              通过后该投票对用户可见。
            </>
          ) : null
        }
        confirmText="确认通过"
        loading={submitting}
        onConfirm={handleApprove}
        onCancel={() => setApproveTarget(null)}
      />

      {/* 驳回（理由选填） */}
      <Modal
        open={!!rejectTarget}
        onClose={closeReject}
        caption="REJECT POLL"
        title="驳回投票"
        widthClassName="max-w-md"
        footer={
          <>
            <button className="btn-secondary btn-sm" onClick={closeReject} disabled={submitting}>
              取消
            </button>
            <button className="btn-danger btn-sm" onClick={handleReject} disabled={submitting}>
              {submitting ? '处理中…' : '确认驳回'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant leading-relaxed">
            驳回后该投票不会展示给用户。
            {rejectTarget && (
              <span className="block mt-1 text-on-surface font-medium truncate">
                「{rejectTarget.title || rejectTarget.content}」
              </span>
            )}
          </p>
          <Field label="驳回理由" hint="选填，将记录在审核备注中">
            <Textarea
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="例如：含不当内容 / 与校园无关"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * tab4 用户反馈（TEAM 专属，Report 表）
 * ═══════════════════════════════════════════════════════════════ */

function FeedbackPanel() {
  const [items, setItems] = useState<AdminReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const [viewReport, setViewReport] = useState<AdminReport | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current;
    setLoading(true);
    try {
      const res = await getAdminReports({ status: status || undefined, page, limit: LIMIT });
      if (reqId !== reqRef.current) return;
      const { items, total } = normalizeList<AdminReport>((res as any).data);
      setItems(items);
      setTotal(total);
    } catch (err: any) {
      if (reqId !== reqRef.current) return;
      toast.error(err?.message || '加载用户反馈失败');
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (r: AdminReport) => {
    setResolvingId(r.id);
    try {
      await updateAdminReport(r.id, { status: 'resolved' });
      toast.success('已标记为已处理');
      load();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setResolvingId(null);
    }
  };

  const columns: Column<AdminReport>[] = [
    {
      key: 'category',
      title: '分类',
      render: (r) => (
        <span className="text-sm whitespace-nowrap">
          {REPORT_CATEGORY_LABELS[r.category] ?? r.category}
        </span>
      ),
    },
    {
      key: 'content',
      title: '内容',
      render: (r) => (
        <div className="flex items-center gap-2 max-w-[280px]">
          <span className="text-sm text-on-surface-variant truncate">{r.content}</span>
          <button
            className="btn-secondary btn-sm shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setViewReport(r);
            }}
          >
            查看
          </button>
        </div>
      ),
    },
    {
      key: 'contact',
      title: '联系方式',
      render: (r) => (
        <span className="font-mono text-xs text-on-surface-variant">{r.contact || '-'}</span>
      ),
    },
    {
      key: 'user',
      title: '提交用户',
      render: (r) => (
        <div>
          <p className="text-sm text-on-surface">
            {(r.user as any)?.profile?.nickname || r.user?.nickname || '-'}
          </p>
          {r.user?.email && (
            <p className="font-mono text-[10px] text-outline truncate max-w-[160px]">
              {r.user.email}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (r) =>
        r.status === 'resolved' ? (
          <Badge variant="outline">已处理</Badge>
        ) : (
          <Badge variant="ink">待处理</Badge>
        ),
    },
    {
      key: 'createdAt',
      title: '时间',
      render: (r) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
          {formatDateTime(r.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (r) =>
        r.status === 'open' ? (
          <button
            className="btn-primary btn-sm"
            disabled={resolvingId === r.id}
            onClick={(e) => {
              e.stopPropagation();
              handleResolve(r);
            }}
          >
            {resolvingId === r.id ? '处理中…' : '标记已处理'}
          </button>
        ) : (
          <span className="text-outline text-xs">-</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="card py-4">
        <Select
          className="w-full sm:w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部状态</option>
          <option value="open">待处理</option>
          <option value="resolved">已处理</option>
        </Select>
      </div>

      <div className="card p-0 overflow-hidden">
        <DataTable<AdminReport>
          columns={columns}
          data={items}
          loading={loading}
          empty={<EmptyState icon={MessageSquareWarning} title="暂无用户反馈" />}
        />
        <Pager page={page} total={total} onPage={setPage} />
      </div>

      {/* 反馈全文 */}
      <Modal
        open={!!viewReport}
        onClose={() => setViewReport(null)}
        caption="FEEDBACK DETAIL"
        title={
          viewReport
            ? (REPORT_CATEGORY_LABELS[viewReport.category] ?? viewReport.category)
            : '反馈详情'
        }
      >
        {viewReport && (
          <div className="space-y-4">
            <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">
              {viewReport.content}
            </p>
            <div className="rounded-lg bg-surface-low p-4 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">提交用户</span>
                <span>
                  {(viewReport.user as any)?.profile?.nickname || viewReport.user?.nickname || '-'}
                  {viewReport.user?.email && (
                    <span className="font-mono text-xs text-outline"> · {viewReport.user.email}</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">联系方式</span>
                <span className="font-mono text-xs">{viewReport.contact || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">提交时间</span>
                <span className="font-mono text-xs">{formatDateTime(viewReport.createdAt)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 * 页面入口（SUPER/TEAM/STUDENT_UNION；SPONSOR 由 RoleGate 拦截）
 * ═══════════════════════════════════════════════════════════════ */

function ModerationInner() {
  const me = useAdminInfo();
  const team = isTeam(me?.role);
  const [tab, setTab] = useState<'posts' | 'reported' | 'polls' | 'feedback'>('posts');

  // UNION 不可见用户反馈 tab（后端对其返回 403）
  const tabItems = [
    { key: 'posts', label: '帖子管理' },
    { key: 'reported', label: '举报队列' },
    { key: 'polls', label: '投票审核' },
    ...(team ? [{ key: 'feedback', label: '用户反馈' }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        caption="MODERATION"
        title={team ? '广场管理' : '校园墙管理'}
        sub={team ? '帖子管理 · 举报处理' : `${me?.schoolName ?? '本校'} · 本校帖子与举报处理`}
      />
      <Tabs value={tab} onChange={(k) => setTab(k as typeof tab)} items={tabItems} />
      {tab === 'posts' && <PostsPanel team={team} />}
      {tab === 'reported' && <PostsPanel reported team={team} />}
      {tab === 'polls' && <PollsPanel team={team} />}
      {tab === 'feedback' && team && <FeedbackPanel />}
    </div>
  );
}

export default function ModerationPage() {
  return (
    <RoleGate allow={['SUPER', 'TEAM', 'STUDENT_UNION']}>
      <ModerationInner />
    </RoleGate>
  );
}
