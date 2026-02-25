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
  ],
})
export class AppModule {}
