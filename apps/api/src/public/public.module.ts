import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { PublicRateLimitGuard } from './public-rate-limit.guard';

@Module({
  controllers: [PublicController],
  providers: [PublicService, PublicRateLimitGuard],
})
export class PublicModule {}
