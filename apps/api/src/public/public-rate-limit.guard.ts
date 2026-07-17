import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * 公开提交端点的轻量 IP 限流（进程内存，60s 窗口每 IP 最多 10 次）。
 * 防脚本灌库；多实例部署时各实例独立计数，量级上仍足够挡住无脑刷。
 */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  private static readonly WINDOW_MS = 60_000;
  private static readonly LIMIT = 10;
  private hits = new Map<string, { count: number; windowStart: number }>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const fwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const ip = fwd || req.ip || req.socket?.remoteAddress || 'unknown';

    const now = Date.now();
    const entry = this.hits.get(ip);
    if (!entry || now - entry.windowStart >= PublicRateLimitGuard.WINDOW_MS) {
      this.hits.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
      if (entry.count > PublicRateLimitGuard.LIMIT) {
        throw new HttpException('Too many requests, please try again later', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    // 简易清理：表过大时丢弃过期窗口，防内存膨胀
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (now - v.windowStart >= PublicRateLimitGuard.WINDOW_MS) this.hits.delete(k);
      }
    }
    return true;
  }
}
