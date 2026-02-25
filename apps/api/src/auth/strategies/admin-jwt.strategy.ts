import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AdminAuthService } from '../admin-auth.service';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(config: ConfigService, private adminAuthService: AdminAuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('ADMIN_JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; role: string }) {
    if (payload.role !== 'admin') throw new UnauthorizedException();
    const admin = await this.adminAuthService.validateAdmin(payload.sub);
    if (!admin) throw new UnauthorizedException('管理员不存在');
    return admin;
  }
}
