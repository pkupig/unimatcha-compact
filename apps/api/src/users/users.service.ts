import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from '../profiles/profiles.service';
import { CreateProfileDto } from '../profiles/dto/profile.dto';

const PRIVACY_KEYS = ['showProfile', 'showOnline', 'showMoments'] as const;

const DEFAULT_SETTINGS = {
  pushEnabled: true,
  privacy: { showProfile: true, showOnline: true, showMoments: true },
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private profilesService: ProfilesService,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, status: true,
        verificationStatus: true,
        createdAt: true,
        // 双模式：每模式状态迁入 UserModeState
        modeStates: {
          select: { mode: true, matchState: true, matchSearchingSince: true },
        },
        profile: {
          select: {
            nickname: true, realName: true, familyName: true, givenName: true,
            school: true, grade: true, gender: true,
            genderPref: true, age: true, city: true, interests: true,
            bio: true, avatarUrl: true, socialLinks: true,
            relationshipScore: true, profileCompleteness: true,
            signature: true, coverUrl: true, tags: true,
            major: true, mbti: true, nationality: true, realPhotos: true, zodiac: true,
            wishGifts: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    // 供前端登录路由判断：是否已填资料 / 是否已完成问卷
    const answerCount = await this.prisma.answer.count({ where: { userId: id } });
    return {
      ...user,
      hasProfile: !!(user.profile && user.profile.nickname),
      completedQuestionnaire: answerCount > 0,
    };
  }

  async updateMyProfile(userId: string, dto: CreateProfileDto) {
    return this.profilesService.upsertProfile(userId, dto);
  }

  async getPublicProfile(viewerId: string, targetUserId: string) {
    const isSelf = viewerId === targetUserId;
    // 已确认连接（恋人 / 已确认好友）可看完整资料：封面、真实照片墙、真实姓名、认识天数
    const connection = isSelf ? null : await this.getConfirmedMatch(viewerId, targetUserId);

    if (isSelf || connection) {
      const full = await this.profilesService.getFullPublicProfile(targetUserId);
      if (!full) throw new NotFoundException('User not found or profile not completed');
      if (connection) {
        const anchor =
          connection.relationshipStartedAt || connection.confirmedAt || connection.createdAt;
        if (anchor) {
          (full as any).daysKnown = Math.max(
            0,
            Math.floor((Date.now() - new Date(anchor).getTime()) / 86400000),
          );
        }
      }
      return full;
    }

    // 陌生人：仅严格公开字段 + 隐私设置（不含封面 / 真实照片墙 / 真实姓名）
    const profile = await this.profilesService.getPublicProfile(targetUserId);
    if (!profile) throw new NotFoundException('User not found or profile not completed');
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { settings: true },
    });
    const { privacy } = this.mergeWithDefaults(target?.settings);
    if (!privacy.showProfile) {
      return { nickname: profile.nickname, avatarUrl: profile.avatarUrl, hidden: true };
    }
    // 陌生人一律不暴露封面 / 真实照片墙 / 真实姓名（fail-closed，
    // 无论 public_profile_fields 配置是否存在）
    delete (profile as any).coverUrl;
    delete (profile as any).realPhotos;
    delete (profile as any).realName;
    return profile;
  }

  // 已确认连接的 Match（恋人 RELATIONSHIP_ROMANTIC/RELATIONSHIP_MODE 或已确认好友 FRIEND_CONFIRMED）
  // 用于决定是否返回完整资料 + 计算认识天数。
  private async getConfirmedMatch(viewerId: string, targetUserId: string) {
    return this.prisma.match.findFirst({
      where: {
        status: { in: ['RELATIONSHIP_ROMANTIC', 'RELATIONSHIP_MODE', 'FRIEND_CONFIRMED'] },
        dissolvedAt: null,
        OR: [
          { userAId: viewerId, userBId: targetUserId },
          { userAId: targetUserId, userBId: viewerId },
        ],
      },
      select: {
        id: true,
        status: true,
        relationshipStartedAt: true,
        confirmedAt: true,
        createdAt: true,
      },
    });
  }

  // 查找好友（本轮反馈3）：按昵称/学校模糊搜索，排除自己与封禁用户，标注与我的现有关系。
  async searchUsers(viewerId: string, q: string, limit = 20) {
    const term = (q || '').trim();
    if (term.length < 1) return { users: [] };
    const profiles = await this.prisma.profile.findMany({
      where: {
        userId: { not: viewerId },
        user: { status: { not: 'BANNED' } },
        OR: [
          { nickname: { contains: term, mode: 'insensitive' } },
          { school: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: { userId: true, nickname: true, avatarUrl: true, school: true },
      take: Math.min(30, Math.max(1, limit)),
    });
    const ids = profiles.map((p) => p.userId);
    const matches = ids.length
      ? await this.prisma.match.findMany({
          where: {
            dissolvedAt: null,
            status: {
              in: [
                'RELATIONSHIP_ROMANTIC',
                'RELATIONSHIP_MODE',
                'FRIEND_CONFIRMED',
                'MATCHED_FRIEND',
                'MATCHED_ROMANTIC',
              ],
            },
            OR: [
              { userAId: viewerId, userBId: { in: ids } },
              { userBId: viewerId, userAId: { in: ids } },
            ],
          },
          select: { userAId: true, userBId: true, status: true },
        })
      : [];
    const relOf = (uid: string) => {
      const m = matches.find((x) => x.userAId === uid || x.userBId === uid);
      if (!m) return 'none';
      if (m.status === 'RELATIONSHIP_ROMANTIC' || m.status === 'RELATIONSHIP_MODE') return 'romantic';
      if (m.status === 'FRIEND_CONFIRMED') return 'friend';
      return 'pending';
    };
    return {
      users: profiles.map((p) => ({
        id: p.userId,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl,
        school: p.school,
        relationship: relOf(p.userId),
      })),
    };
  }

  // 旧端点（无 mode 参数）：默认返回恋人模式状态，读 UserModeState
  async getMyMatchStatus(userId: string, mode: 'romantic' | 'friend' = 'romantic') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const modeState = await this.prisma.userModeState.findUnique({
      where: { userId_mode: { userId, mode } },
      select: { mode: true, matchState: true, matchSearchingSince: true },
    });

    const matchConfig = await this.prisma.matchConfig.findFirst({
      where: { isEnabled: true },
    });

    // 当前活跃对话：该模式下的临时/永久状态
    const activeStatuses =
      mode === 'friend'
        ? ['MATCHED_FRIEND', 'FRIEND_CONFIRMING', 'FRIEND_CONFIRMED']
        : ['MATCHED_ROMANTIC', 'ROMANTIC_CONFIRMING', 'RELATIONSHIP_ROMANTIC', 'RELATIONSHIP_MODE'];
    const activeMatch = await this.prisma.match.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: { in: activeStatuses as any },
      },
      orderBy: { createdAt: 'desc' },
    });

    const matchState = modeState?.matchState ?? 'idle';
    return {
      mode,
      matchState,
      matchSearchingSince: modeState?.matchSearchingSince ?? null,
      matchConfig: matchConfig
        ? { cronExpr: matchConfig.cronExpr, description: matchConfig.description }
        : null,
      currentMatch: activeMatch ? { id: activeMatch.id, status: activeMatch.status } : null,
      isSearching: matchState === 'searching',
    };
  }

  // ─── 用户设置 ───────────────────────────────────────────
  async getSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.mergeWithDefaults(user.settings);
  }

  async updateSettings(
    userId: string,
    dto: { pushEnabled?: boolean; privacy?: Record<string, unknown> },
  ) {
    // 读取原始存储的 settings，保留 notes/chatBackgrounds/coupleCovers/nudgeSuffix 等兄弟键
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const raw = (user.settings && typeof user.settings === 'object'
      ? (user.settings as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const shaped = this.mergeWithDefaults(raw);

    // 只挑认识的键合并，防止写入无关数据
    const nextPushEnabled =
      typeof dto.pushEnabled === 'boolean' ? dto.pushEnabled : shaped.pushEnabled;
    const nextPrivacy = { ...shaped.privacy };
    if (dto.privacy && typeof dto.privacy === 'object') {
      for (const key of PRIVACY_KEYS) {
        if (typeof dto.privacy[key] === 'boolean') {
          nextPrivacy[key] = dto.privacy[key] as boolean;
        }
      }
    }

    // 写库时基于原始 settings 展开，仅覆盖 pushEnabled/privacy，其余兄弟键原样保留
    const persisted = { ...raw, pushEnabled: nextPushEnabled, privacy: nextPrivacy };
    await this.prisma.user.update({
      where: { id: userId },
      data: { settings: persisted },
    });
    // mergeWithDefaults 仅用于塑形客户端响应，不作为写库的值
    return { pushEnabled: nextPushEnabled, privacy: nextPrivacy };
  }

  private mergeWithDefaults(stored: unknown) {
    const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
    const p = (s.privacy && typeof s.privacy === 'object' ? s.privacy : {}) as Record<string, unknown>;
    const privacy = { ...DEFAULT_SETTINGS.privacy };
    for (const key of PRIVACY_KEYS) {
      if (typeof p[key] === 'boolean') privacy[key] = p[key] as boolean;
    }
    return {
      pushEnabled: typeof s.pushEnabled === 'boolean' ? s.pushEnabled : DEFAULT_SETTINGS.pushEnabled,
      privacy,
    };
  }

  // ─── 扫码加好友：获取/生成我的连接码（二维码编码它）───────────────
  async getOrCreateConnectCode(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { connectCode: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.connectCode) return { connectCode: user.connectCode };
    for (let i = 0; i < 5; i++) {
      const code = 'CL' + Math.random().toString(36).slice(2, 10).toUpperCase();
      try {
        const updated = await this.prisma.user.update({
          where: { id: userId },
          data: { connectCode: code },
          select: { connectCode: true },
        });
        return { connectCode: updated.connectCode };
      } catch {
        // 唯一码碰撞，重试
      }
    }
    throw new BadRequestException('Failed to generate connection code, please try again');
  }

  // ─── 备注（#3）：本人对某用户的备注存入 settings.notes ───────────────
  async setNote(userId: string, targetUserId: string, note: string) {
    if (!targetUserId) throw new BadRequestException('Missing targetUserId');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { settings: true } });
    const settings: any = (user?.settings as any) || {};
    const notes = settings.notes || {};
    const trimmed = (note || '').trim().slice(0, 30);
    if (trimmed) notes[targetUserId] = trimmed;
    else delete notes[targetUserId];
    settings.notes = notes;
    await this.prisma.user.update({ where: { id: userId }, data: { settings } });
    return { targetUserId, note: trimmed || null };
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    school?: string;
  }) {
    // Number()||default：ValidationPipe 的 enableImplicitConversion 会把缺省 query 转成 NaN，
    // 绕过解构默认值 → skip=NaN → Prisma 500。统一强转并兜底/夹取，缺 page 也安全。
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const { search, status, school } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { profile: { nickname: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    // 学校过滤（学生会 scope）：profile.school 与 School.name 字符串相等匹配（ADMIN-REDESIGN §4）
    if (school) where.profile = { school };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, status: true, verificationStatus: true, createdAt: true,
          studentCardUrl: true, schoolEmail: true,
          // 双模式：每模式状态迁入 UserModeState
          modeStates: {
            select: { mode: true, matchState: true, matchSearchingSince: true },
          },
          profile: {
            select: {
              nickname: true, school: true, profileCompleteness: true,
              socialLinks: true, relationshipScore: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateStatus(userId: string, status: 'ACTIVE' | 'BANNED') {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, email: true, status: true },
    });
  }

  // 管理员重置用户匹配模式（双模式）：
  // 临时对话 → EXPIRED，已确认关系 → DISSOLVED，并把双方相应模式的状态机重置为 idle
  async resetUserMode(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 临时对话状态（48h 倒计时中，可聊未确认）
      const tempStatuses = [
        'MATCHED_ROMANTIC', 'ROMANTIC_CONFIRMING',
        'MATCHED_FRIEND', 'FRIEND_CONFIRMING',
      ];
      // 已确认永久关系（RELATIONSHIP_MODE 为旧数据兼容）
      const confirmedStatuses = [
        'RELATIONSHIP_ROMANTIC', 'FRIEND_CONFIRMED', 'RELATIONSHIP_MODE',
      ];

      // 清理该用户名下所有未完结的 Match（临时 + 永久），并恢复对方相应模式状态
      const activeMatches = await tx.match.findMany({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          status: { in: [...tempStatuses, ...confirmedStatuses] as any },
        },
        select: { id: true, userAId: true, userBId: true, status: true, mode: true },
      });

      for (const m of activeMatches) {
        const partnerId = m.userAId === userId ? m.userBId : m.userAId;
        // match.mode 枚举 ROMANTIC/FRIEND → 小写字符串
        const modeStr = m.mode === 'FRIEND' ? 'friend' : 'romantic';
        const isTemp = tempStatuses.includes(m.status as string);

        if (isTemp) {
          await tx.match.update({ where: { id: m.id }, data: { status: 'EXPIRED' } });
        } else {
          await tx.match.update({
            where: { id: m.id },
            data: { status: 'DISSOLVED', dissolvedAt: new Date(), dissolveReason: 'Admin reset user mode' },
          });
          // 清掉该关系下的未读标记，避免对方残留过期关系的未读角标
          await tx.message.updateMany({
            where: { matchId: m.id, isRead: false },
            data: { isRead: true },
          });
        }

        // 对方对应模式恢复为 idle；关联广场帖按 match.status 自动隐藏，无需删除
        await tx.userModeState.upsert({
          where: { userId_mode: { userId: partnerId, mode: modeStr } },
          update: { matchState: 'idle', matchSearchingSince: null, weeklyMatchNote: null },
          create: { userId: partnerId, mode: modeStr, matchState: 'idle' },
        });
      }

      // 被重置用户的两个模式状态全部回到 idle
      for (const mode of ['romantic', 'friend'] as const) {
        await tx.userModeState.upsert({
          where: { userId_mode: { userId, mode } },
          update: { matchState: 'idle', matchSearchingSince: null, weeklyMatchNote: null },
          create: { userId, mode, matchState: 'idle' },
        });
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });
      return { ...user, matchState: 'idle' };
    });
  }

  // ─── 学生认证：发送学校邮箱验证码 ───────────────────────────
  // 无 SMTP/邮件服务 → 开发模式：生成验证码，写日志并随响应返回 devCode 供测试。
  // 接入邮件服务后改为真实发送，并移除返回的 devCode（见下方 TODO）。
  async sendVerificationCode(userId: string, schoolEmail: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { verificationStatus: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.verificationStatus === 'verified') {
      throw new BadRequestException('You have already been verified');
    }
    const email = (schoolEmail || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('Invalid email format');
    }
    if (!/(\.edu|\.ac\.)/.test(email)) {
      throw new BadRequestException('Please use a school email (must contain .edu or .ac.)');
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        verifyCode: code,
        verifyCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        schoolEmail: email,
      },
    });
    // TODO(SMTP): 接入邮件服务后在此真实发送验证码，并删除响应中的 devCode。
    console.log(`[verify] code for ${email} (user ${userId}): ${code}`);
    return {
      message: 'Verification code sent (dev mode: no email service connected, code shown below)',
      devCode: code,
      expiresInSec: 600,
    };
  }

  // ─── 学生认证：提交（学生卡照片 + 已验邮箱）→ pending，等管理员审核 ───
  async submitVerification(
    userId: string,
    dto: { studentCardUrl?: string; schoolEmail?: string; code?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        verificationStatus: true, verifyCode: true,
        verifyCodeExpiresAt: true, schoolEmail: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.verificationStatus === 'verified') {
      throw new BadRequestException('You have already been verified');
    }
    if (user.verificationStatus === 'pending') {
      throw new BadRequestException('Your verification application is under review, please wait');
    }
    const cardUrl = (dto.studentCardUrl || '').trim();
    if (!cardUrl) throw new BadRequestException('Please upload your student card photo first');
    const email = (dto.schoolEmail || '').trim().toLowerCase();
    const code = (dto.code || '').trim();
    if (!user.verifyCode || !user.verifyCodeExpiresAt) {
      throw new BadRequestException('Please request an email verification code first');
    }
    if (user.verifyCodeExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification code has expired, please request a new one');
    }
    if (!email || email !== (user.schoolEmail || '')) {
      throw new BadRequestException('Email does not match the verification code, please request a new one');
    }
    if (code !== user.verifyCode) {
      throw new BadRequestException('Incorrect verification code');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        verificationStatus: 'pending',
        studentCardUrl: cardUrl,
        schoolEmail: email,
        verifyCode: null,
        verifyCodeExpiresAt: null,
      },
      select: { id: true, verificationStatus: true },
    });
    return { message: 'Verification materials submitted, awaiting admin review', ...updated };
  }

  // ─── 管理后台更新认证状态 ────────────────────────────────
  async updateVerificationStatus(
    userId: string,
    status: 'unverified' | 'pending' | 'verified' | 'rejected',
  ) {
    const validStatuses = ['unverified', 'pending', 'verified', 'rejected'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException('Invalid verification status');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: status },
      select: { id: true, email: true, verificationStatus: true },
    });
  }
}
