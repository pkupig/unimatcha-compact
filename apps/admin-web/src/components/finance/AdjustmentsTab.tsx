'use client';

/** FIN-7 手工调整 tab（新增 UI，后端 POST /admin/finance/adjustments 早已存在）：
 *  带符号金额（正=补入、负=扣减，非 0）+ 理由必填 + 所选学校 ADJUSTMENT 流水 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { createAdjustment } from '@/lib/api/finance';
import { toastError } from '@/lib/toast';
import { yuanToCents } from '@/lib/format';
import { useModal } from '@/hooks/useModal';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Money } from '@/components/ui/Money';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SchoolLedgerCard, useSchoolOptions } from './shared';

/** 带符号 元→分：yuanToCents 只收非负，这里剥出符号后复用（不另写转换，保持全站唯一实现） */
function signedYuanToCents(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const negative = t.startsWith('-');
  const cents = yuanToCents(negative ? t.slice(1) : t);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

export function AdjustmentsTab() {
  const { schools, loading: schoolsLoading } = useSchoolOptions();
  const [schoolId, setSchoolId] = useState('');
  const [amountYuan, setAmountYuan] = useState('');
  const [note, setNote] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const confirm = useModal();

  const amountCents = signedYuanToCents(amountYuan);
  // 后端 NotEquals(0)：0 视为无效
  const validAmount = amountCents !== null && amountCents !== 0;
  const selectedSchool = schools.find((s) => s.id === schoolId);

  const openConfirm = () => {
    if (!schoolId) {
      toastError(new Error(), '请选择学校');
      return;
    }
    if (!validAmount) {
      toastError(new Error(), '请输入有效的调整金额（正负均可，不能为 0）');
      return;
    }
    if (!note.trim()) {
      toastError(new Error(), '请填写调整原因');
      return;
    }
    confirm.openEmpty();
  };

  return (
    <div className="space-y-4">
      <Card caption="MANUAL ADJUSTMENT" title="手工调整">
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
            label="调整金额（元，带符号）"
            required
            hint={
              validAmount ? (
                <>
                  入账 <Money cents={amountCents} signed />
                </>
              ) : (
                '正数补入余额，负数扣减余额；不能为 0'
              )
            }
          >
            <Input
              type="number"
              step={0.01}
              inputMode="decimal"
              className="font-mono"
              placeholder="如 100 或 -50"
              value={amountYuan}
              onChange={(e) => setAmountYuan(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="调整原因" required hint="必填留痕，将写入流水备注">
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="必填，例如：线下活动费用补记 / 误发赞助冲正"
              />
            </Field>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={openConfirm}>
            提交调整
          </Button>
        </div>
      </Card>

      <SchoolLedgerCard
        schoolId={schoolId}
        type="ADJUSTMENT"
        caption="ADJUSTMENT HISTORY"
        title={selectedSchool ? `调整记录 · ${selectedSchool.name}` : '调整记录'}
        refreshKey={refreshKey}
        emptyText="该校暂无调整记录"
      />

      {confirm.open && (
        <ConfirmDialog
          title="确认手工调整"
          danger={amountCents !== null && amountCents < 0}
          message={
            <>
              确认对「{selectedSchool?.name ?? '所选学校'}」执行手工调整{' '}
              <Money cents={amountCents} signed className="text-on-surface" />
              ？将写入 ADJUSTMENT 流水并直接影响该校余额。
            </>
          }
          confirmText="确认调整"
          onConfirm={async () => {
            if (!schoolId || amountCents === null) return;
            await createAdjustment({ schoolId, amountCents, note: note.trim() });
            toast.success('调整已入账');
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
