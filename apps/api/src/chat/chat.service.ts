import {
  Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchFeedbackService } from '../matching/feedback/match-feedback.service';
import { RealtimeService } from '../realtime/realtime.service';

import {
  ALL_CHATTABLE,
  CONFIRM_WINDOW_MS,
  fromMatchMode,
  isConfirmedStatus,
  isTempStatus,
  toMatchMode,
  type ModeStr,
} from '../matching/mode.util';

// 会话列表查询的可选范围：'all' = 不限模式
type SessionMode = ModeStr | 'all';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private matchFeedback: MatchFeedbackService,
    private realtime: RealtimeService,
  ) {}

  // 只读历史（可拉消息，但禁止发送）：已解除 / 已过期 / 被拒
  private static readonly READ_ONLY_STATUSES = ['DISSOLVED', 'EXPIRED', 'REJECTED'];

  // ─── 校验用户是否属于该 match ─────────────────────────────
  private async verifyMatchAccess(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, status: true, mode: true, userAId: true, userBId: true, createdAt: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException('You are not part of this match');
    }
    // 权限放开（§4.1）：临时对话（ALL_CHATTABLE 之 temp）+ 永久对话均可聊；
    // 只读历史状态（DISSOLVED/EXPIRED/REJECTED）允许进入查看，但发送时再拦截。
    const chattable = [...ALL_CHATTABLE, ...ChatService.READ_ONLY_STATUSES];
    if (!chattable.includes(match.status)) {
      throw new ForbiddenException('This match is not currently available for chat');
    }
    return match;
  }

  // ─── 获取消息列表（分页，按时间升序） ───────────────────
  async getMessages(
    matchId: string,
    userId: string,
    params: { cursor?: string; limit?: number },
  ) {
    await this.verifyMatchAccess(matchId, userId);

    const limit = Math.min(params.limit ?? 50, 100);
    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      ...(params.cursor
        ? {
            cursor: { id: params.cursor },
            skip: 1, // skip the cursor item itself
          }
        : {}),
      select: {
        id: true,
        content: true,
        imageUrl: true,
        kind: true,
        senderId: true,
        isRead: true,
        createdAt: true,
      },
    });

    // 标记对方发来的消息为已读
    const unreadIds = messages
      .filter((m) => m.senderId !== userId && !m.isRead)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      await this.prisma.message.updateMany({
        where: { id: { in: unreadIds } },
        data: { isRead: true },
      });
    }

    const nextCursor =
      messages.length === limit ? messages[messages.length - 1].id : null;

    return { messages, nextCursor };
  }

  // ─── 发送消息 ─────────────────────────────────────────────
  async sendMessage(
    matchId: string,
    userId: string,
    payload: { content?: string; imageUrl?: string },
  ) {
    const content = payload.content?.trim() ?? '';
    const imageUrl = payload.imageUrl?.trim() || null;
    if (!content && !imageUrl) {
      throw new BadRequestException('At least one of message content or image is required');
    }

    const match = await this.verifyMatchAccess(matchId, userId);
    // 只读历史状态禁写（保留查看权限）
    if (ChatService.READ_ONLY_STATUSES.includes(match.status)) {
      throw new ForbiddenException('This chat has ended, you cannot send new messages');
    }
    // 临时对话超过 48h 未确认即视为过期：禁写（过期 job 可能尚未将状态切到 EXPIRED）
    if (
      isTempStatus(match.status) &&
      match.createdAt.getTime() + CONFIRM_WINDOW_MS < Date.now()
    ) {
      throw new ForbiddenException('This chat has ended, you cannot send new messages');
    }

    const message = await this.prisma.message.create({
      data: { matchId, senderId: userId, content, imageUrl },
      select: {
        id: true,
        content: true,
        imageUrl: true,
        kind: true,
        senderId: true,
        isRead: true,
        createdAt: true,
      },
    });

    // touch match.updatedAt：保证会话列表按最近活跃倒序（§4.2）
    await this.prisma.match.update({
      where: { id: matchId },
      data: { updatedAt: new Date() },
    });

    // SSE：给对端推「有新消息」失效事件（无连接则静默丢弃，降频轮询兜底）
    const recipientId = match.userAId === userId ? match.userBId : match.userAId;
    this.realtime.emitToUser(recipientId, { type: 'message', matchId });

    // 行为埋点（P0-2）：本人在该 match 的第 1 条记 firstMessage，其余记 message；失败不影响发送
    const senderCount = await this.prisma.message.count({
      where: { matchId, senderId: userId },
    });
    void this.matchFeedback.logEvent({
      matchId,
      mode: fromMatchMode(match.mode),
      userAId: match.userAId,
      userBId: match.userBId,
      actorId: userId,
      type: senderCount <= 1 ? 'firstMessage' : 'message',
    });

    this.logger.debug(`Message sent in match ${matchId} by user ${userId}`);
    return message;
  }

  // ─── 会话列表（临时对话 + 永久对话统一入口，§4.2） ────────
  async getConversationSessions(
    userId: string,
    opts: { mode?: SessionMode; limit?: number } = {},
  ) {
    const mode: SessionMode = opts.mode ?? 'all';
    const limit = Math.min(opts.limit ?? 50, 100);

    // 临时（temp）+ 永久（confirmed）一并返回；
    // EXPIRED/DISSOLVED/REJECTED 不进列表（对话从列表消失）。
    const where: {
      status: { in: string[] };
      dissolvedAt: null;
      OR: Array<{ userAId: string } | { userBId: string }>;
      mode?: ReturnType<typeof toMatchMode>;
    } = {
      status: { in: ALL_CHATTABLE },
      dissolvedAt: null,
      OR: [{ userAId: userId }, { userBId: userId }],
    };
    if (mode !== 'all') where.mode = toMatchMode(mode);

    const matches = await this.prisma.match.findMany({
      where: where as any,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        mode: true,
        status: true,
        userAId: true,
        userBId: true,
        userAConfirmed: true,
        userBConfirmed: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            imageUrl: true,
            kind: true,
            senderId: true,
            isRead: true,
            createdAt: true,
          },
        },
      },
    });

    if (matches.length === 0) {
      return { sessions: [], total: 0 };
    }

    // 批量取 partner profile + unreadCount，避免 N+1
    const partnerIds = matches.map((m) =>
      m.userAId === userId ? m.userBId : m.userAId,
    );
    const matchIds = matches.map((m) => m.id);

    const [profiles, unread] = await Promise.all([
      this.prisma.profile.findMany({
        where: { userId: { in: partnerIds } },
        select: {
          userId: true,
          nickname: true,
          avatarUrl: true,
          school: true,
          gender: true,
          age: true,
        },
      }),
      this.prisma.message.groupBy({
        by: ['matchId'],
        where: {
          matchId: { in: matchIds },
          senderId: { not: userId },
          isRead: false,
        },
        _count: { _all: true },
      }),
    ]);

    const profMap = new Map(profiles.map((p) => [p.userId, p]));
    const unreadMap = new Map(unread.map((u) => [u.matchId, u._count._all]));
    // #3 备注：本人对各对象的备注存在 settings.notes，列表里优先显示备注
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { settings: true } });
    const notes = ((me?.settings as any)?.notes) || {};
    const backgrounds = ((me?.settings as any)?.chatBackgrounds) || {}; // #7 各自的聊天背景

    const now = Date.now();
    const sessions = matches.map((m) => {
      const isA = m.userAId === userId;
      const pid = isA ? m.userBId : m.userAId;
      const temp = isTempStatus(m.status);
      const prof = profMap.get(pid);
      return {
        matchId: m.id,
        mode: m.mode.toLowerCase(),
        status: m.status,
        // temp（未确认，带 48h 倒计时）| confirmed（已确认，永久）
        sessionType: temp ? 'temp' : 'confirmed',
        // 临时对话剩余毫秒（48h - 已过）；永久对话为 null
        remainingMs: temp
          ? Math.max(0, m.createdAt.getTime() + CONFIRM_WINDOW_MS - now)
          : null,
        myConfirmed: isA ? m.userAConfirmed : m.userBConfirmed,
        partnerConfirmed: isA ? m.userBConfirmed : m.userAConfirmed,
        partner: {
          id: pid,
          note: notes[pid] ?? null,
          nickname: prof?.nickname ?? null,
          avatarUrl: prof?.avatarUrl ?? null,
          school: prof?.school ?? null,
          gender: prof?.gender ?? null,
          age: prof?.age ?? null,
        },
        lastMessage: m.messages[0] ?? null,
        unreadCount: unreadMap.get(m.id) ?? 0,
        chatBackground: backgrounds[m.id] ?? null,
        updatedAt: m.updatedAt,
      };
    });

    return { sessions, total: sessions.length };
  }

  // ─── 设置/清除我的聊天背景（本轮反馈7，各自设各自的；仅已确认对话）──
  async setChatBackground(matchId: string, userId: string, imageUrl: string | null) {
    const match = await this.verifyMatchAccess(matchId, userId);
    // 正向校验：仅已确认（永久）对话可设背景，拒绝 temp 及只读历史（DISSOLVED/EXPIRED/REJECTED）
    if (!isConfirmedStatus(match.status)) {
      throw new ForbiddenException('Only confirmed chats can set a background');
    }
    // 行锁串行化读-改-写，避免与其它 settings 端点并发时互相丢更新（FOR UPDATE）
    await this.prisma.updateUserSettings(userId, (settings) => {
      const backgrounds = { ...(settings.chatBackgrounds || {}) };
      if (imageUrl) backgrounds[matchId] = imageUrl;
      else delete backgrounds[matchId];
      return { ...settings, chatBackgrounds: backgrounds };
    });
    return { chatBackground: imageUrl || null };
  }

  // 拍一拍（本轮反馈3）：在已确认对话里发一条「X 拍了拍 Y{后缀}」系统消息。
  // 后缀取「被拍者」自定义的 nudgeSuffix（微信式：你设置别人拍你时显示的话）。
  async nudge(matchId: string, userId: string) {
    const match = await this.verifyMatchAccess(matchId, userId);
    // 正向校验：仅已确认（永久）对话可拍一拍，拒绝 temp 及只读历史（DISSOLVED/EXPIRED/REJECTED）
    if (!isConfirmedStatus(match.status)) {
      throw new ForbiddenException('Only confirmed chats can use Nudge');
    }
    const partnerId = match.userAId === userId ? match.userBId : match.userAId;
    const [meProf, partnerProf, partnerUser] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId }, select: { nickname: true } }),
      this.prisma.profile.findUnique({ where: { userId: partnerId }, select: { nickname: true } }),
      this.prisma.user.findUnique({ where: { id: partnerId }, select: { settings: true } }),
    ]);
    const suffix = ((partnerUser?.settings as any)?.nudgeSuffix) || '';
    const myName = meProf?.nickname || 'Someone';
    const partnerName = partnerProf?.nickname || 'them';
    const content = `${myName} nudged ${partnerName}${suffix}`;
    // kind:'nudge' 让 H5 据字段判定拍一拍，免去对 content 的字符串匹配
    const msg = await this.prisma.message.create({ data: { matchId, senderId: userId, content, kind: 'nudge' } });
    // 与 sendMessage 一致 touch updatedAt：会话列表按 updatedAt 倒序，否则拍一拍产生新消息却不置顶
    await this.prisma.match.update({ where: { id: matchId }, data: { updatedAt: new Date() } });
    this.realtime.emitToUser(partnerId, { type: 'message', matchId });
    return { ok: true, messageId: msg.id, content };
  }

  // 自定义「别人拍我」的后缀文案（设置里，本轮反馈3）
  async setNudgeSuffix(userId: string, suffix: string) {
    const clean = (suffix || '').slice(0, 40);
    // 行锁串行化读-改-写，避免与其它 settings 端点并发时互相丢更新（FOR UPDATE）
    await this.prisma.updateUserSettings(userId, (settings) => ({ ...settings, nudgeSuffix: clean }));
    return { nudgeSuffix: clean };
  }

  // ─── 标记消息已读 ─────────────────────────────────────────
  async markRead(matchId: string, userId: string) {
    const match = await this.verifyMatchAccess(matchId, userId);

    const result = await this.prisma.message.updateMany({
      where: { matchId, senderId: { not: userId }, isRead: false },
      data: { isRead: true },
    });
    // SSE：给对方（消息发送者）推已读事件，「已读」小字即时点亮
    if (result.count > 0) {
      const senderId = match.userAId === userId ? match.userBId : match.userAId;
      this.realtime.emitToUser(senderId, { type: 'read', matchId });
    }

    return { markedRead: result.count };
  }

  // ─── 获取未读数量 ─────────────────────────────────────────
  async getUnreadCount(matchId: string, userId: string) {
    await this.verifyMatchAccess(matchId, userId);

    const count = await this.prisma.message.count({
      where: { matchId, senderId: { not: userId }, isRead: false },
    });

    return { unreadCount: count };
  }

  // ─── 轮询：获取最新消息（用于 H5/iOS 轮询） ──────────────
  async pollMessages(
    matchId: string,
    userId: string,
    afterId?: string,
  ) {
    await this.verifyMatchAccess(matchId, userId);

    // 先一次性解析游标。若 afterId 指向的消息不存在（已删/非法），返回空而非回退 epoch-0
    // 拉全量历史（否则轮询热路径会突然重渲整段会话并把全部消息重标已读）。
    let afterCreatedAt: Date | null = null;
    if (afterId) {
      const anchor = await this.prisma.message.findUnique({
        where: { id: afterId },
        select: { createdAt: true },
      });
      if (!anchor) return { messages: [] };
      afterCreatedAt = anchor.createdAt;
    }

    const messages = await this.prisma.message.findMany({
      where: {
        matchId,
        // 复合游标 (createdAt, id)：仅按 createdAt > anchor 会漏掉与 anchor 同毫秒的兄弟消息
        // （gt 排除相等），该消息将永远不被轮询拉到。加 id 次级判据，同毫秒也不丢不重。
        ...(afterCreatedAt
          ? {
              OR: [
                { createdAt: { gt: afterCreatedAt } },
                { createdAt: afterCreatedAt, id: { gt: afterId } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
      select: {
        id: true,
        content: true,
        imageUrl: true,
        kind: true,
        senderId: true,
        isRead: true,
        createdAt: true,
      },
    });

    // 标记为已读
    const unreadIds = messages
      .filter((m) => m.senderId !== userId && !m.isRead)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      await this.prisma.message.updateMany({
        where: { id: { in: unreadIds } },
        data: { isRead: true },
      });
    }

    return { messages };
  }
}
