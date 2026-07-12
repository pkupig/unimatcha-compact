import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // Check existing
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('This email is already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
      },
      // mode 已迁出 User（改用 UserModeState，按需懒创建），登录注册不再返回全局 mode
      select: { id: true, email: true, status: true, createdAt: true },
    });

    const token = this.signToken(user.id, user.email);
    return { user, token };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

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
