import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { SchoolsService } from './schools.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateAdPricingDefaultsDto, UpdateAdShareDefaultsDto } from './dto/schools.dto';

/**
 * 全局广告计价默认值（SystemConfig key: ad_pricing_defaults，§3）
 * + 全局分成默认值（SystemConfig key: ad_share_defaults，能量经济 B4）。
 * 学校未配置覆盖单价 / 分成 bps 时回落到对应默认值。
 * 注意：这两行配置的唯一写入口都在此（PUT /admin/configs/:key 对其拒写）。
 */
@ApiTags('广告计价')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/ad-pricing')
export class AdPricingAdminController {
  constructor(private schoolsService: SchoolsService) {}

  // 放开 STUDENT_UNION 只读：学生会自设本校单价的表单需要显示全局默认值作提示
  // （写入口 PUT defaults 仍仅 SUPER/TEAM）
  @Get('defaults')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
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

  @Get('share-defaults')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '获取全局分成默认值（缺省 platform=1000 bps / selfSourced=3000 bps）' })
  getShareDefaults() {
    return this.schoolsService.getAdShareDefaults();
  }

  @Put('share-defaults')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '更新全局分成默认值（bps，0–10000）' })
  updateShareDefaults(@Body() dto: UpdateAdShareDefaultsDto) {
    return this.schoolsService.updateAdShareDefaults(dto);
  }
}
