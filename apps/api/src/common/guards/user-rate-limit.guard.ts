import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, mixin, Type } from '@nestjs/common';

/**
 * 进程内存「按用户」限流（60s 固定窗口，阈值由工厂参数给）。
 *
 * 与 public-rate-limit.guard 的差别只在键：那边挡的是**登录前**的脚本灌库，只能按 IP；
 * 这边挡的是**已登录用户**刷内容（短时间大量发帖/评论/私信/点赞/举报），必须按 userId——
 * 校园场景整栋楼共用一个 NAT 出口，按 IP 会把合法同学一起误伤，而刷子换号不换 IP 也照样漏。
 *
 * 键取 req.user.id：本守卫一律作为**方法级**守卫挂在已有 class 级 JwtAuthGuard 的控制器上，
 * Nest 先跑 class 级守卫，进到这里时 req.user 必已就位；万一挂错位置拿不到 user，退回按 IP
 * 计数（fail-closed 到较粗粒度，而不是放行）。
 *
 * 进程内存的取舍与既有守卫一致：单机部署下每实例独立计数已足够；将来多实例时换 Redis
 * 计数器即可（与 realtime 的 emitToUser 同一个切换点位）。
 *
 * 阈值哲学：挡的是「机器/复读机速率」，不是给正常人设障——正常人 60 秒内发不出 5 篇帖子，
 * 但热聊中 40 条短消息是真实会发生的。宁可放宽，业务级约束（每码尝试上限、投票唯一、
 * 点赞切换幂等）另有兜底。
 */
abstract class BaseUserRateLimitGuard implements CanActivate {
  protected abstract readonly limit: number;
  protected readonly windowMs = 60_000;
  private hits = new Map<string, { count: number; windowStart: number }>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const key: string = req.user?.id || req.ip || req.socket?.remoteAddress || 'unknown';

    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
      if (entry.count > this.limit) {
        throw new HttpException('Too many requests, please slow down', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    // 简易清理：表过大时丢弃过期窗口，防内存膨胀（同 public-rate-limit.guard）
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (now - v.windowStart >= this.windowMs) this.hits.delete(k);
      }
    }
    return true;
  }
}

/** 按阈值生成独立守卫类；同一个导出的类在同一模块内是同一实例 → 挂多个端点即共享一个桶。 */
export function UserRateLimitGuard(limit: number): Type<CanActivate> {
  @Injectable()
  class ConfiguredUserRateLimitGuard extends BaseUserRateLimitGuard {
    protected readonly limit = limit;
  }
  return mixin(ConfiguredUserRateLimitGuard);
}

// ── 内容创作限速桶（60s 窗口，按用户）────────────────────────────────────────
// 每个 const 是一个独立类；同类挂在同一模块的多个端点上共享桶（这是刻意的：
// 帖/评论点赞合并计数，合计 30 次/分）。

/** 发帖：5 次/分。正常人一分钟发不出 5 篇；刷屏机器人第 6 篇起 429。 */
export const PostCreateRateLimit = UserRateLimitGuard(5);

/** 评论：12 次/分。盖楼式连续评论留有余量，复读机挡住。 */
export const CommentCreateRateLimit = UserRateLimitGuard(12);

/** 点赞切换（帖+评论共享桶）：30 次/分。轻操作给足余量，连点脚本挡住。 */
export const LikeToggleRateLimit = UserRateLimitGuard(30);

/** 投票/改票：15 次/分。每帖一票是业务约束，这里只挡对多帖扫射。 */
export const VoteRateLimit = UserRateLimitGuard(15);

/** 举报：5 次/分。举报刷量本身就是一种骚扰（也刷爆审核队列）。 */
export const ReportRateLimit = UserRateLimitGuard(5);

/** 聊天消息：40 次/分。热聊短句可以很快，放宽到真人达不到的上限。 */
export const MessageSendRateLimit = UserRateLimitGuard(40);

/** 拍一拍：10 次/分。每次都会给对方生成一条消息，连拍是骚扰面。 */
export const NudgeRateLimit = UserRateLimitGuard(10);

/** 图片上传：20 次/分。发帖 4 图 + 头像/封面/照片墙的合法突发之上仍有富余；防灌盘。 */
export const UploadRateLimit = UserRateLimitGuard(20);
