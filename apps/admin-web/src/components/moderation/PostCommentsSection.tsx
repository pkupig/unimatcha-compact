'use client';

/**
 * 查看弹窗内的评论管理区：分页拉取 + 单条删除（父楼删除时其下回复级联删）。
 * 删除成功后同时刷新本区分页与外层帖子列表（commentCount 随之更新，经 onChanged 回调）。
 */
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pager } from '@/components/ui/Pager';
import { Spinner } from '@/components/ui/Spinner';
import { useModal } from '@/hooks/useModal';
import { usePagedList } from '@/hooks/usePagedList';
import { deletePostComment, listPostComments } from '@/lib/api/moderation';
import { formatDateTime } from '@/lib/format';
import type { AdminPostComment } from '@/lib/types';

export function PostCommentsSection({
  postId,
  onChanged,
  onTotal,
}: {
  postId: string;
  /** 删除评论后回调（外层刷新帖子列表以更新 commentCount） */
  onChanged?: () => void | Promise<void>;
  /** 实时评论总数上报（弹窗头部计数用它替代打开时的列表行快照） */
  onTotal?: (total: number) => void;
}) {
  const list = usePagedList<AdminPostComment, Record<string, never>>({
    fetcher: async (q) => {
      const res = await listPostComments(postId, { page: q.page, limit: q.limit });
      onTotal?.(res.total);
      return res;
    },
    initialFilters: {},
    limit: 10,
  });
  const remove = useModal<AdminPostComment>();

  return (
    <div className="border-t border-outline-variant/40 pt-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="label mb-0">评论{list.total > 0 ? `（${list.total}）` : ''}</span>
        {list.loading && <Spinner size={14} />}
      </div>

      {list.items.length === 0 && !list.loading ? (
        <p className="text-sm text-on-surface-variant">{list.error ?? '暂无评论'}</p>
      ) : (
        <ul className="divide-y divide-outline-variant/40">
          {list.items.map((c) => (
            <li
              key={c.id}
              className={clsx('py-2.5 flex items-start gap-3', c.parentCommentId && 'pl-6')}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {c.parentCommentId && <Badge variant="outline">回复</Badge>}
                  {/* 用户侧这条是匿名显示的；审核员看到真名是为了能处置，标记提示这层差异 */}
                  {c.anonymous && <Badge variant="outline">匿名</Badge>}
                  <span className="text-sm font-medium text-on-surface">
                    {c.user.profile?.nickname || '-'}
                  </span>
                  {/* 学生会视角后端对跨校评论者脱敏 email 为 null */}
                  {c.user.email && (
                    <span className="text-xs text-on-surface-variant truncate">{c.user.email}</span>
                  )}
                </div>
                <p className="text-sm text-on-surface mt-0.5 whitespace-pre-wrap break-words">
                  {c.content}
                </p>
                {c.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.imageUrl}
                    alt=""
                    className="w-16 h-16 object-cover rounded-lg border border-outline-variant/40 mt-1.5"
                  />
                )}
                <p className="font-mono text-[10px] text-outline mt-1">{formatDateTime(c.createdAt)}</p>
              </div>
              <Button size="sm" variant="danger" className="shrink-0" onClick={() => remove.openWith(c)}>
                删除
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />

      {remove.open && remove.data && (
        <ConfirmDialog
          title="删除评论"
          danger
          confirmText="确认删除"
          message={
            <>
              确认删除「{remove.data.content.slice(0, 30)}」？
              若为父楼，其下全部回复将一并删除，不可恢复。
            </>
          }
          onConfirm={async () => {
            const res = await deletePostComment(remove.data!.id);
            toast.success(`已删除 ${res.removed} 条评论`);
            await list.refresh();
            await onChanged?.();
          }}
          onClose={remove.close}
        />
      )}
    </div>
  );
}
