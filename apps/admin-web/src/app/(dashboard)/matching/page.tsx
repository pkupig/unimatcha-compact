'use client';

/**
 * 匹配管理（SUPER/TEAM，路由守卫由全局 Guard 处理）：
 * 匹配计划卡 + 手动触发（依次两模式）+ 近期任务表（最近 10 条）。
 */
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useModal } from '@/hooks/useModal';
import { usePagedList } from '@/hooks/usePagedList';
import { getMatchConfig, listMatchJobs } from '@/lib/api/matching';
import { toastError } from '@/lib/toast';
import type { MatchConfig, MatchJobRow } from '@/lib/types';
import { MatchPlanCard } from '@/components/matching/MatchPlanCard';
import { MatchConfigModal } from '@/components/matching/MatchConfigModal';
import { TriggerMatchButton } from '@/components/matching/TriggerMatchButton';
import { MatchJobsCard } from '@/components/matching/MatchJobsCard';

export default function MatchingPage() {
  const [config, setConfig] = useState<MatchConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const edit = useModal();

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await getMatchConfig());
    } catch (e) {
      toastError(e);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // 近期任务固定取第 1 页 10 条（契约已统一 items 键，直接透传）
  const jobs = usePagedList<MatchJobRow, Record<string, never>>({
    fetcher: ({ page, limit }) => listMatchJobs({ page, limit }),
    initialFilters: {},
    limit: 10,
  });

  return (
    <>
      <PageHeader
        caption="Matching"
        title="匹配"
        sub="匹配计划与任务运行状况"
        actions={<TriggerMatchButton onTriggered={() => void jobs.refresh()} />}
      />

      <MatchPlanCard config={config} loading={configLoading} onEdit={edit.openEmpty} />

      <MatchJobsCard
        rows={jobs.items}
        loading={jobs.loading}
        error={jobs.error}
        onRefresh={() => void jobs.refresh()}
      />

      {edit.open && (
        <MatchConfigModal
          config={config}
          onClose={edit.close}
          onSaved={() => {
            edit.close();
            void loadConfig();
          }}
        />
      )}
    </>
  );
}
