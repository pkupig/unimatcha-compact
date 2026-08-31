import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { MatchFeedbackModule } from '../matching/feedback/match-feedback.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [MatchFeedbackModule, RealtimeModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
