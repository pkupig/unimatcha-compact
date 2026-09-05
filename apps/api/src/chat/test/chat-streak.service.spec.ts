import { ChatService } from '../chat.service';

// 续火花的日期判定：跨天、跨月、跨年、闰年、断档——这些边界一旦写错，
// 用户会突然看到自己攒了几十天的火花归零（或者早就断了却还挂着）。
// 纯静态方法测试，不需要起 Nest 容器。
describe('ChatService · 续火花日期判定', () => {
  const day = (d: string) => d; // 可读性

  describe('utcDay', () => {
    it('返回 UTC 的 YYYY-MM-DD', () => {
      expect(ChatService.utcDay(new Date('2026-09-05T23:59:59.000Z'))).toBe('2026-09-05');
      expect(ChatService.utcDay(new Date('2026-09-06T00:00:00.000Z'))).toBe('2026-09-06');
    });

    it('用 UTC 而非本地时区——本地时区会让「今天」随时区漂移，两端算出不同的日子', () => {
      // 该时刻在 UTC 是 6 号凌晨，在 UTC-5 还是 5 号晚上
      expect(ChatService.utcDay(new Date('2026-09-06T02:00:00.000Z'))).toBe('2026-09-06');
    });
  });

  describe('isStreakAlive', () => {
    const RealDate = Date;
    const freeze = (iso: string) => {
      // @ts-expect-error 测试内替换全局 Date
      global.Date = class extends RealDate {
        constructor(...args: any[]) {
          // @ts-expect-error 透传构造参数
          super(...(args.length ? args : [iso]));
        }
        static now() { return new RealDate(iso).getTime(); }
      };
    };
    afterEach(() => { global.Date = RealDate; });

    it('今天达成 → 活着', () => {
      freeze('2026-09-05T10:00:00.000Z');
      expect(ChatService.isStreakAlive('2026-09-05')).toBe(true);
    });

    it('昨天达成 → 仍活着（今天还有一整天补救时间）', () => {
      freeze('2026-09-05T10:00:00.000Z');
      expect(ChatService.isStreakAlive('2026-09-04')).toBe(true);
    });

    it('前天达成 → 已断（中间空了一整天）', () => {
      freeze('2026-09-05T10:00:00.000Z');
      expect(ChatService.isStreakAlive('2026-09-03')).toBe(false);
    });

    it('从未达成（null）→ 不算活着，也不能抛错', () => {
      freeze('2026-09-05T10:00:00.000Z');
      expect(ChatService.isStreakAlive(null)).toBe(false);
      expect(ChatService.isStreakAlive(undefined)).toBe(false);
      expect(ChatService.isStreakAlive('')).toBe(false);
    });

    it('跨月边界：9/1 的今天，昨天是 8/31 而不是 8/0', () => {
      freeze('2026-09-01T08:00:00.000Z');
      expect(ChatService.isStreakAlive('2026-08-31')).toBe(true);
      expect(ChatService.isStreakAlive('2026-08-30')).toBe(false);
    });

    it('跨年边界：1/1 的今天，昨天是去年 12/31', () => {
      freeze('2027-01-01T08:00:00.000Z');
      expect(ChatService.isStreakAlive('2026-12-31')).toBe(true);
      expect(ChatService.isStreakAlive('2026-12-30')).toBe(false);
    });

    it('闰年边界：2028-03-01 的昨天是 02-29（不是 02-28）', () => {
      freeze('2028-03-01T08:00:00.000Z');
      expect(ChatService.isStreakAlive('2028-02-29')).toBe(true);
      expect(ChatService.isStreakAlive('2028-02-28')).toBe(false);
    });

    it('未来日期不当成活着（时钟回拨/脏数据不该白送火花）', () => {
      freeze('2026-09-05T10:00:00.000Z');
      expect(ChatService.isStreakAlive('2026-09-06')).toBe(false);
    });
  });
});
