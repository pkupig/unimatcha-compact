'use client';

import { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { triggerMatchJob } from '@/lib/api/matching';
import { toastError } from '@/lib/toast';
import type { MatchTriggerMode } from '@/lib/types';

/**
 * MAT-2：手动触发按钮——依次触发 romantic → friend 两种模式。
 * 后端单次调用只跑一个池（缺省 romantic），漏调 friend 会让朋友池永不执行，
 * 这个「两连发」语义必须保真；单模式失败（如该池已有任务在运行）不阻断另一模式。
 */
export function TriggerMatchButton({ onTriggered }: { onTriggered: () => void }) {
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时清掉延时刷新（避免离开页面后仍触发上层 refresh）
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const trigger = async () => {
    setBusy(true);
    let ok = 0;
    for (const mode of ['romantic', 'friend'] as MatchTriggerMode[]) {
      try {
        await triggerMatchJob(mode);
        ok += 1;
      } catch (e) {
        // 失败原因逐条弹出（后端消息已区分恋人/朋友模式）
        toastError(e);
      }
    }
    if (ok === 2) toast.success('已触发恋爱 + 朋友两个匹配任务');
    else if (ok === 1) toast.success('已触发 1 个匹配任务');
    setBusy(false);
    if (ok > 0) {
      onTriggered();
      // 延时再刷一次：让任务状态从「排队中」翻到「运行中/已完成」
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onTriggered, 2000);
    }
  };

  return (
    <Button variant="cta" loading={busy} onClick={() => void trigger()}>
      <Zap size={16} />
      手动触发匹配
    </Button>
  );
}
