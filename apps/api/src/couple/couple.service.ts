import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86400000;
// 仅恋人关系可用情侣空间（RELATIONSHIP_MODE 为旧数据兼容）
const ROMANTIC_STATUSES = ['RELATIONSHIP_ROMANTIC', 'RELATIONSHIP_MODE'];

@Injectable()
export class CoupleService {
  constructor(private prisma: PrismaService) {}

  // 校验当前用户属于该恋人 Match（且未解除），返回 { match, partnerId }
  private async assertMember(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Relationship not found');
    if (!ROMANTIC_STATUSES.includes(match.status as string) || match.dissolvedAt) {
      throw new ForbiddenException('Not a valid partner relationship');
    }
    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException('No access to this Couple Space');
    }
    const partnerId = match.userAId === userId ? match.userBId : match.userAId;
    return { match, partnerId };
  }

  async getSpace(userId: string, matchId: string) {
    const { match, partnerId } = await this.assertMember(userId, matchId);

    const [states, anniversaries, bucket, partnerProfile, myProfile, cravings, schedules, meUser] =
      await Promise.all([
        this.prisma.coupleMemberState.findMany({ where: { matchId } }),
        this.prisma.coupleAnniversary.findMany({ where: { matchId }, orderBy: { date: 'asc' } }),
        this.prisma.coupleBucketItem.findMany({ where: { matchId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.profile.findUnique({
          where: { userId: partnerId },
          select: { nickname: true, avatarUrl: true, wishGifts: true, bio: true },
        }),
        this.prisma.profile.findUnique({ where: { userId }, select: { wishGifts: true } }),
        this.prisma.coupleCravingEntry.findMany({ where: { matchId }, orderBy: { createdAt: 'desc' } }),
        this.prisma.coupleScheduleEntry.findMany({ where: { matchId }, orderBy: { startAt: 'desc' } }),
        this.prisma.user.findUnique({ where: { id: userId }, select: { settings: true } }),
      ]);

    const now = Date.now();
    const statusOf = (uid: string) => states.find((s) => s.userId === uid)?.status || '';

    const dedupe = (arr: string[]) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const t of arr) {
        const k = (t || '').trim().toLowerCase();
        if (t && !seen.has(k)) {
          seen.add(k);
          out.push(t);
        }
      }
      return out;
    };
    const myCravings = cravings.filter((c) => c.userId === userId);
    const partnerCravings = cravings.filter((c) => c.userId === partnerId);
    const myState = states.find((s) => s.userId === userId) as any;
    const partnerStateRow = states.find((s) => s.userId === partnerId) as any;
    const todayStr = new Date().toISOString().slice(0, 10);
    const cover = (((meUser?.settings as any)?.coupleCovers) || {})[matchId] || '';

    const schedOf = (uid: string) =>
      schedules
        .filter((s) => s.userId === uid)
        .map((s) => ({
          id: s.id,
          text: s.text,
          startAt: s.startAt,
          endAt: s.endAt,
          expired: new Date(s.endAt).getTime() < now,
        }));

    const anchor = match.relationshipStartedAt || match.confirmedAt || match.createdAt;
    const daysTogether = anchor
      ? Math.max(0, Math.floor((now - new Date(anchor).getTime()) / DAY))
      : null;
    const anniversaryView = anniversaries.map((a) => {
      const ai = (a as any).images || [];
      const single = (a as any).image;
      return {
        id: a.id,
        title: a.title,
        date: a.date,
        note: (a as any).note || '',
        images: ai.length ? ai : (single ? [single] : []),
        daysUntil: Math.ceil((new Date(a.date).getTime() - now) / DAY),
      };
    });

    return {
      matchId,
      daysTogether,
      since: anchor,
      partner: {
        userId: partnerId,
        nickname: partnerProfile?.nickname || 'Partner',
        avatarUrl: partnerProfile?.avatarUrl || '',
        bio: partnerProfile?.bio || '',
      },
      me: { userId },
      cover,
      loveYou: {
        me: { count: myState?.loveYouCount || 0, sentToday: myState?.loveYouDate === todayStr },
        partner: { count: partnerStateRow?.loveYouCount || 0 },
      },
      status: { me: statusOf(userId), partner: statusOf(partnerId) },
      craving: {
        me: { current: myCravings[0]?.text || '', history: dedupe(myCravings.map((c) => c.text)).slice(0, 8) },
        partner: { current: partnerCravings[0]?.text || '' },
      },
      schedule: { me: schedOf(userId), partner: schedOf(partnerId) },
      gifts: { me: myProfile?.wishGifts || [], partner: partnerProfile?.wishGifts || [] },
      anniversaries: anniversaryView,
      bucket: bucket.map((b) => {
        const bi = (b as any).doneImages || [];
        return {
          id: b.id,
          text: b.text,
          done: b.done,
          createdBy: b.createdBy,
          doneBy: b.doneBy,
          doneNote: b.doneNote || '',
          doneImages: bi.length ? bi : (b.doneImage ? [b.doneImage] : []),
        };
      }),
    };
  }

  // 设置/清除我的情侣封面（各自一张，存在 settings.coupleCovers[matchId]，本轮反馈4）
  async setCover(userId: string, matchId: string, imageUrl: string | null) {
    await this.assertMember(userId, matchId);
    // 行锁串行化读-改-写，避免与其它 settings 端点并发时互相丢更新（FOR UPDATE）
    await this.prisma.updateUserSettings(userId, (settings) => {
      const covers = { ...(settings.coupleCovers || {}) };
      if (imageUrl) covers[matchId] = imageUrl;
      else delete covers[matchId];
      return { ...settings, coupleCovers: covers };
    });
    return this.getSpace(userId, matchId);
  }

  // 发送「我爱你」：每天一次，在聊天里发一条；双方各满100次发里程碑通知（彩蛋，用户无感）。
  async sendLoveYou(userId: string, matchId: string) {
    const { partnerId } = await this.assertMember(userId, matchId);
    const today = new Date().toISOString().slice(0, 10);
    // 先保证状态行存在（不触碰 loveYou 字段），让下面的条件 updateMany 能命中
    await this.prisma.coupleMemberState.upsert({
      where: { matchId_userId: { matchId, userId } },
      create: { matchId, userId },
      update: {},
    });
    // 原子条件自增：仅当今日尚未发送时命中并 +1，杜绝双提交绕过「每天一次」。
    // 并发的第二次请求看到 loveYouDate 已是 today，条件不再成立 → count=0。
    // 注意：SQL 里 NULL != today 结果为 NULL（不为真），所以首次发送（loveYouDate 为 null）
    // 必须用 OR 显式放行，否则从未发过的人永远命中不了、被误判为「今天已发」。
    const applied = await this.prisma.coupleMemberState.updateMany({
      where: {
        matchId,
        userId,
        OR: [{ loveYouDate: null }, { loveYouDate: { not: today } }],
      },
      data: { loveYouCount: { increment: 1 }, loveYouDate: today },
    });
    if (applied.count === 0) {
      throw new BadRequestException('Already sent today, come back tomorrow');
    }
    // 仅在自增真正生效时才发消息 + 评估里程碑
    await this.prisma.message.create({ data: { matchId, senderId: userId, content: 'I love you' } });
    const [updated, partnerState] = await Promise.all([
      this.prisma.coupleMemberState.findUnique({
        where: { matchId_userId: { matchId, userId } },
      }),
      this.prisma.coupleMemberState.findUnique({
        where: { matchId_userId: { matchId, userId: partnerId } },
      }),
    ]);
    const bothReached =
      ((updated as any)?.loveYouCount || 0) >= 100 && ((partnerState as any)?.loveYouCount || 0) >= 100;
    if (bothReached) {
      const profs = await this.prisma.profile.findMany({
        where: { userId: { in: [userId, partnerId] } },
        select: { userId: true, nickname: true },
      });
      const nameOf = (uid: string) => profs.find((p) => p.userId === uid)?.nickname || 'your partner';
      // 幂等去重：check + create 放进同一 Serializable 事务，并发两侧不会重复发里程碑通知。
      await this.prisma.$transaction(
        async (tx) => {
          const already = await tx.notification.findFirst({
            where: {
              type: 'milestone',
              AND: [
                { metadata: { path: ['kind'], equals: 'love_you_100' } },
                { metadata: { path: ['matchId'], equals: matchId } },
              ],
            },
          });
          if (already) return;
          for (const uid of [userId, partnerId]) {
            const other = uid === userId ? partnerId : userId;
            await tx.notification.create({
              data: {
                userId: uid,
                type: 'milestone',
                isRead: false,
                title: 'A secret unlocked',
                body: `You and ${nameOf(other)} have each said "I love you" 100 times. Here is to many more.`,
                metadata: { kind: 'love_you_100', matchId },
              },
            });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }
    return this.getSpace(userId, matchId);
  }

  // 今日状态/心情（显示在顶部卡片）
  async setStatus(userId: string, matchId: string, status: string) {
    await this.assertMember(userId, matchId);
    await this.prisma.coupleMemberState.upsert({
      where: { matchId_userId: { matchId, userId } },
      create: { matchId, userId, status: status || '' },
      update: { status: status || '' },
    });
    return this.getSpace(userId, matchId);
  }

  // 今天想吃：每次输入入历史
  async addCraving(userId: string, matchId: string, text: string) {
    await this.assertMember(userId, matchId);
    if (!text || !text.trim()) throw new BadRequestException('Content is required');
    await this.prisma.coupleCravingEntry.create({ data: { matchId, userId, text: text.trim() } });
    return this.getSpace(userId, matchId);
  }

  // 近期安排：带起止时间
  async addSchedule(
    userId: string,
    matchId: string,
    dto: { text: string; startAt: string; endAt: string },
  ) {
    await this.assertMember(userId, matchId);
    if (!dto.text || !dto.text.trim()) throw new BadRequestException('Content is required');
    if (!dto.startAt || !dto.endAt) throw new BadRequestException('Start and end time are required');
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) throw new BadRequestException('Invalid time');
    if (endAt.getTime() < startAt.getTime()) throw new BadRequestException('End time cannot be earlier than start time');
    await this.prisma.coupleScheduleEntry.create({
      data: { matchId, userId, text: dto.text.trim(), startAt, endAt },
    });
    return this.getSpace(userId, matchId);
  }

  async deleteSchedule(userId: string, matchId: string, id: string) {
    await this.assertMember(userId, matchId);
    // 仅能删自己的安排
    await this.prisma.coupleScheduleEntry.deleteMany({ where: { id, matchId, userId } });
    return this.getSpace(userId, matchId);
  }

  async addAnniversary(userId: string, matchId: string, dto: { title: string; date: string }) {
    await this.assertMember(userId, matchId);
    if (!dto.title || !dto.date) throw new BadRequestException('Title and date are required');
    const date = new Date(dto.date);
    if (isNaN(date.getTime())) throw new BadRequestException('Invalid date format');
    await this.prisma.coupleAnniversary.create({
      data: { matchId, title: dto.title, date, createdBy: userId },
    });
    return this.getSpace(userId, matchId);
  }

  // 编辑纪念日（标题/日期/图文，本轮反馈6b）——双方都可改
  async updateAnniversary(
    userId: string,
    matchId: string,
    id: string,
    dto: { title?: string; date?: string; note?: string; image?: string; images?: string[] },
  ) {
    await this.assertMember(userId, matchId);
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.date !== undefined) {
      const d = new Date(dto.date);
      if (isNaN(d.getTime())) throw new BadRequestException('Invalid date format');
      data.date = d;
    }
    if (dto.note !== undefined) data.note = dto.note || null;
    if (dto.image !== undefined) data.image = dto.image || null;
    if (dto.images !== undefined) data.images = dto.images || [];
    await this.prisma.coupleAnniversary.updateMany({ where: { id, matchId }, data });
    return this.getSpace(userId, matchId);
  }

  async deleteAnniversary(userId: string, matchId: string, id: string) {
    await this.assertMember(userId, matchId);
    await this.prisma.coupleAnniversary.deleteMany({ where: { id, matchId } });
    return this.getSpace(userId, matchId);
  }

  async addBucket(userId: string, matchId: string, dto: { text: string }) {
    await this.assertMember(userId, matchId);
    if (!dto.text) throw new BadRequestException('Content is required');
    await this.prisma.coupleBucketItem.create({
      data: { matchId, text: dto.text, createdBy: userId },
    });
    return this.getSpace(userId, matchId);
  }

  // 打勾完成（可附文字+图片）/ 取消打勾
  async toggleBucket(
    userId: string,
    matchId: string,
    id: string,
    dto: { done: boolean; note?: string; image?: string; images?: string[] },
  ) {
    await this.assertMember(userId, matchId);
    const data = dto.done
      ? {
          done: true,
          doneBy: userId,
          doneNote: dto.note || null,
          doneImages: dto.images && dto.images.length ? dto.images : (dto.image ? [dto.image] : []),
          doneImage: null,
        }
      : { done: false, doneBy: null, doneNote: null, doneImages: [], doneImage: null };
    await this.prisma.coupleBucketItem.updateMany({ where: { id, matchId }, data });
    return this.getSpace(userId, matchId);
  }

  async deleteBucket(userId: string, matchId: string, id: string) {
    await this.assertMember(userId, matchId);
    const item = await this.prisma.coupleBucketItem.findFirst({ where: { id, matchId } });
    if (!item) return this.getSpace(userId, matchId);
    if (item.done) throw new BadRequestException('Completed plans cannot be deleted');
    await this.prisma.coupleBucketItem.deleteMany({ where: { id, matchId, done: false } });
    return this.getSpace(userId, matchId);
  }
}
