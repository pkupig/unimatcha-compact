'use client';

/** FIN-5 赞助发放 tab：发放表单（实时入账预览 + ConfirmDialog）+ 所选学校 SPONSOR_GRANT 流水 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { createGrant } from '@/lib/api/finance';
import { toastError } from '@/lib/toast';
import { yuanToCents } from '@/lib/format';
import { useModal } from '@/hooks/useModal';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Money } from '@/components/ui/Money';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SchoolLedgerCard, useSchoolOptions } from './shared';

export function GrantsTab() {
  const { schools, loading: schoolsLoading } = useSchoolOptions();
  const [schoolId, setSchoolId] = useState('');
  const [amountYuan, setAmountYuan] = useState('');
  const [note, setNote] = useState('');
  // 自增触发下方流水卡重拉（发放成功后回显）
  const [refreshKey, setRefreshKey] = useState(0);
  const confirm = useModal();

  // 实时入账预览：元 → 分（0 或非法输入均视为未填，后端 Min(1)）
  const amountCents = yuanToCents(amountYuan);
  const validAmount = amountCents !== null && amountCents > 0;
  const selectedSchool = schools.find((s) => s.id === schoolId);

  const openConfirm = () => {
    if (!schoolId) {
      toastError(new Error(), '请选择学校');
      return;
    }
    if (!validAmount) {
      toastError(new Error(), '请输入有效的发放金额');
      return;
    }
    confirm.openEmpty();
  };

  return (
    <div className="space-y-4">
      <Card caption="SPONSOR GRANT" title="发放赞助额度">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="学校" required>
            <Select
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
              disabled={schoolsLoading}
            >
              <option value="">{schoolsLoading ? '加载中…' : '请选择学校'}</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isActive ? '' : '（已停用）'}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="金额（元）"
            required
            hint={
              validAmount ? (
                <>
                  入账 <Money cents={amountCents} />
                </>
              ) : (
                '以元填写，入账时按分记录'
              )
            }
          >
            <Input
              type="number"
              min={0.01}
              step={0.01}
              inputMode="decimal"
              className="font-mono"
              placeholder="0.00"
              value={amountYuan}
              onChange={(e) => setAmountYuan(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="备注">
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="选填，例如：2026 秋季迎新活动赞助"
              />
            </Field>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="cta" onClick={openConfirm}>
            发放赞助
          </Button>
        </div>
      </Card>

      <SchoolLedgerCard
        schoolId={schoolId}
        type="SPONSOR_GRANT"
        caption="GRANT HISTORY"
        title={selectedSchool ? `发放记录 · ${selectedSchool.name}` : '发放记录'}
        refreshKey={refreshKey}
        emptyText="该校暂无发放记录"
      />

      {confirm.open && (
        <ConfirmDialog
          title="确认发放"
          message={
            <>
              确认向「{selectedSchool?.name ?? '所选学校'}」发放赞助{' '}
              <Money cents={amountCents} className="font-bold text-on-surface" />
              ？金额将立即计入该校余额。
            </>
          }
          confirmText="确认发放"
          onConfirm={async () => {
            if (!schoolId || amountCents === null) return;
            await createGrant({ schoolId, amountCents, note: note.trim() || undefined });
            toast.success('赞助已发放');
            setAmountYuan('');
            setNote('');
            setRefreshKey((k) => k + 1);
          }}
          onClose={confirm.close}
        />
      )}
    </div>
  );
}
