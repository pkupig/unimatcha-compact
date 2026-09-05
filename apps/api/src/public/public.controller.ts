import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { SponsorApplicationDto, WaitlistDto } from './dto/public.dto';
import { PublicRateLimitGuard } from './public-rate-limit.guard';

/**
 * 官网公开接口：无鉴权。只读统计 + 两类提交（候补名单/赞助申请）。
 * 提交按 (type,email) 幂等去重，不回显任何他人数据。
 */
@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('site-stats')
  @ApiOperation({ summary: '官网展示用统计与下一轮公布时间（60s 缓存）' })
  async siteStats() {
    return this.publicService.getSiteStats();
  }

  @Get('school-badges')
  @ApiOperation({ summary: '校标元信息（H5 渲染认证用户的学校徽章；缺项由前端自动生成兜底）' })
  async schoolBadges() {
    return this.publicService.getSchoolBadges();
  }

  @Post('waitlist')
  @UseGuards(PublicRateLimitGuard)
  @ApiOperation({ summary: '加入候补名单' })
  async joinWaitlist(@Body() dto: WaitlistDto) {
    return this.publicService.submit('WAITLIST', dto.email, undefined, undefined, dto.locale);
  }

  @Post('sponsor-application')
  @UseGuards(PublicRateLimitGuard)
  @ApiOperation({ summary: '学生会/社团赞助申请' })
  async sponsorApplication(@Body() dto: SponsorApplicationDto) {
    return this.publicService.submit('SPONSOR', dto.email, dto.organization, dto.message, dto.locale);
  }
}
