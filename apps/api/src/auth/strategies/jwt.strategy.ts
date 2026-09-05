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
    // 注销是立即生效的：即便设备上还留着注销前签发的旧 token，这里也要挡掉，不能只靠
    // “email 已被匿名化所以重新登录会失败”——那只堵住了重新登录，堵不住已持有 token 的重放。
    if ((user as any).status === 'DELETED') throw new UnauthorizedException('This account has been deleted');
    return user;
  }
}
