import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MatchingService, MATCH_QUEUE } from './matching.service';
import { MatchingController } from './matching.controller';
import { AdminMatchingController } from './admin-matching.controller';
import { MatchProcessor } from './match.processor';
import { MatchScheduler } from './match.scheduler';
import { MATCH_MODEL_PROVIDER } from './providers/match-model.interface';
import { ScoringMatchModelProvider } from './providers/scoring-match-model.provider';
import { ProfilesModule } from '../profiles/profiles.module';
import { NotificationModule } from '../notifications/notification.module';
import { EnergyModule } from '../energy/energy.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: MATCH_QUEUE }),
    ProfilesModule,
    NotificationModule,
    EnergyModule,
  ],
  controllers: [MatchingController, AdminMatchingController],
  providers: [
    MatchingService,
    MatchProcessor,
    MatchScheduler,
    {
      // 替换真实 AI 实现时，只需修改这里：
      provide: MATCH_MODEL_PROVIDER,
      useClass: ScoringMatchModelProvider,
    },
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
