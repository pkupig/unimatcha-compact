import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { SchoolsService } from './schools.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateAdPricingDefaultsDto } from './dto/schools.dto';

/**
 * 全局广告计价默认值（SystemConfig key: ad_pricing_defaults，§3）。
 * 学校未配置覆盖单价时回落到此默认值。
 * 注意：这是该配置行的唯一写入口（PUT /admin/configs/:key 对其拒写）。
 */
@ApiTags('广告计价')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/ad-pricing')
export class AdPricingAdminController {
  constructor(private schoolsService: SchoolsService) {}

  @Get('defaults')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '获取全局计价默认值（缺省 buyoutDaily=20000 / cpm=5000 / cpc=200）' })
  getDefaults() {
    return this.schoolsService.getAdPricingDefaults();
  }

  @Put('defaults')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '更新全局计价默认值（正整数，单位：分）' })
  updateDefaults(@Body() dto: UpdateAdPricingDefaultsDto) {
    return this.schoolsService.updateAdPricingDefaults(dto);
  }
}
