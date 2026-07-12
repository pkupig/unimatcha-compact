import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdsService } from './ads.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReportAdEventsDto } from './dto/ads.dto';

/**
 * 广告 H5 侧控制器（docs/ADMIN-REDESIGN.md §4 H5 侧）。
 * 走用户 JWT（与 square 控制器一致）：
 * - GET /ads/feed：该校当日可展示广告，随机轮换（未知学校 → []）
 * - POST /ads/events：批量曝光/点击上报（非 ACTIVE 订单静默忽略）
 */
@ApiTags('广告（H5）')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ads')
export class AdsPublicController {
  constructor(private adsService: AdsService) {}

  @Get('feed')
  @ApiOperation({ summary: '该校当日可展示广告（随机轮换，卡片形状同官方大卡）' })
  @ApiQuery({ name: 'school', required: true, description: '学校名（School.name）' })
  @ApiQuery({ name: 'limit', required: false, example: 3 })
  getFeed(@Query('school') school?: string, @Query('limit') limit?: number) {
    return this.adsService.getFeed(school, limit);
  }

  @Post('events')
  @ApiOperation({ summary: '批量上报曝光/点击事件（最多 100 条；聚合进 AdDailyStat + 消耗累加）' })
  reportEvents(@Body() dto: ReportAdEventsDto) {
    return this.adsService.reportEvents(dto);
  }
}
