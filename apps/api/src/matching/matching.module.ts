/* Interface outline: implementation bodies removed. */
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { MatchingService, MATCH_QUEUE } from './matching.service';
import { MatchingController } from './matching.controller';
import { AdminMatchingController } from './admin-matching.controller';
import { MatchProcessor } from './match.processor';
import { MatchScheduler } from './match.scheduler';
import { MATCH_MODEL_PROVIDER } from './providers/match-model.interface';
import { ScoringMatchModelProvider } from './providers/scoring-match-model.provider';
import { AIMatchModelProvider } from './providers/ai-match-model.provider';
import { MatchFeedbackModule } from './feedback/match-feedback.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { NotificationModule } from '../notifications/notification.module';
import { EnergyModule } from '../energy/energy.module';

@Module({
export class MatchingModule {
