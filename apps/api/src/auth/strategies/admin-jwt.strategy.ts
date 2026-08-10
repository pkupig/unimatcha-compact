import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AdminAuthService } from '../admin-auth.service';
import { AdminScopeService } from '../../admin-core/admin-scope.service';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    config: ConfigService,
    private adminAuthService: AdminAuthService,
    private adminScope: AdminScopeService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('ADMIN_JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; role: string }) {
    if (payload.role !== 'admin') throw new UnauthorizedException('无效的管理员令牌');
    const admin = await this.adminAuthService.validateAdmin(payload.sub);
    if (!admin) throw new UnauthorizedException('管理员账号不存在');
    // 停用即刻生效：不再等 token 自然过期（旧行为是停用后仍可用满 8h）
    if (!admin.isActive) throw new UnauthorizedException('该账号已被停用');
    // req.user = 归一化后的 AdminActor（角色兜底 + 学校 id/name 解析一次到位）
    return this.adminScope.resolveActor(admin);
  }
}
