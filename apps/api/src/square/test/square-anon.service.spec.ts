import { Test, TestingModule } from '@nestjs/testing';
import { SquareService } from '../square.service';
import { PrismaService } from '../../prisma/prisma.service';

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
      providers: [SquareService, { provide: PrismaService, useValue: mockPrisma }],
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
});
