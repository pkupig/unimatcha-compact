'use client';

/**
 * 置顶排序 tab：学生会调整「置顶页」里信息的先后顺序。
 *
 * 用户侧的置顶帖已不再混在校园墙信息流里，而是单独一页（GET /square/v2/pinned），
 * 顺序完全由这里决定 —— 所以这一页不是锦上添花，是置顶功能的必要一半。
 *
 * 提交契约与问卷题目排序一致：传【完整的有序 id 列表】，后端按下标重写 pinnedOrder。
 * 不做「上移一格就发一次请求」——那样两人同时调会互相覆盖成乱序；这里本地先排好、
 * 一次性保存，后端还会校验列表必须恰好等于本校当前的全部置顶帖。
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { listSquarePosts, reorderPinnedPosts } from '@/lib/api/moderation';
import type { AdminSquarePost } from '@/lib/types/moderation';

export function PinnedOrderPanel({ team }: { team: boolean }) {
  const [items, setItems] = useState<AdminSquarePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 后端按 pinnedOrder 排；这里只取校园墙帖（只有它们能置顶）
      const res = await listSquarePosts({ board: 'CAMPUS_WALL', page: 1, limit: 50 });
      setItems(res.items.filter((p) => !!p.pinnedAt));
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const move = (index: number, delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= items.length) return;
    const copy = [...items];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    setItems(copy);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await reorderPinnedPosts(items.map((p) => p.id));
      toast.success('顺序已保存');
      setDirty(false);
    } catch (e) {
      // 常见失败：有人同时改了置顶，列表已经对不上 —— 重新拉一次而不是把旧序留在屏幕上
      toast.error(e instanceof Error ? e.message : '保存失败');
      void load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  if (!items.length) {
    return (
      <EmptyState
        text={
          team
            ? '还没有置顶内容。在「帖子管理」里置顶校园墙帖后，会出现在这里排序'
            : '还没有置顶内容。在「帖子管理」里置顶本校校园墙帖后，会出现在这里排序'
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-on-surface-variant">
          用户在广场「置顶」页看到的就是这个顺序，从上到下。活动帖同时仍留在校园墙上。
        </p>
        <Button variant="primary" size="sm" disabled={!dirty || saving} onClick={save}>
          <Save size={14} /> {saving ? '保存中…' : '保存顺序'}
        </Button>
      </div>
      <Card>
        <ul className="divide-y divide-outline-variant/20">
          {items.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <span className="w-6 shrink-0 text-center text-xs font-bold text-on-surface-variant">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium text-on-surface truncate">
                    {p.title || p.content?.slice(0, 40) || '(无标题)'}
                  </span>
                  {p.postType === 'event' && <Badge variant="outline">活动</Badge>}
                  {team && p.school && <Badge variant="outline">{p.school}</Badge>}
                </div>
                {p.title && (
                  <p className="text-xs text-on-surface-variant truncate mt-0.5">
                    {p.content?.slice(0, 60)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title="上移"
                  disabled={i === 0 || saving}
                  onClick={() => move(i, -1)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  title="下移"
                  disabled={i === items.length - 1 || saving}
                  onClick={() => move(i, 1)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
