import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { QuestionnaireModule } from './questionnaire/questionnaire.module';
import { AnswersModule } from './answers/answers.module';
import { MatchingModule } from './matching/matching.module';
import { AdminModule } from './admin/admin.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { SquareModule } from './square/square.module';
import { EventsModule } from './events/events.module';
import { MetadataModule } from './metadata/metadata.module';
import { UploadsModule } from './uploads/uploads.module';
import { ChatModule } from './chat/chat.module';
import { NotificationModule } from './notifications/notification.module';
import { ReportsModule } from './reports/reports.module';
import { EnergyModule } from './energy/energy.module';
import { CoupleModule } from './couple/couple.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { SchoolsModule } from './schools/schools.module';
import { AdsModule } from './ads/ads.module';
import { FinanceModule } from './finance/finance.module';
import { PublicModule } from './public/public.module';
import { SponsorWalletModule } from './sponsor-wallet/sponsor-wallet.module';
import { SponsorInviteModule } from './sponsor-invite/sponsor-invite.module';
import { PartnersModule } from './partners/partners.module';
import { DiscoveryModule } from './discovery/discovery.module';

@Module({
  imports: [
    // Global config
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Task scheduler (cron)
    ScheduleModule.forRoot(),

    // Bull queue with Redis
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
      }),
      inject: [ConfigService],
    }),

    // App modules
    PrismaModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    QuestionnaireModule,
    AnswersModule,
    MatchingModule,
    AdminModule,
    LeaderboardModule,
    SquareModule,
    DiscoveryModule,
    EventsModule,
    MetadataModule,
    UploadsModule,
    ChatModule,
    NotificationModule,
    ReportsModule,
    EnergyModule,
    CoupleModule,
    RelationshipsModule,
    SchoolsModule,
    AdsModule,
    FinanceModule,
    PublicModule,
    // 能量经济 + 邀请注册 + 跨校合作（2026-08；wallet/invite 亦经 Ads/Auth 模块间接引入，
    // 此处显式注册以保证独立可达）
    SponsorWalletModule,
    SponsorInviteModule,
    PartnersModule,
  ],
})
export class AppModule {}
