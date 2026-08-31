import { Module } from '@nestjs/common';
import { CoupleController } from './couple.controller';
import { CoupleService } from './couple.service';
import { RealtimeModule } from '../realtime/realtime.module';

// 情侣空间（本轮反馈2）。PrismaModule 为 @Global，无需在此导入。
@Module({
  imports: [RealtimeModule],
  controllers: [CoupleController],
  providers: [CoupleService],
})
export class CoupleModule {}
