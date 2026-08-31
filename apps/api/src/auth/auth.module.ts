import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { UsersModule } from '../users/users.module';
import { AdminCoreModule } from '../admin-core/admin-core.module';
import { SponsorInviteModule } from '../sponsor-invite/sponsor-invite.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    AdminCoreModule,
    // B5 广告商自注册：AdminAuthController 挂两个公开端点（invite-info / register-sponsor）
    SponsorInviteModule,
    // 注册邮箱验证码发送
    MailModule,
  ],
  controllers: [AuthController, AdminAuthController],
  providers: [AuthService, AdminAuthService, JwtStrategy, AdminJwtStrategy],
  exports: [AuthService, AdminAuthService],
})
export class AuthModule {}
