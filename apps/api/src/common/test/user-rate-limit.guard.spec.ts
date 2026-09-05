import { HttpException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { UserRateLimitGuard } from '../guards/user-rate-limit.guard';

// 伪 ExecutionContext：只要 switchToHttp().getRequest() 形状对即可
function ctxFor(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('UserRateLimitGuard（按用户内容限速）', () => {
  it('同一用户超过阈值抛 429，窗口内第 limit+1 次起全部拒绝', () => {
    const GuardClass = UserRateLimitGuard(3);
    const guard = new GuardClass();
    const req = { user: { id: 'user-a' }, ip: '1.1.1.1' };
    expect(guard.canActivate(ctxFor(req))).toBe(true);
    expect(guard.canActivate(ctxFor(req))).toBe(true);
    expect(guard.canActivate(ctxFor(req))).toBe(true);
    expect(() => guard.canActivate(ctxFor(req))).toThrow(HttpException);
    expect(() => guard.canActivate(ctxFor(req))).toThrow(HttpException);
    try {
      guard.canActivate(ctxFor(req));
      fail('should have thrown');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('按 userId 计数，不按 IP：同 IP 不同用户互不消耗（校园 NAT 不误伤）', () => {
    const GuardClass = UserRateLimitGuard(2);
    const guard = new GuardClass();
    const a = { user: { id: 'user-a' }, ip: '9.9.9.9' };
    const b = { user: { id: 'user-b' }, ip: '9.9.9.9' };
    expect(guard.canActivate(ctxFor(a))).toBe(true);
    expect(guard.canActivate(ctxFor(a))).toBe(true);
    expect(() => guard.canActivate(ctxFor(a))).toThrow(HttpException);
    // 同一 IP 的另一个用户不受影响
    expect(guard.canActivate(ctxFor(b))).toBe(true);
    expect(guard.canActivate(ctxFor(b))).toBe(true);
  });

  it('换号不换 IP 也各自限流；缺 user 时退回按 IP 计数而不是放行', () => {
    const GuardClass = UserRateLimitGuard(1);
    const guard = new GuardClass();
    // 无 user（守卫被挂到未认证位置的兜底路径）→ 按 IP 计
    const anon = { ip: '8.8.8.8' };
    expect(guard.canActivate(ctxFor(anon))).toBe(true);
    expect(() => guard.canActivate(ctxFor(anon))).toThrow(HttpException);
  });

  it('60s 窗口过期后重新放行', () => {
    jest.useFakeTimers();
    try {
      const GuardClass = UserRateLimitGuard(1);
      const guard = new GuardClass();
      const req = { user: { id: 'user-t' } };
      expect(guard.canActivate(ctxFor(req))).toBe(true);
      expect(() => guard.canActivate(ctxFor(req))).toThrow(HttpException);
      jest.advanceTimersByTime(60_001);
      expect(guard.canActivate(ctxFor(req))).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('不同工厂调用产出独立桶（发帖与评论互不消耗额度）', () => {
    const PostGuard = UserRateLimitGuard(1);
    const CommentGuard = UserRateLimitGuard(1);
    const post = new PostGuard();
    const comment = new CommentGuard();
    const req = { user: { id: 'user-x' } };
    expect(post.canActivate(ctxFor(req))).toBe(true);
    expect(() => post.canActivate(ctxFor(req))).toThrow(HttpException);
    // 发帖桶打满不影响评论桶
    expect(comment.canActivate(ctxFor(req))).toBe(true);
  });
});
