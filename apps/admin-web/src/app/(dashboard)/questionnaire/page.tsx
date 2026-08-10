'use client';

/** 问卷版本列表（SUPER/TEAM）：卡片流 + 新建/发布（QST-1/QST-2） */
import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { VersionCard } from '@/components/questionnaire/VersionCard';
import { CreateVersionModal } from '@/components/questionnaire/CreateVersionModal';
import { PublishVersionDialog } from '@/components/questionnaire/PublishVersionDialog';
import { useModal } from '@/hooks/useModal';
import { toastError } from '@/lib/toast';
import { listQuestionnaireVersions } from '@/lib/api/questionnaire';
import type { QuestionnaireVersion } from '@/lib/types';

export default function QuestionnairePage() {
  // 非分页端点（版本数有限），不走 usePagedList，本地一次拉全
  const [versions, setVersions] = useState<QuestionnaireVersion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const create = useModal();
  const publish = useModal<QuestionnaireVersion>();

  const load = useCallback(async () => {
    try {
      setVersions(await listQuestionnaireVersions());
      setFailed(false);
    } catch (e) {
      toastError(e);
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHeader
        title="问卷管理"
        caption="Questionnaire"
        sub="恋爱 / 朋友两条版本线独立发布，每类型至多一个激活版本"
        actions={
          <Button variant="cta" onClick={create.openEmpty}>
            <Plus size={15} /> 新建版本
          </Button>
        }
      />

      {versions === null && !failed && (
        <div className="flex justify-center py-16"><Spinner /></div>
      )}
      {versions === null && failed && (
        <EmptyState
          text="问卷列表加载失败"
          action={<Button size="sm" onClick={() => void load()}>重试</Button>}
        />
      )}
      {versions !== null && versions.length === 0 && (
        <EmptyState icon={ClipboardList} text="还没有问卷版本，点右上角「新建版本」开始" />
      )}
      {versions !== null && versions.length > 0 && (
        <div className="space-y-3">
          {versions.map((v) => (
            <VersionCard key={v.id} version={v} onPublish={publish.openWith} />
          ))}
        </div>
      )}

      {create.open && <CreateVersionModal onClose={create.close} onDone={() => void load()} />}
      {publish.open && publish.data && (
        <PublishVersionDialog version={publish.data} onClose={publish.close} onDone={() => void load()} />
      )}
    </>
  );
}
