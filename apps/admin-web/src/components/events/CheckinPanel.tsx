'use client';

/**
 * EVT-1 入场核销条（页面顶部常驻）：票码回车或按钮核销。
 * 成功显示绿色行「核销成功：活动 · 持票人」，失败显示后端原因（粉色行）；
 * 结果行持续展示到下一次核销——现场连续扫码时能看清上一张的结果。
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, QrCode, ScanLine } from 'lucide-react';
import { checkinTicket } from '@/lib/api/events';
import { ApiError } from '@/lib/api/client';
import { toastError } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/form';
import { ScanCheckinModal } from './ScanCheckinModal';

export function CheckinPanel({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const submit = async () => {
    if (busy) return;
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error('请输入票码');
      return;
    }
    setBusy(true);
    try {
      const res = await checkinTicket(trimmed);
      setResult({ ok: true, message: `核销成功：${res.event} · ${res.holder}` });
      toast.success('核销成功');
      setCode('');
      // 核销会改变名单里的状态/核销时间，顺手刷新列表
      onDone();
    } catch (e) {
      setResult({ ok: false, message: e instanceof ApiError ? e.message : '核销失败，请稍后重试' });
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <ScanLine size={16} className="text-outline" />
            <span className="label mb-0">入场核销</span>
          </div>
          <Input
            className="font-mono flex-1"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="输入票码后回车核销（UMT-XXXXXXXXXX）"
            disabled={busy}
          />
          <Button variant="primary" size="sm" className="shrink-0" loading={busy} onClick={() => void submit()}>
            核销
          </Button>
          <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setScanOpen(true)}>
            <QrCode size={15} />
            扫码核销
          </Button>
        </div>
        {result && (
          <div
            className={clsx(
              'flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-sm',
              result.ok ? 'bg-neon/15 text-ink' : 'bg-neon-pink/10 text-neon-pink',
            )}
          >
            {result.ok ? (
              <CheckCircle2 size={15} className="shrink-0" />
            ) : (
              <AlertTriangle size={15} className="shrink-0" />
            )}
            <span className="truncate">{result.message}</span>
          </div>
        )}
      </Card>
      {scanOpen && <ScanCheckinModal onDone={onDone} onClose={() => setScanOpen(false)} />}
    </>
  );
}
