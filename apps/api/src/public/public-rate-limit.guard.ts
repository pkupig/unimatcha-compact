import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, mixin, Type } from '@nestjs/common';

/**
 * 进程内存 IP 限流的可配置基类（60s 窗口，阈值由子类给）。
 * 防脚本灌库；多实例部署时各实例独立计数，量级上仍足够挡住无脑刷。
 *
 * IP 取值：不手工解析 X-Forwarded-For——取「首项」等于信任客户端自报的任意值，伪造头即可绕过。
 * main.ts 已设 trust proxy=1，req.ip 会取可信代理（Caddy）追加的那一跳，即真实客户端 IP。
 *
 * 注意 per-IP 在 NAT 出口下是钝器（整个校园 WiFi 共用一个公网 IP）：阈值要给够注册高峰的
 * 合法并发余量。真正的防爆破是「每码 5 次尝试上限 + 60s 重发冷却 + 6 位随机码」，与 IP 限流独立。
 */
abstract class BaseRateLimitGuard implements CanActivate {
  protected abstract readonly limit: number;
  protected readonly windowMs = 60_000;
  private hits = new Map<string, { count: number; windowStart: number }>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    const now = Date.now();
    const entry = this.hits.get(ip);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
      if (entry.count > this.limit) {
        throw new HttpException('Too many requests, please try again later', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    // 简易清理：表过大时丢弃过期窗口，防内存膨胀
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (now - v.windowStart >= this.windowMs) this.hits.delete(k);
      }
    }
    return true;
  }
}

/** 按阈值生成一个独立限流守卫类（各自持有独立的 hits 表 → 不同端点桶不互相消耗）。 */
export function RateLimitGuard(limit: number): Type<CanActivate> {
  @Injectable()
  class ConfiguredRateLimitGuard extends BaseRateLimitGuard {
    protected readonly limit = limit;
  }
  return mixin(ConfiguredRateLimitGuard);
}

/** 公开提交端点（waitlist / sponsor-application）：60s/IP 10 次。 */
@Injectable()
export class PublicRateLimitGuard extends BaseRateLimitGuard {
  protected readonly limit = 10;
}

/**
 * 认证验证码端点（register / register/send-code）：60s/IP 30 次。
 * 阈值高于公开表单，因为核心用户是校园共享 NAT 出口，注册高峰整校同 IP——
 * 10 次/分会误伤合法并发注册。防爆破由每码尝试上限兜底，此处只挡无脑刷量。
 */
export const AuthCodeRateLimitGuard = RateLimitGuard(30);
