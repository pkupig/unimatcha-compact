'use client';

/** 帖子查看弹窗（MOD-5）+ 帖子表格共用的作者单元格/隐藏原因工具 */
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AUTHOR_TYPE, SQUARE_BOARD, labelOf } from '@/lib/labels';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { AdminSquarePost } from '@/lib/types';
import { PostCommentsSection } from './PostCommentsSection';

/** 隐藏原因展示：举报自动隐藏优先于管理员填写的理由 */
export function hiddenNote(p: AdminSquarePost): string {
  if (p.deletedBy === 'reporter:auto') return '举报自动隐藏';
  return p.deleteReason || '';
}

/** 作者单元格：类型徽标 + 昵称/名称 + 匿名徽标（MOD-4） */
export function AuthorCell({ post }: { post: AdminSquarePost }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <StatusBadge meta={AUTHOR_TYPE} value={post.authorType} />
      <span className="text-sm text-on-surface whitespace-nowrap">
        {post.author.nickname || post.author.name || '-'}
      </span>
      {post.anonymous && <Badge variant="outline">匿名</Badge>}
    </div>
  );
}

export function PostDetailModal({
  post,
  onClose,
  onCommentsChanged,
}: {
  post: AdminSquarePost;
  onClose: () => void;
  /** 评论被删除后回调（外层刷新列表以更新 commentCount） */
  onCommentsChanged?: () => void | Promise<void>;
}) {
  // post 是打开时的列表行快照：评论区删除后头部计数改跟评论区实时 total
  const [liveCommentTotal, setLiveCommentTotal] = useState<number | null>(null);
  return (
    <Modal title={post.title || '帖子详情'} caption="POST DETAIL" size="lg" onClose={onClose}>
      <div className="space-y-4 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <AuthorCell post={post} />
          {post.isSponsored && <Badge variant="neon">Sponsored</Badge>}
          {post.isHidden ? <Badge variant="pink">已隐藏</Badge> : <Badge variant="neon">展示中</Badge>}
        </div>

        <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{post.content}</p>

        {post.images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {post.images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${src}-${i}`}
                src={src}
                alt={`图 ${i + 1}`}
                className="w-full aspect-square object-cover rounded-lg border border-outline-variant/40"
              />
            ))}
          </div>
        )}

        <div className="rounded-lg bg-surface-low p-4 space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-on-surface-variant shrink-0">板块 · 学校</span>
            <span className="text-right">
              {labelOf(SQUARE_BOARD, post.board)} · {post.school || '跨校'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-on-surface-variant shrink-0">互动 · 举报</span>
            <span className="font-mono text-xs">
              赞 {formatNumber(post.likeCount)} · 评{' '}
              {formatNumber(liveCommentTotal ?? post.commentCount)} · 举报{' '}
              {formatNumber(post.reportCount)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-on-surface-variant shrink-0">发布时间</span>
            <span className="font-mono text-xs">{formatDateTime(post.createdAt)}</span>
          </div>
          {post.isHidden && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-on-surface-variant shrink-0">下架原因</span>
              <span className="text-right">
                {hiddenNote(post) || '-'}
                {post.deletedAt && (
                  <span className="font-mono text-xs text-outline"> · {formatDateTime(post.deletedAt)}</span>
                )}
              </span>
            </div>
          )}
        </div>

        <PostCommentsSection
          postId={post.id}
          onChanged={onCommentsChanged}
          onTotal={setLiveCommentTotal}
        />
      </div>
    </Modal>
  );
}
