'use client';

/** 占位：三角色仪表盘在各域完成后最后实现（消费全部深链与统计） */
import { useAdmin } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';

export default function DashboardPage() {
  const { admin } = useAdmin();
  return (
    <>
      <PageHeader title="总览" caption="Overview" />
      <Card>
        <p className="text-sm text-on-surface-variant">
          你好，{admin?.name}。仪表盘正在重建中。
        </p>
      </Card>
    </>
  );
}
