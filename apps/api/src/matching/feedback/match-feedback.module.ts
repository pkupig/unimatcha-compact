import { Module } from '@nestjs/common';
import { MatchFeedbackService } from './match-feedback.service';

// 独立小模块：MatchingModule / ChatModule 共用埋点服务，避免互相 import 造成耦合
@Module({
  providers: [MatchFeedbackService],
  exports: [MatchFeedbackService],
})
export class MatchFeedbackModule {}
