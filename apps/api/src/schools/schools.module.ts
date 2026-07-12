import { Module } from '@nestjs/common';
import { AdPricingController, SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';

@Module({
  controllers: [SchoolsController, AdPricingController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
