'use client';

/** /partners/[id] — 洽谈线程详情（meta 头卡 + 消息流，装配在 ThreadDetailView） */
import { ThreadDetailView } from '@/components/partners/ThreadDetailView';

export default function PartnerThreadPage({ params }: { params: { id: string } }) {
  return <ThreadDetailView id={params.id} />;
}
