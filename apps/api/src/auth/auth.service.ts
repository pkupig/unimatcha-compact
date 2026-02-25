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
      throw new ConflictException('该邮箱已被注册');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
      },
      select: { id: true, email: true, mode: true, status: true, createdAt: true },
    });

    const token = this.signToken(user.id, user.email);
    return { user, token };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    if (user.status === 'BANNED') {
      throw new UnauthorizedException('账号已被封禁，请联系客服');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('邮箱或密码错误');
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
        mode: user.mode,
        status: user.status,
        hasProfile: !!profile,
        profileCompleteness: profile?.profileCompleteness || 0,
      },
      token,
    };
  }

  async validateUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, mode: true, status: true },
    });
  }

  private signToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email, role: 'user' },
      { secret: this.config.get('JWT_SECRET') },
    );
  }
}
