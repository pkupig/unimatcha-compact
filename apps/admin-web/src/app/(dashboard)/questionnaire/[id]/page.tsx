'use client';

/** 问卷版本题目管理（SUPER/TEAM）：题目卡片流 + 增删改排/启停（QSTD-1~5） */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { QuestionListPanel } from '@/components/questionnaire/QuestionListPanel';
import { QUESTIONNAIRE_TYPE } from '@/lib/labels';
import { toastError } from '@/lib/toast';
import { getQuestionnaireVersion } from '@/lib/api/questionnaire';
import type { QuestionnaireVersionDetail } from '@/lib/types';

export default function QuestionnaireDetailPage({ params }: { params: { id: string } }) {
  const [version, setVersion] = useState<QuestionnaireVersionDetail | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setVersion(await getQuestionnaireVersion(params.id));
      setFailed(false);
    } catch (e) {
      toastError(e);
      setFailed(true);
    }
  }, [params.id]);
  useEffect(() => { void load(); }, [load]);

  // 首次加载失败给重试入口；已有数据时的刷新失败仅 toast，保留旧画面
  if (version === null) {
    if (failed) {
      return (
        <EmptyState
          text="问卷版本加载失败"
          action={<Button size="sm" onClick={() => void load()}>重试</Button>}
        />
      );
    }
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  return (
    <>
      <div className="flex items-start gap-3">
        <Link
          href="/questionnaire"
          aria-label="返回问卷列表"
          className="p-1.5 mt-1 rounded-lg text-on-surface-variant hover:bg-surface-low hover:text-ink transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <PageHeader
            title={version.title}
            caption="Questionnaire / Questions"
            sub={
              <span className="inline-flex items-center gap-2">
                <Badge variant="outline">V{version.version}</Badge>
                <StatusBadge meta={QUESTIONNAIRE_TYPE} value={version.type} />
                {version.isActive && <Badge variant="neon">当前版本</Badge>}
              </span>
            }
          />
        </div>
      </div>

      <QuestionListPanel version={version} onChanged={() => void load()} />
    </>
  );
}
