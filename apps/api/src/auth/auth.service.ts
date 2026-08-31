import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  // 注册验证码：10 分钟有效、60 秒重发冷却、错 5 次作废（6 位码防爆破的硬前提）
  private static readonly CODE_TTL_MS = 10 * 60 * 1000;
  private static readonly CODE_RESEND_MS = 60 * 1000;
  private static readonly CODE_MAX_ATTEMPTS = 5;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  async sendRegisterCode(rawEmail: string) {
    const email = (rawEmail || '').trim().toLowerCase();
    // 注册端点本就以 409 明示「邮箱已注册」，这里保持同一口径，不构成新的枚举面
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('This email is already registered');
    }

    const key = { email_purpose: { email, purpose: 'register' } };
    const prior = await this.prisma.emailVerificationCode.findUnique({ where: key });
    // 冷却按签发时刻（expiresAt - TTL）算，不用 updatedAt——错误尝试会推 updatedAt，不该顺带冻结重发
    if (
      prior &&
      prior.expiresAt.getTime() - AuthService.CODE_TTL_MS + AuthService.CODE_RESEND_MS > Date.now()
    ) {
      throw new BadRequestException('Please wait a moment before requesting another code');
    }

    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + AuthService.CODE_TTL_MS);
    await this.prisma.emailVerificationCode.upsert({
      where: key,
      create: { email, purpose: 'register', code, expiresAt },
      update: { code, expiresAt, attempts: 0 },
    });

    if (this.mail.isConfigured) {
      try {
        await this.mail.sendVerificationCode(email, code, 'register');
      } catch (e) {
        // 没发出去就清掉本次码，别让 60s 冷却把用户卡在「收不到又不能重发」
        await this.prisma.emailVerificationCode.deleteMany({
          where: { email, purpose: 'register' },
        });
        throw e;
      }
      return { message: 'Verification code sent to your email', expiresInSec: 600 };
    }

    // 生产不允许 devCode 回退：漏配 MAIL_* 必须当场暴露，而不是静默绕过邮箱验证
    if (!this.mail.devFallbackAllowed) {
      await this.prisma.emailVerificationCode.deleteMany({
        where: { email, purpose: 'register' },
      });
      throw new ServiceUnavailableException('Email service is not configured');
    }

    // 开发回退：未配置 SMTP → 写日志并随响应返回 devCode
    console.log(`[register] code for ${email}: ${code}`);
    return {
      message: 'Verification code sent (dev mode: no email service configured, code shown below)',
      devCode: code,
      expiresInSec: 600,
    };
  }

  async register(dto: RegisterDto) {
    // 与 sendRegisterCode 同一归一化，否则大小写不同就对不上验证码
    const email = dto.email.trim().toLowerCase();
    const code = (dto.code || '').trim();

    // Check existing
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('This email is already registered');
    }

    // 校验邮箱验证码。先读一次只为给出准确的错误提示——
    // 真正的防爆破门在下面的原子占位，不依赖这次读到的值。
    const key = { email_purpose: { email, purpose: 'register' } };
    const row = await this.prisma.emailVerificationCode.findUnique({ where: key });
    if (!row) {
      throw new BadRequestException('Please request an email verification code first');
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification code has expired, please request a new one');
    }
    // 原子占用一次尝试名额（条件 UPDATE），比码放在占位之后：
    // 若像旧写法先 findUnique 判断 attempts 再增量，N 个并发请求会同时读到
    // attempts=0 全部放行，5 次上限对并发批量猜码形同虚设。
    const claimed = await this.prisma.emailVerificationCode.updateMany({
      where: {
        email,
        purpose: 'register',
        expiresAt: { gt: new Date() },
        attempts: { lt: AuthService.CODE_MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Too many incorrect attempts, please request a new code');
    }
    // 占位后重读再比码：读与占位之间若恰好重发过，旧 row.code 已是陈旧值
    const fresh = await this.prisma.emailVerificationCode.findUnique({ where: key });
    if (!fresh || code !== fresh.code) {
      throw new BadRequestException('Incorrect verification code');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    let user: { id: string; email: string; status: string; createdAt: Date };
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
        },
        // mode 已迁出 User（改用 UserModeState，按需懒创建），登录注册不再返回全局 mode
        select: { id: true, email: true, status: true, createdAt: true },
      });
    } catch (e: any) {
      // 与开头的 findUnique 之间存在窗口：并发双注册由 email 唯一约束兜底，转成 409 而不是 500
      if (e?.code === 'P2002') {
        throw new ConflictException('This email is already registered');
      }
      throw e;
    }

    // 验证码一次性消费；deleteMany 幂等，并发重复注册由 email 唯一约束兜底
    await this.prisma.emailVerificationCode.deleteMany({
      where: { email, purpose: 'register' },
    });

    const token = this.signToken(user.id, user.email);
    return { user, token };
  }

  async login(dto: LoginDto) {
    const rawEmail = (dto.email || '').trim();
    let user = await this.prisma.user.findUnique({
      where: { email: rawEmail },
    });
    // 注册侧现已统一小写入库；老账号按原样存储 → 先精确命中，再小写回退
    if (!user && rawEmail !== rawEmail.toLowerCase()) {
      user = await this.prisma.user.findUnique({
        where: { email: rawEmail.toLowerCase() },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    // 先校验密码再做封禁判定，避免凭封禁提示枚举账号是否存在
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Incorrect email or password');
    }

    if (user.status === 'BANNED') {
      throw new UnauthorizedException('Your account has been banned, please contact support');
    }

    // Check if profile exists
    const profile = await this.prisma.profile.findUnique({
      where: { userId: user.id },
    });

    const token = this.signToken(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        // mode 已迁出 User（改用 UserModeState），登录不再返回全局 mode
        status: user.status,
        hasProfile: !!profile,
        profileCompleteness: profile?.profileCompleteness || 0,
      },
      token,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    // 与注册保持一致：至少 8 位
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    // 校验当前密码，防止持有令牌即可改密
    const valid = await bcrypt.compare(currentPassword || '', user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { message: 'Password updated' };
  }

  async validateUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, status: true },
    });
  }

  private signToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email, role: 'user' },
      { secret: this.config.get('JWT_SECRET') },
    );
  }
}
