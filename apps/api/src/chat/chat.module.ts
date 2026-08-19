/* Interface outline: implementation bodies removed. */
import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { MatchFeedbackModule } from '../matching/feedback/match-feedback.module';

@Module({
export class ChatModule {
