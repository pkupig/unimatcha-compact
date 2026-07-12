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
    if (!user) throw new UnauthorizedException('User not found or has been deactivated');
    if ((user as any).status === 'BANNED') throw new UnauthorizedException('Your account has been banned');
    return user;
  }
}
