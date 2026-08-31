import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

@Module({
  // 空注册即可：verify 时显式传 JWT_SECRET（与 auth.service 签发同一密钥、同一惯例）
  imports: [JwtModule.register({})],
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
