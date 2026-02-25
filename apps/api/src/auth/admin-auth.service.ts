import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/auth.dto';

@Injectable()
export class AdminAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: AdminLoginDto) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    if (!admin) throw new UnauthorizedException('账号或密码错误');

    const valid = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('账号或密码错误');

    const token = this.jwtService.sign(
      { sub: admin.id, email: admin.email, role: 'admin' },
      {
        secret: this.config.get('ADMIN_JWT_SECRET'),
        expiresIn: this.config.get('ADMIN_JWT_EXPIRES_IN', '8h'),
      },
    );

    return {
      admin: { id: admin.id, email: admin.email, name: admin.name, isSuperAdmin: admin.isSuperAdmin },
      token,
    };
  }

  async validateAdmin(id: string) {
    return this.prisma.adminUser.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, isSuperAdmin: true },
    });
  }
}
