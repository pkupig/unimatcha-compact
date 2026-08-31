import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Response } from 'express';

/**
 * 进程内 SSE 实时推送（单实例部署下无需 Redis pub/sub；
 * 将来水平扩展时把 emitToUser 换成 Redis 发布即可，调用面不变）。
 *
 * 事件只做「失效通知」（type + 少量定位字段），客户端收到后走既有 REST 拉取——
 * 不在推送里携带完整数据，避免与轮询渲染路径出现两套数据形状。
 * 没有在线连接时事件静默丢弃：降频后的轮询是兜底，语义上推送只是加速器。
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private clients = new Map<string, Set<Response>>();
  private heartbeat: ReturnType<typeof setInterval>;

  constructor() {
    // 25s 心跳注释帧：防 Caddy/移动网络 NAT 掐空闲连接；坏连接的清理靠 close 事件
    this.heartbeat = setInterval(() => {
      for (const set of this.clients.values()) {
        for (const res of set) {
          try {
            res.write(': ping\n\n');
          } catch {
            /* 由 close 事件清理 */
          }
        }
      }
    }, 25_000);
    // 不阻止进程退出（测试/关停友好）
    (this.heartbeat as any).unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.heartbeat);
    for (const set of this.clients.values()) {
      for (const res of set) {
        try {
          res.end();
        } catch {
          /* noop */
        }
      }
    }
    this.clients.clear();
  }

  addClient(userId: string, res: Response) {
    let set = this.clients.get(userId);
    if (!set) {
      set = new Set();
      this.clients.set(userId, set);
    }
    // 单用户连接上限：多标签页/异常重连不该无限占服务端句柄，挤掉最旧的
    if (set.size >= 5) {
      const oldest = set.values().next().value;
      if (oldest) {
        try {
          // 先发 evicted 帧：干净 EOF 会让 EventSource 自动重连，6+ 标签页时形成
          // 每 ~3s 一次的永久挤兑循环；客户端收到该帧后主动 close、停留在轮询
          oldest.write('data: {"type":"evicted"}\n\n');
          oldest.end();
        } catch {
          /* noop */
        }
        set.delete(oldest);
      }
    }
    set.add(res);
  }

  removeClient(userId: string, res: Response) {
    const set = this.clients.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.clients.delete(userId);
  }

  /** 给指定用户的全部在线连接推事件；无连接时静默丢弃（轮询兜底会补） */
  emitToUser(userId: string, event: { type: string; [k: string]: unknown }) {
    const set = this.clients.get(userId);
    if (!set || set.size === 0) return;
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of set) {
      try {
        res.write(frame);
      } catch {
        /* 由 close 事件清理 */
      }
    }
  }

  get connectionCount(): number {
    let n = 0;
    for (const s of this.clients.values()) n += s.size;
    return n;
  }
}
