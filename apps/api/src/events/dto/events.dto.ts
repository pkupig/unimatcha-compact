import {
  IsString,
  IsOptional,
  MaxLength,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 后管创建活动（POST /admin/events）：同时生成广场活动帖
export class CreateEventDto {
  @ApiProperty({ example: '毕业季草坪音乐节' })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiProperty({ example: '6 月 20 日草坪见！乐队暖场 + 自由麦，凭票入场。' })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ description: '学校名；学生会强制本校，团队可空（全网）' })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiPropertyOptional({ example: '大学草坪广场' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  venue?: string;

  @ApiProperty({ example: '2026-08-01T18:00:00.000Z' })
  @IsDateString()
  startAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ example: 1500, description: '票价（分）；0=免费' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional({ example: 200, description: '票量上限；不传=不限' })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  /** @deprecated 活动帖一律发校园墙（产品规则），服务端不再读取此字段。保留仅为兼容旧调用方。 */
  @ApiPropertyOptional({ deprecated: true, description: '已废弃：活动帖恒发校园墙' })
  @IsOptional()
  @IsEnum(['recommend', 'campus_wall'])
  board?: 'recommend' | 'campus_wall';
}

// 后管更新活动状态（PATCH /admin/events/:id）
export class UpdateEventStatusDto {
  @ApiProperty({ enum: ['published', 'closed', 'cancelled'] })
  @IsEnum(['published', 'closed', 'cancelled'])
  status: 'published' | 'closed' | 'cancelled';
}

// 用户购票（POST /events/:id/purchase）；支付为本期 mock
export class PurchaseTicketDto {
  @ApiPropertyOptional({ enum: ['wechat', 'alipay', 'stripe'], description: '支付方式（mock，仅记录）' })
  @IsOptional()
  @IsEnum(['wechat', 'alipay', 'stripe'])
  paymentMethod?: string;
}

// 入场核销（POST /admin/events/checkin）
export class CheckinTicketDto {
  @ApiProperty({ example: 'UMT-3F9A2K7Q' })
  @IsString()
  @MaxLength(40)
  code: string;
}
