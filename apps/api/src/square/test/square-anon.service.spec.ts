import { Test, TestingModule } from '@nestjs/testing';
import { SquareService } from '../square.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';

// 匿名是隐私承诺，破了就是真实伤害——这套用例守的是「匿名评论除化名外什么都不剩」
// 与「化名不可被离线反推」两条底线，任何一条被改坏都应当在这里立刻红掉。
const mockPrisma: any = { squarePost: {}, squarePostComment: {}, profile: {}, user: {}, match: {} };

describe('SquareService · 匿名（逐条评论）', () => {
  let service: SquareService;

  beforeAll(() => {
    process.env.ANON_ALIAS_SECRET = 'test-anon-secret';
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SquareService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeService, useValue: { emitToUser: jest.fn() } },
      ],
    }).compile();
    service = module.get<SquareService>(SquareService);
  });

  const anonymize = (post: any) => (service as any).anonymizeComments(post);
  const seedOf = (postId: string, userId: string) => (service as any).anonSeed(postId, userId);

  it('匿名评论只留化名：真实 userId / user.id / 头像全部不下发', () => {
    const post = {
      id: 'post1',
      authorUserId: 'author1',
      anonymous: false,
      comments: [
        {
          id: 'c1',
          userId: 'victim1',
          anonymous: true,
          user: { id: 'victim1', profile: { nickname: '沐晨', avatarUrl: 'https://x/a.jpg' } },
          replies: [],
        },
      ],
    };
    anonymize(post);
    const c = post.comments[0] as any;
    expect(c.userId).toBeUndefined();
    expect(c.user.id).toBeUndefined();
    expect(c.user.profile.nickname).not.toBe('沐晨');
    expect(c.user.profile.avatarUrl).toBeNull();
    expect(JSON.stringify(c)).not.toContain('victim1');
    expect(JSON.stringify(c)).not.toContain('沐晨');
    expect(JSON.stringify(c)).not.toContain('a.jpg');
    // 前端要靠 aliasSeed 出中文化名与头像
    expect(typeof c.anonymousAuthor.aliasSeed).toBe('number');
  });

  it('实名评论保持原样（匿名不再由帖子决定），但不下发 user.id', () => {
    const post = {
      id: 'post1',
      authorUserId: 'author1',
      anonymous: true, // 匿名帖
      comments: [
        {
          id: 'c1',
          userId: 'someone',
          anonymous: false, // 评论者自己没勾匿名
          user: { id: 'someone', profile: { nickname: '小明', avatarUrl: 'https://x/b.jpg' } },
          replies: [],
        },
      ],
    };
    anonymize(post);
    const c = post.comments[0] as any;
    // 关键：匿名帖底下的评论不再被强制匿名
    expect(c.user.profile.nickname).toBe('小明');
    expect(c.user.profile.avatarUrl).toBe('https://x/b.jpg');
    expect(c.user.id).toBeUndefined();
  });

  it('楼主标记只发给楼主自己的匿名评论，别人的匿名评论拿不到 token', () => {
    const post = {
      id: 'post1',
      authorUserId: 'author1',
      anonymous: true,
      comments: [
        { id: 'c1', userId: 'author1', anonymous: true, user: { id: 'author1', profile: { nickname: 'A' } }, replies: [] },
        { id: 'c2', userId: 'other', anonymous: true, user: { id: 'other', profile: { nickname: 'B' } }, replies: [] },
      ],
    };
    anonymize(post);
    expect((post.comments[0] as any).anonymousAuthorToken).toBeDefined();
    expect((post.comments[1] as any).anonymousAuthorToken).toBeUndefined();
  });

  it('楼中楼的回复同样逐条脱敏', () => {
    const post = {
      id: 'post1',
      authorUserId: 'author1',
      anonymous: false,
      comments: [
        {
          id: 'c1',
          userId: 'u1',
          anonymous: false,
          user: { id: 'u1', profile: { nickname: '实名' } },
          replies: [
            { id: 'r1', userId: 'u2', anonymous: true, user: { id: 'u2', profile: { nickname: '匿名者' } }, replies: [] },
          ],
        },
      ],
    };
    anonymize(post);
    const r = (post.comments[0] as any).replies[0];
    expect(r.userId).toBeUndefined();
    expect(r.user.profile.nickname).not.toBe('匿名者');
  });

  it('化名带密钥且以 postId 加盐：跨帖不可关联，且不能靠公开值离线重算', () => {
    const a = seedOf('postA', 'user1');
    const b = seedOf('postB', 'user1');
    expect(a).not.toBe(b); // 同一个人在不同帖子里种子不同 → 无法跨帖关联

    // 攻击者已知算法与全部公开输入（postId、userId），但没有密钥就算不出种子
    const attacker = require('crypto')
      .createHmac('sha256', 'wrong-key')
      .update('postA:user1')
      .digest()
      .readUInt32BE(0);
    expect(attacker).not.toBe(a);
  });

  it('同帖同人恒等：同一个匿名者在楼里始终是同一个名字和头像', () => {
    expect(seedOf('postA', 'user1')).toBe(seedOf('postA', 'user1'));
  });

  // ─── 「附近」隐私底线 ───────────────────────────────────────
  // 帖子坐标一旦出网就能被多点采样反解出发帖位置（宿舍楼/常去的地方）。
  // 这组用例守三条：坐标永不下发、落库先截断、距离只给档位。
  describe('附近：坐标不出网', () => {
    const shape = (post: any, viewer?: string) => (service as any).shapePost(post, viewer);

    it('shapePost 剔除帖子经纬度（全站唯一出参口，列表/详情/后台复用同一处）', () => {
      const out = shape(
        { id: 'p1', authorUserId: 'u1', anonymous: false, lat: 52.3811, lng: -1.5615, content: 'x' },
        'viewer',
      );
      expect(out.lat).toBeUndefined();
      expect(out.lng).toBeUndefined();
      expect(JSON.stringify(out)).not.toContain('52.381');
    });

    it('匿名帖同样不下发坐标（匿名 + 精确位置 = 直接指认到人）', () => {
      const out = shape(
        { id: 'p2', authorUserId: 'u1', authorType: 'USER', anonymous: true, lat: 51.5, lng: -0.12 },
        'viewer',
      );
      expect(out.lat).toBeUndefined();
      expect(out.lng).toBeUndefined();
      expect(out.authorUser).toBeNull();
    });

    it('落库前坐标截到 3 位小数（≈110m），非法值落 null', () => {
      const t = (v: any) => (SquareService as any).truncCoord(v);
      expect(t(52.38112345)).toBe(52.381);
      expect(t(-1.56159999)).toBe(-1.562);
      expect(t(undefined)).toBeNull();
      expect(t('abc')).toBeNull();
      expect(t(NaN)).toBeNull();
    });

    it('对外只给距离档位，不给精确米数（精确距离可三角反解坐标）', () => {
      const b = (km: number) => (service as any).distanceBucket(km);
      expect(b(0.4)).toBe('under_1km');
      expect(b(2.2)).toBe('1_3km');
      expect(b(7)).toBe('3_10km');
      expect(b(30)).toBe('10_50km');
      expect(b(120)).toBe('over_50km');
    });

    it('haversine 距离计算正确（伦敦↔华威约 130km，容差 10km）', () => {
      const km = (service as any).haversineKm(51.5074, -0.1278, 52.3811, -1.5615);
      expect(km).toBeGreaterThan(120);
      expect(km).toBeLessThan(140);
    });

    it('缺坐标的帖子返回 NaN，由调用方过滤掉而不是当成 0km 排到最前', () => {
      const km = (service as any).haversineKm(51.5, -0.12, null, null);
      expect(Number.isNaN(km)).toBe(true);
    });
  });

  // ─── 外校墙互动门禁（「探索」引入，同时补既有跨校越权洞）───────────
  describe('探索：外校墙只有认证用户能互动', () => {
    const gate = (userId: string, post: any) => (service as any).assertCanInteract(userId, post);
    const setUser = (school: string | null, verification: string) => {
      mockPrisma.profile.findUnique = jest.fn().mockResolvedValue({ school });
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue({ verificationStatus: verification });
    };

    it('本校墙：未认证也照常互动（自己学校的规则一行没改）', async () => {
      setUser('Warwick', 'unverified');
      await expect(gate('u1', { board: 'CAMPUS_WALL', school: 'Warwick' })).resolves.toBeUndefined();
    });

    it('外校墙 + 未认证 → 拒绝（这同时补上了原先零校验的跨校越权）', async () => {
      setUser('Warwick', 'unverified');
      await expect(gate('u1', { board: 'CAMPUS_WALL', school: 'UCL' })).rejects.toThrow();
    });

    it('外校墙 + 审核中 → 仍拒绝（pending 不等于 verified）', async () => {
      setUser('Warwick', 'pending');
      await expect(gate('u1', { board: 'CAMPUS_WALL', school: 'UCL' })).rejects.toThrow();
    });

    it('外校墙 + 已认证 → 放行', async () => {
      setUser('Warwick', 'verified');
      await expect(gate('u1', { board: 'CAMPUS_WALL', school: 'UCL' })).resolves.toBeUndefined();
    });

    it('推荐流不设门槛（全网公共区，未认证照常互动）', async () => {
      setUser('Warwick', 'unverified');
      await expect(gate('u1', { board: 'RECOMMEND', school: 'UCL' })).resolves.toBeUndefined();
    });

    it('没填学校的用户在外校墙也被拦（空字符串不得当成「同校」放行）', async () => {
      setUser(null, 'unverified');
      await expect(gate('u1', { board: 'CAMPUS_WALL', school: 'UCL' })).rejects.toThrow();
    });

    it('canInteract 能力位与门禁判定一致（前端据此置灰，不能点了才报错）', () => {
      const can = (post: any, mySchool: any, v: any) =>
        (service as any).canInteractWith(post, mySchool, v);
      expect(can({ board: 'CAMPUS_WALL', school: 'Warwick' }, 'Warwick', 'unverified')).toBe(true);
      expect(can({ board: 'CAMPUS_WALL', school: 'UCL' }, 'Warwick', 'unverified')).toBe(false);
      expect(can({ board: 'CAMPUS_WALL', school: 'UCL' }, 'Warwick', 'verified')).toBe(true);
      expect(can({ board: 'RECOMMEND', school: 'UCL' }, 'Warwick', 'unverified')).toBe(true);
    });
  });
});
