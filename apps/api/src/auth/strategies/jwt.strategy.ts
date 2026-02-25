import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    if (payload.role !== 'user') throw new UnauthorizedException();
    const user = await this.authService.validateUser(payload.sub);
    if (!user) throw new UnauthorizedException('用户不存在或已被注销');
    if ((user as any).status === 'BANNED') throw new UnauthorizedException('账号已被封禁');
    return user;
  }
}
