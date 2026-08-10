import { Module } from '@nestjs/common';
import { SchoolsAdminController } from './schools-admin.controller';
import { AdPricingAdminController } from './ad-pricing-admin.controller';
import { SchoolsService } from './schools.service';

@Module({
  controllers: [SchoolsAdminController, AdPricingAdminController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
