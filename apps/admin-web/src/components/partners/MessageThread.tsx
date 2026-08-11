'use client';

/**
 * 消息流 + 回复框（三角色共用；平台只读）。
 * 分页方案（自选简洁取舍）：消息按 createdAt 正序分页且只会尾部追加——页边界永远稳定。
 * 首载先拉第 1 页拿 total 定位最后一页并展示最新一页（total>一页时多一次请求，换取实现简单）；
 * 「加载更早」向前翻页 prepend。发送成功不整页重拉：POST 返回权威行直接尾插。
 * 读取副作用：服务端对当事侧读取即清零未读，故每次首载后 refresh 未读角标同步侧栏。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/form';
import {
  listThreadMessages,
  postThreadMessage,
  type PartnerMessage,
  type ThreadSide,
} from '@/lib/api/partners';
import { ApiError } from '@/lib/api/client';
import { useAdmin } from '@/lib/auth-context';
import { isSponsor, isUnion } from '@/lib/auth';
import { usePartnersUnread } from '@/components/layout/PartnersUnreadProvider';
import { THREAD_SIDE, labelOf } from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import { toastError } from '@/lib/toast';

const PAGE_SIZE = 50;

function MessageBubble({ message, own }: { message: PartnerMessage; own: boolean }) {
  return (
    <div className={clsx('flex flex-col gap-1', own ? 'items-end' : 'items-start')}>
      <p className="text-[11px] text-on-surface-variant">
        {labelOf(THREAD_SIDE, message.senderSide)} · {message.senderAdmin.name} ·{' '}
        {formatDateTime(message.createdAt)}
      </p>
      <div
        className={clsx(
          'max-w-[78%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words',
          own ? 'bg-ink text-white' : 'bg-surface-high text-on-surface',
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

export function MessageThread({ threadId }: { threadId: string }) {
  const { admin } = useAdmin();
  // 只取 refresh（稳定引用）：依赖整个 context 会因 count 变化误触发消息重拉
  const { refresh: refreshUnread } = usePartnersUnread();

  // 本侧判定：广告商视角 SPONSOR 为己方 / 学生会视角 UNION；平台无己方（全部左对齐、只读）
  const mySide: ThreadSide | null = isSponsor(admin?.role)
    ? 'SPONSOR'
    : isUnion(admin?.role)
      ? 'UNION'
      : null;
  const canReply = mySide !== null;

  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [earliestPage, setEarliestPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const first = await listThreadMessages(threadId, { page: 1, limit: PAGE_SIZE });
      const lastPage = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
      const latest =
        lastPage === 1 ? first : await listThreadMessages(threadId, { page: lastPage, limit: PAGE_SIZE });
      setMessages(latest.items);
      setEarliestPage(lastPage);
      // 读取已在服务端清零本侧未读，立即同步侧栏角标
      void refreshUnread();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '加载消息失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [threadId, refreshUnread]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const loadEarlier = async () => {
    if (earliestPage <= 1 || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const prev = await listThreadMessages(threadId, { page: earliestPage - 1, limit: PAGE_SIZE });
      setMessages((cur) => [...prev.items, ...cur]);
      setEarliestPage((p) => p - 1);
    } catch (e) {
      toastError(e, '加载更早消息失败');
    } finally {
      setLoadingEarlier(false);
    }
  };

  const send = async () => {
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const msg = await postThreadMessage(threadId, text);
      // 正序尾插不破坏已加载页的边界；返回行即权威数据，无需整页重拉
      setMessages((cur) => [...cur, msg]);
      setContent('');
      void refreshUnread();
    } catch (e) {
      toastError(e);
    } finally {
      setSending(false);
    }
  };

  // 尾部出现新消息（首载/发送）滚到底；「加载更早」prepend 时尾部 id 不变，不误滚
  const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <Card flush>
      <div ref={scrollRef} className="max-h-[56vh] min-h-[240px] overflow-y-auto px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState text={error} />
        ) : (
          <>
            {earliestPage > 1 && (
              <div className="flex justify-center">
                <Button size="sm" variant="ghost" loading={loadingEarlier} onClick={() => void loadEarlier()}>
                  加载更早的消息
                </Button>
              </div>
            )}
            {messages.length === 0 ? (
              <EmptyState text="暂无消息" />
            ) : (
              messages.map((m) => (
                <MessageBubble key={m.id} message={m} own={mySide !== null && m.senderSide === mySide} />
              ))
            )}
          </>
        )}
      </div>

      <div className="border-t border-outline-variant/40 px-5 py-4">
        {canReply ? (
          <div className="flex items-end gap-3">
            <Textarea
              className="flex-1 resize-none"
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={2000}
              placeholder="输入消息（最长 2000 字）"
              disabled={sending}
            />
            <Button variant="primary" loading={sending} disabled={!content.trim()} onClick={() => void send()}>
              <Send size={15} />
              发送
            </Button>
          </div>
        ) : (
          <p className="text-xs text-on-surface-variant text-center">
            平台只读监管 · 仅广告商与学生会双方可发言
          </p>
        )}
      </div>
    </Card>
  );
}
