import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdPricingModel } from '@prisma/client';

/**
 * 广告体系 DTO（docs/ADMIN-REDESIGN.md §3/§4）。
 * 金额一律以分（cents, Int）传输；日期用 ISO 字符串（YYYY-MM-DD），起止均含当日。
 */

// 创建广告草稿（POST /admin/ads/campaigns，SPONSOR）
export class CreateCampaignDto {
  @ApiProperty({ example: '开学季全场 8 折', description: '卡片标题' })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiProperty({ example: '新生凭学生证到店享 8 折优惠～', description: '卡片文案' })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiProperty({ type: [String], description: '素材图（至少 1 张，H5 大卡展示）' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  images: string[];

  @ApiPropertyOptional({ description: '点击跳转外链（空 = 仅详情浮层）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  landingUrl?: string;

  @ApiProperty({ enum: AdPricingModel, description: '计价模式：BUYOUT 包断 / CPM 千次曝光 / CPC 点击' })
  @IsEnum(AdPricingModel)
  pricingModel: AdPricingModel;

  @ApiProperty({ example: '2026-07-10', description: '投放起（含）' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-07-20', description: '投放止（含）' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: '预算（分）：CPM/CPC 必填且 >0；BUYOUT 不可填' })
  @IsOptional()
  @IsInt()
  @Min(1)
  budgetCents?: number;

  @ApiProperty({ type: [String], description: '投放学校 School.id 列表（至少 1 所，须存在且启用）' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  schoolIds: string[];
}

// 编辑草稿/被驳回的广告（PUT /admin/ads/campaigns/:id，SPONSOR own）——字段同创建，整体替换
export class UpdateCampaignDto extends CreateCampaignDto {}

// 审核（POST /admin/ads/campaigns/:id/review）
export class ReviewCampaignDto {
  @ApiProperty({ description: 'true=通过（→PENDING_PAYMENT）；false=驳回（→REJECTED）' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ description: '审核备注；驳回时作为 rejectedReason' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// 确认收款（POST /admin/ads/campaigns/:id/confirm-payment，SUPER/TEAM）
export class ConfirmPaymentDto {
  @ApiPropertyOptional({ description: '收款备注（如转账流水号）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// 强制下架（POST /admin/ads/campaigns/:id/suspend，SUPER/TEAM）
export class SuspendCampaignDto {
  @ApiProperty({ description: '下架原因' })
  @IsString()
  @MaxLength(500)
  reason: string;
}

// H5 单条曝光/点击事件
export class AdEventDto {
  @ApiProperty({ description: '广告 AdCampaign.id' })
  @IsString()
  campaignId: string;

  @ApiProperty({ description: '学校名（School.name，与 Profile.school 一致）' })
  @IsString()
  @MaxLength(200)
  school: string;

  @ApiProperty({ enum: ['impression', 'click'] })
  @IsIn(['impression', 'click'])
  type: 'impression' | 'click';
}

// H5 批量上报（POST /ads/events，最多 100 条）
export class ReportAdEventsDto {
  @ApiProperty({ type: [AdEventDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AdEventDto)
  events: AdEventDto[];
}
