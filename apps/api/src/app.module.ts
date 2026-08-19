/* Interface outline: implementation bodies removed. */
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
import { DiscoveryModule } from './discovery/discovery.module';

@Module({
export class AppModule {
