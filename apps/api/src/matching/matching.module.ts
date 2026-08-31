import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { MatchingService, MATCH_QUEUE } from './matching.service';
import { MatchingController } from './matching.controller';
import { MatchingAdminController } from './matching-admin.controller';
import { MatchProcessor } from './match.processor';
import { MatchScheduler } from './match.scheduler';
import { MATCH_MODEL_PROVIDER } from './providers/match-model.interface';
import { ScoringMatchModelProvider } from './providers/scoring-match-model.provider';
import { AIMatchModelProvider } from './providers/ai-match-model.provider';
import { MatchFeedbackModule } from './feedback/match-feedback.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { NotificationModule } from '../notifications/notification.module';
import { EnergyModule } from '../energy/energy.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: MATCH_QUEUE }),
    ProfilesModule,
    NotificationModule,
    EnergyModule,
    MatchFeedbackModule,
    RealtimeModule,
  ],
  controllers: [MatchingController, MatchingAdminController],
  providers: [
    MatchingService,
    MatchProcessor,
    MatchScheduler,
    ScoringMatchModelProvider,
    AIMatchModelProvider,
    {
      // 模型选择（BACKLOG P0-1）：MATCH_MODEL=ai|scoring 显式指定；
      // 缺省时配置了 AI_PROVIDER_URL 即用 AI（matching-ml 服务），否则回退本地打分。
      // 回滚只需一行环境变量：MATCH_MODEL=scoring。
      provide: MATCH_MODEL_PROVIDER,
      inject: [ConfigService, ScoringMatchModelProvider, AIMatchModelProvider],
      useFactory: (
        config: ConfigService,
        scoring: ScoringMatchModelProvider,
        ai: AIMatchModelProvider,
      ) => {
        const explicit = (config.get<string>('MATCH_MODEL') ?? '').trim().toLowerCase();
        const useAI = explicit ? explicit === 'ai' : !!config.get<string>('AI_PROVIDER_URL');
        new Logger('MatchingModule').log(
          `Match model provider: ${useAI ? 'AIMatchModelProvider (matching-ml)' : 'ScoringMatchModelProvider (local)'}`,
        );
        return useAI ? ai : scoring;
      },
    },
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
