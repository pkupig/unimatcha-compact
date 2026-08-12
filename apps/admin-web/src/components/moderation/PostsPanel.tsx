'use client';

/**
 * 帖子管理 / 举报队列共用面板（MOD-2/3/4/6）：
 * 同一组件传 reported=true 即为举报队列（后端 reported 预筛 + 多一个「清除举报」操作）。
 */
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { Pager } from '@/components/ui/Pager';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/form';
import { useDebounced } from '@/hooks/useDebounced';
import { useModal } from '@/hooks/useModal';
import { usePagedList } from '@/hooks/usePagedList';
import {
  dismissSquarePostReports,
  listSquarePosts,
  pinSquarePost,
  purgeSquarePost,
  restoreSquarePost,
  takedownSquarePost,
} from '@/lib/api/moderation';
import { formatDate, formatNumber } from '@/lib/format';
import { SQUARE_BOARD, labelOf } from '@/lib/labels';
import { toastError } from '@/lib/toast';
import type { AdminSquarePost, SquareBoardValue } from '@/lib/types';
import { EditOfficialPostModal } from './EditOfficialPostModal';
import { AuthorCell, PostDetailModal, hiddenNote } from './PostDetailModal';

interface PostsFilters {
  board: '' | SquareBoardValue;
  status: '' | 'visible' | 'hidden';
  school: string;
}

export function PostsPanel({ reported = false, team }: { reported?: boolean; team: boolean }) {
  const list = usePagedList<AdminSquarePost, PostsFilters>({
    fetcher: (q) =>
      listSquarePosts({
        board: q.board || undefined,
        status: q.status || undefined,
        // 学校筛选仅团队视角有意义（学生会后端强制本校）
        school: (team && q.school) || undefined,
        reported: reported || undefined,
        search: q.search,
        page: q.page,
        limit: q.limit,
      }),
    initialFilters: { board: '', status: '', school: '' },
  });

  // 学校文本筛选走本地防抖再落 filters（usePagedList 只内置 search 的防抖）
  const [schoolInput, setSchoolInput] = useState('');
  const debouncedSchool = useDebounced(schoolInput.trim(), 400);
  const { setFilter } = list;
  const prevSchoolRef = useRef('');
  useEffect(() => {
    if (prevSchoolRef.current === debouncedSchool) return;
    prevSchoolRef.current = debouncedSchool;
    setFilter('school', debouncedSchool);
  }, [debouncedSchool, setFilter]);

  const view = useModal<AdminSquarePost>();
  const takedown = useModal<AdminSquarePost>();
  const restore = useModal<AdminSquarePost>();
  const dismiss = useModal<AdminSquarePost>();
  const edit = useModal<AdminSquarePost>();
  const purge = useModal<AdminSquarePost>();

  // 置顶为行内即时动作（无确认弹窗），busy 态按行隔离
  const [pinningId, setPinningId] = useState<string | null>(null);
  const togglePin = async (p: AdminSquarePost) => {
    setPinningId(p.id);
    try {
      await pinSquarePost(p.id, !p.pinnedAt);
      toast.success(p.pinnedAt ? '已取消置顶' : '已置顶');
      await list.refresh();
    } catch (e) {
      toastError(e);
    } finally {
      setPinningId(null);
    }
  };

  const columns: Column<AdminSquarePost>[] = [
    {
      key: 'content',
      header: '内容',
      render: (p) => (
        <div className="max-w-[240px]">
          {(p.pinnedAt || p.title) && (
            <div className="flex items-center gap-1.5 min-w-0">
              {p.pinnedAt && <Badge variant="ink">置顶</Badge>}
              {p.title && <p className="font-bold text-on-surface truncate">{p.title}</p>}
            </div>
          )}
          <p className="text-xs text-on-surface-variant truncate">{p.content}</p>
          {p.images.length > 0 && (
            <p className="text-[10px] font-mono text-outline mt-0.5">图 x{p.images.length}</p>
          )}
        </div>
      ),
    },
    { key: 'author', header: '作者', render: (p) => <AuthorCell post={p} /> },
    {
      key: 'school',
      header: '学校',
      render: (p) => (
        <span className="text-sm whitespace-nowrap">
          {p.school || <span className="text-on-surface-variant">跨校</span>}
        </span>
      ),
    },
    {
      key: 'board',
      header: '板块',
      render: (p) => <span className="text-sm whitespace-nowrap">{labelOf(SQUARE_BOARD, p.board)}</span>,
    },
    {
      key: 'stats',
      header: '互动',
      render: (p) => (
        <span className="font-mono text-xs whitespace-nowrap text-on-surface-variant">
          赞 {formatNumber(p.likeCount)} · 评 {formatNumber(p.commentCount)}
        </span>
      ),
    },
    {
      key: 'reports',
      header: '举报',
      render: (p) =>
        p.reportCount > 0 ? <Badge variant="pink">{p.reportCount}</Badge> : <span className="text-outline">-</span>,
    },
    {
      key: 'status',
      header: '状态',
      render: (p) =>
        p.isHidden ? (
          <div>
            <Badge variant="pink">已隐藏</Badge>
            {hiddenNote(p) && (
              <p className="text-[10px] text-outline mt-1 max-w-[140px] truncate" title={hiddenNote(p)}>
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
      header: '时间',
      render: (p) => (
        <span className="font-mono text-xs text-on-surface-variant whitespace-nowrap">{formatDate(p.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (p) => (
        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
          <Button size="sm" onClick={() => view.openWith(p)}>查看</Button>
          {reported && (
            <Button size="sm" onClick={() => dismiss.openWith(p)}>清除举报</Button>
          )}
          {p.board === 'CAMPUS_WALL' && (
            <Button size="sm" loading={pinningId === p.id} onClick={() => void togglePin(p)}>
              {p.pinnedAt ? '取消置顶' : '置顶'}
            </Button>
          )}
          {/* 官方帖可编辑（作者归属前端不可知，非作者由后端 403 兜底）；活动帖后端 400 → 不给入口 */}
          {p.authorType !== 'USER' && p.postType !== 'event' && (
            <Button size="sm" onClick={() => edit.openWith(p)}>编辑</Button>
          )}
          {p.isHidden ? (
            <Button size="sm" variant="primary" onClick={() => restore.openWith(p)}>恢复</Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => takedown.openWith(p)}>下架</Button>
          )}
          {p.postType !== 'event' && (
            <Button size="sm" variant="danger" onClick={() => purge.openWith(p)}>彻底删除</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="w-36">
          <Select value={list.filters.board} onChange={(e) => list.setFilter('board', e.target.value as PostsFilters['board'])}>
            <option value="">全部板块</option>
            <option value="RECOMMEND">{SQUARE_BOARD.labels.RECOMMEND}</option>
            <option value="CAMPUS_WALL">{SQUARE_BOARD.labels.CAMPUS_WALL}</option>
          </Select>
        </div>
        <div className="w-36">
          <Select value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value as PostsFilters['status'])}>
            <option value="">全部状态</option>
            <option value="visible">展示中</option>
            <option value="hidden">已隐藏</option>
          </Select>
        </div>
        {team && (
          <div className="w-56">
            <Input
              value={schoolInput}
              onChange={(e) => setSchoolInput(e.target.value)}
              placeholder="按学校名筛选，留空为全部"
            />
          </div>
        )}
        <FilterBar.Search value={list.search} onChange={list.setSearch} placeholder="搜索标题 / 内容关键词" />
      </FilterBar>

      <Card flush>
        <DataTable<AdminSquarePost>
          columns={columns}
          rows={list.items}
          rowKey={(p) => p.id}
          loading={list.loading}
          error={list.error}
          empty={reported ? '暂无被举报的帖子' : '暂无帖子，调整筛选条件后重试'}
        />
      </Card>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />

      {view.open && view.data && (
        <PostDetailModal post={view.data} onClose={view.close} onCommentsChanged={list.refresh} />
      )}

      {edit.open && edit.data && (
        <EditOfficialPostModal post={edit.data} onClose={edit.close} onSaved={list.refresh} />
      )}

      {purge.open && purge.data && (
        <ConfirmDialog
          title="彻底删除帖子"
          danger
          confirmText="确认彻底删除"
          message={
            <>
              确认彻底删除「{purge.data.title || purge.data.content.slice(0, 20)}」？
              此操作不可恢复，帖子的评论与点赞将一并删除。
            </>
          }
          onConfirm={async () => {
            await purgeSquarePost(purge.data!.id);
            toast.success('帖子已彻底删除');
            await list.refresh();
          }}
          onClose={purge.close}
        />
      )}

      {takedown.open && takedown.data && (
        <ConfirmDialog
          title="下架帖子"
          danger
          requireReason
          reasonLabel="下架原因"
          confirmText="确认下架"
          message={
            <>
              下架后「{takedown.data.title || takedown.data.content.slice(0, 20)}」对用户不可见，可随时恢复展示。
            </>
          }
          onConfirm={async (reason) => {
            await takedownSquarePost(takedown.data!.id, reason ?? '');
            toast.success('帖子已下架');
            await list.refresh();
          }}
          onClose={takedown.close}
        />
      )}

      {restore.open && restore.data && (
        <ConfirmDialog
          title="恢复展示"
          confirmText="确认恢复"
          message={
            <>
              确认恢复「{restore.data.title || restore.data.content.slice(0, 20)}」的展示？
              将清除下架记录，该帖重新对用户可见。
            </>
          }
          onConfirm={async () => {
            await restoreSquarePost(restore.data!.id);
            toast.success('帖子已恢复展示');
            await list.refresh();
          }}
          onClose={restore.close}
        />
      )}

      {dismiss.open && dismiss.data && (
        <ConfirmDialog
          title="清除举报"
          confirmText="确认清除"
          message="清除该帖的所有举报记录？若为举报自动隐藏将同时恢复展示。"
          onConfirm={async () => {
            await dismissSquarePostReports(dismiss.data!.id);
            toast.success('举报记录已清除');
            await list.refresh();
          }}
          onClose={dismiss.close}
        />
      )}
    </div>
  );
}
