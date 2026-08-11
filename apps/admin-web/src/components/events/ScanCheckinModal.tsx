'use client';

/**
 * EVT-6 摄像头扫码核销弹窗：jsQR 逐帧解码（约 160ms 一帧，最长边降采样到 640px 控制耗时）。
 * 关键约束：
 * - 取流 effect 必须耐受 StrictMode 双执行：cleanup 停旧流；异步取流返回后发现已 cleanup 立即 stop；
 * - 现场二维码会连续多帧命中：按「离框重臂」去重——码持续在框内只触发一次（在框存在性
 *   每帧刷新，含 busy/暂停期间），移开 ≥REARM_MS 再对准才重新提交；命中后暂停 1.2s 让操作员看清结果行；
 * - torch 是 Chrome/Android 非标准能力（未进 TS DOM lib），能力探测到才渲染开关；
 * - 蜂鸣走 WebAudio 懒建单例（自动播放策略可能拦截，全程静默兜底）。
 */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import jsQR from 'jsqr';
import { AlertTriangle, CameraOff, CheckCircle2, Flashlight, FlashlightOff } from 'lucide-react';
import { checkinTicket, listEvents } from '@/lib/api/events';
import { ApiError } from '@/lib/api/client';
import type { AdminEvent } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/form';

const DECODE_INTERVAL_MS = 160;
/**
 * 同码重新触发所需的「离框」时长：持续在取景框内的码只提交一次（不会反复刷
 * 「该票已核销」红行）；移开后再出示视为重新核验——已核销票能再次给出红色警示。
 */
const REARM_MS = 2000;
/** 票码形状（UMT-XXXXXXXXXX）；不匹配的二维码（海报 URL 等）不打 API 直接提示 */
const TICKET_CODE_RE = /^UMT-[A-Z0-9]{8,16}$/i;
/** 命中后暂停解码时长 */
const PAUSE_MS = 1200;
/** 降采样最长边 */
const MAX_SIDE = 640;
const MAX_RESULTS = 20;

type BlockReason = 'insecure' | 'unsupported' | 'denied' | 'notfound' | 'lost' | 'other';

const BLOCK_MESSAGES: Record<BlockReason, string> = {
  insecure: '摄像头需要 HTTPS 环境，请通过 https 地址访问后再试',
  unsupported: '当前浏览器不支持调用摄像头',
  denied: '摄像头权限被拒绝，请在浏览器设置中允许摄像头后重试',
  notfound: '未检测到摄像头',
  lost: '摄像头连接中断，请重试',
  other: '摄像头启动失败，请重试',
};

/** 环境性失败（非 HTTPS / 浏览器不支持）重试无意义，不渲染重试按钮 */
const RETRYABLE: Record<BlockReason, boolean> = {
  insecure: false,
  unsupported: false,
  denied: true,
  notfound: true,
  lost: true,
  other: true,
};

interface ScanResult {
  seq: number;
  ok: boolean;
  code: string;
  message: string;
  time: string;
}

export function ScanCheckinModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [camPhase, setCamPhase] = useState<'starting' | 'active' | 'blocked'>('starting');
  const [blockReason, setBlockReason] = useState<BlockReason | null>(null);
  const [paused, setPaused] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const [results, setResults] = useState<ScanResult[]>([]);
  const [retryTick, setRetryTick] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** 解码用 offscreen canvas，跨帧复用不每帧新建 */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const busyRef = useRef(false);
  const pausedUntilRef = useRef(0);
  const seenRef = useRef(new Map<string, number>());
  const seqRef = useRef(0);
  const mountedRef = useRef(true);

  // 挂载标志 + AudioContext 关闭（StrictMode 双执行时 setup 里必须复位标志）
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx) {
        try {
          void ctx.close();
        } catch {
          /* 已关闭时静默 */
        }
      }
    };
  }, []);

  // 活动列表（学生会侧服务端已过滤本校）；拉取失败不阻塞扫码，保持「不限活动」
  useEffect(() => {
    let cancelled = false;
    listEvents({ page: 1, limit: 100 })
      .then((res) => {
        if (!cancelled) setEvents(res.items.filter((ev) => ev.status !== 'cancelled'));
      })
      .catch(() => {
        /* 静默：select 里只剩「不限活动」 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 取流
  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamPhase('blocked');
      setBlockReason(!window.isSecureContext ? 'insecure' : 'unsupported');
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let endedTrack: MediaStreamTrack | null = null;
    // effect 运行时 video 已挂载且弹窗生命周期内恒定；捕获引用供 cleanup 使用
    const videoEl = videoRef.current;
    // 摄像头中途失联（USB 拔线/系统回收）时必须退出 active，否则 UI 停在「扫描中」但解码的是冻结帧
    const onTrackEnded = () => {
      if (cancelled) return;
      setCamPhase('blocked');
      setBlockReason('lost');
    };
    setCamPhase('starting');
    setBlockReason(null);
    setTorchAvailable(false);
    setTorchOn(false);
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        if (track) {
          endedTrack = track;
          track.addEventListener('ended', onTrackEnded);
        }
        if (videoEl) {
          videoEl.srcObject = stream;
          try {
            await videoEl.play();
          } catch {
            /* autoPlay 属性兜底 */
          }
        }
        if (cancelled) return;
        setCamPhase('active');
        try {
          // torch 未进 TS DOM lib，用最小结构侧写能力探测
          const caps = track?.getCapabilities?.() as
            | (MediaTrackCapabilities & { torch?: boolean })
            | undefined;
          if (caps?.torch) setTorchAvailable(true);
        } catch {
          /* 不支持 getCapabilities 的浏览器直接不显示手电 */
        }
      } catch (e) {
        if (cancelled) return;
        setCamPhase('blocked');
        const name = e instanceof DOMException ? e.name : '';
        setBlockReason(
          name === 'NotAllowedError' ? 'denied' : name === 'NotFoundError' ? 'notfound' : 'other',
        );
      }
    })();
    return () => {
      cancelled = true;
      endedTrack?.removeEventListener('ended', onTrackEnded);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
      if (videoEl) videoEl.srcObject = null;
    };
  }, [retryTick]);

  // 解码环（eventId 变化重建 interval 无副作用：busy/pause/去重都在 ref 里跨实例存续）
  useEffect(() => {
    if (camPhase !== 'active') return;

    const beep = (ok: boolean) => {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') void ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = ok ? 880 : 220;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (ok ? 0.09 : 0.16));
      } catch {
        /* 自动播放策略拦截时静默 */
      }
    };

    const pushResult = (r: Omit<ScanResult, 'seq' | 'time'>) => {
      seqRef.current += 1;
      const entry: ScanResult = {
        ...r,
        seq: seqRef.current,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      };
      setResults((prev) => [entry, ...prev].slice(0, MAX_RESULTS));
    };

    const handleHit = async (code: string) => {
      busyRef.current = true;
      pausedUntilRef.current = Date.now() + PAUSE_MS;
      setPaused(true);
      // 非门票形状（海报 URL 等）不打 API 直接提示；展示截断防超长 URL 撑爆结果行
      if (!TICKET_CODE_RE.test(code)) {
        if (mountedRef.current) {
          pushResult({
            ok: false,
            code: code.length > 24 ? `${code.slice(0, 22)}…` : code,
            message: '不是门票二维码',
          });
          beep(false);
        }
        busyRef.current = false;
        return;
      }
      try {
        const res = await checkinTicket(code, eventId || undefined);
        // onDone 通知的是仍然挂载的父页（票已实际核销）：弹窗关闭中也要刷新，放在 mounted 守卫之前
        onDone();
        if (!mountedRef.current) return;
        pushResult({ ok: true, code, message: `${res.event} · ${res.holder}` });
        beep(true);
        navigator.vibrate?.(60);
      } catch (e) {
        if (!mountedRef.current) return;
        pushResult({
          ok: false,
          code,
          message: e instanceof ApiError ? e.message : '核销失败，请稍后重试',
        });
        beep(false);
        navigator.vibrate?.([50, 50, 50]);
      } finally {
        busyRef.current = false;
      }
    };

    const tick = () => {
      const idle = busyRef.current || Date.now() < pausedUntilRef.current;
      setPaused(idle);
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const scale = Math.min(1, MAX_SIDE / Math.max(vw, vh));
      const w = Math.round(vw * scale);
      const h = Math.round(vh * scale);
      if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
      const canvas = canvasRef.current;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      const decoded = jsQR(image.data, w, h, { inversionAttempts: 'attemptBoth' });
      const code = decoded?.data.trim();
      if (!code) return;
      // 在框存在性每帧刷新，且必须在 busy/暂停门之前——请求耗时与暂停期间码没离框，不算「重新出示」
      const now = Date.now();
      const last = seenRef.current.get(code);
      seenRef.current.set(code, now);
      if (idle) return;
      if (last !== undefined && now - last < REARM_MS) return;
      void handleHit(code);
    };

    const timer = window.setInterval(tick, DECODE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [camPhase, eventId, onDone]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      // torch 约束未进 TS DOM lib，交集类型让字面量通过检查
      const constraint: MediaTrackConstraintSet & { torch?: boolean } = { torch: next };
      await track.applyConstraints({ advanced: [constraint] });
      setTorchOn(next);
    } catch {
      /* 设备/驱动实际不支持时静默保持原状 */
    }
  };

  const statusText =
    camPhase === 'blocked'
      ? '摄像头不可用'
      : camPhase === 'starting'
        ? '正在启动摄像头…'
        : paused
          ? '已暂停：正在处理票码…'
          : '扫描中：将二维码对准取景框';

  return (
    <Modal title="扫码核销" caption="SCAN" size="md" onClose={onClose}>
      <div className="space-y-4 pb-4">
        <div>
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">不限活动</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.school ? `${ev.title} · ${ev.school}` : ev.title}
              </option>
            ))}
          </Select>
          {eventId && (
            <p className="text-xs text-on-surface-variant mt-1.5">已限定：非本场门票会被拒绝</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          <span
            className={clsx(
              'w-1.5 h-1.5 rounded-full shrink-0',
              camPhase === 'blocked'
                ? 'bg-neon-pink'
                : camPhase === 'active' && !paused
                  ? 'bg-neon animate-pulse'
                  : 'bg-outline',
            )}
          />
          <span>{statusText}</span>
        </div>

        <div className="relative aspect-video rounded-lg overflow-hidden bg-ink">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
          />
          {camPhase === 'active' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-40 rounded-2xl border border-white/70" />
            </div>
          )}
          {camPhase === 'active' && torchAvailable && (
            <button
              className="absolute bottom-3 right-3 p-2 rounded-lg bg-ink/60 text-white hover:bg-ink/80 transition-colors"
              onClick={() => void toggleTorch()}
              aria-label={torchOn ? '关闭手电' : '打开手电'}
            >
              {torchOn ? <FlashlightOff size={16} /> : <Flashlight size={16} />}
            </button>
          )}
          {camPhase === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-white/70">正在启动摄像头…</p>
            </div>
          )}
          {camPhase === 'blocked' && blockReason && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-ink">
              <CameraOff size={24} className="text-outline" />
              <p className="text-sm text-white/90">{BLOCK_MESSAGES[blockReason]}</p>
              {RETRYABLE[blockReason] && (
                <Button variant="secondary" size="sm" onClick={() => setRetryTick((t) => t + 1)}>
                  重试
                </Button>
              )}
              <p className="text-xs text-white/50">也可关闭弹窗，回到上方输入框手动核销</p>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {results.map((r) => (
              <li
                key={r.seq}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                  r.ok ? 'bg-neon/15 text-ink' : 'bg-neon-pink/10 text-neon-pink',
                )}
              >
                {r.ok ? (
                  <CheckCircle2 size={15} className="shrink-0" />
                ) : (
                  <AlertTriangle size={15} className="shrink-0" />
                )}
                <span className="font-mono text-xs shrink-0 max-w-[130px] truncate">{r.code}</span>
                <span className="truncate flex-1">{r.message}</span>
                <span className="font-mono text-[10px] opacity-60 shrink-0">{r.time}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
