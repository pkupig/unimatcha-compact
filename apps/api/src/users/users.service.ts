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
    // 行锁串行化读-改-写：仅覆盖 pushEnabled/privacy，notes/chatBackgrounds/coupleCovers/
    // nudgeSuffix 等兄弟键原样保留；避免与其它 settings 端点并发时互相丢更新。
    let nextPushEnabled = DEFAULT_SETTINGS.pushEnabled;
    let nextPrivacy: Record<string, unknown> = { ...DEFAULT_SETTINGS.privacy };
    await this.prisma.updateUserSettings(userId, (raw) => {
      const shaped = this.mergeWithDefaults(raw);
      nextPushEnabled = typeof dto.pushEnabled === 'boolean' ? dto.pushEnabled : shaped.pushEnabled;
      nextPrivacy = { ...shaped.privacy };
      if (dto.privacy && typeof dto.privacy === 'object') {
        for (const key of PRIVACY_KEYS) {
          if (typeof dto.privacy[key] === 'boolean') {
            nextPrivacy[key] = dto.privacy[key] as boolean;
          }
        }
      }
      return { ...raw, pushEnabled: nextPushEnabled, privacy: nextPrivacy };
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
    const trimmed = (note || '').trim().slice(0, 30);
    // 行锁串行化：只改 settings.notes[targetUserId]，保留其它兄弟键，避免并发丢更新
    await this.prisma.updateUserSettings(userId, (settings) => {
      const notes = { ...(settings.notes || {}) };
      if (trimmed) notes[targetUserId] = trimmed;
      else delete notes[targetUserId];
      return { ...settings, notes };
    });
    return { targetUserId, note: trimmed || null };
  }

  // findAll / updateStatus / resetUserMode / updateVerificationStatus
  // 四个 admin 专用方法已迁至 users-admin.service.ts（Step6）

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

}
