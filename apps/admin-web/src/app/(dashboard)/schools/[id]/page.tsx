'use client';

/**
 * 学校详情（SUPER/TEAM）：统计 4 卡 + 基本信息 / 分成配置 / 计价覆盖 / 银行账户四卡。
 * 变更响应为裸行（无 stats），合并时保留已加载的统计。
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api/client';
import { getPricingDefaults, getSchool } from '@/lib/api/schools';
import type { AdPricingDefaults, School } from '@/lib/types';
import { SchoolStatsCards } from '@/components/schools/SchoolStatsCards';
import { SchoolBasicForm } from '@/components/schools/SchoolBasicForm';
import { SchoolShareForm } from '@/components/schools/SchoolShareForm';
import { SchoolPricingForm } from '@/components/schools/SchoolPricingForm';
import { SchoolBankCard } from '@/components/schools/SchoolBankCard';

export default function SchoolDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [school, setSchool] = useState<School | null>(null);
  const [defaults, setDefaults] = useState<AdPricingDefaults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // 计价默认值供覆盖表单 hint 展示（学校未覆盖时的回落值）
      const [s, d] = await Promise.all([getSchool(params.id), getPricingDefaults()]);
      setSchool(s);
      setDefaults(d);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '学校详情加载失败');
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // 变更成功后的合并：update/bank 响应无 stats，保留已加载统计
  const applySaved = useCallback((updated: School) => {
    setSchool((prev) => ({ ...updated, stats: prev?.stats }));
  }, []);

  if (error && !school) {
    return (
      <EmptyState
        text={error}
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            重试
          </Button>
        }
      />
    );
  }
  if (!school) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        caption="School Detail"
        title={school.name}
        sub={school.city || '—'}
        actions={
          <>
            <Badge variant={school.isActive ? 'neon' : 'pink'}>
              {school.isActive ? '启用' : '停用'}
            </Badge>
            <Button variant="secondary" size="sm" onClick={() => router.push('/schools')}>
              <ArrowLeft size={14} />
              返回列表
            </Button>
          </>
        }
      />

      <SchoolStatsCards stats={school.stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SchoolBasicForm school={school} onSaved={applySaved} />
        <SchoolShareForm school={school} onSaved={applySaved} />
        <SchoolPricingForm school={school} defaults={defaults} onSaved={applySaved} />
        <SchoolBankCard school={school} onSaved={applySaved} />
      </div>
    </>
  );
}
