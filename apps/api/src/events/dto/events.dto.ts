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

  @ApiPropertyOptional({ enum: ['recommend', 'campus_wall'], description: '活动帖发到哪个板块（默认 recommend）' })
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

// 后管编辑活动内容（PATCH /admin/events/:id/content）
// school 刻意不可改：学校归属牵动学生会范围校验与门票入账主体（SchoolLedgerEntry），改校等价于换活动
export class UpdateEventContentDto {
  @ApiPropertyOptional({ example: '毕业季草坪音乐节' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: '6 月 20 日草坪见！乐队暖场 + 自由麦，凭票入场。' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ example: '大学草坪广场' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  venue?: string;

  @ApiPropertyOptional({ example: '2026-08-01T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  // 仅可改值不可清除（null 视同未传）：清除 endAt 会把购票的销售截止时点回退到 startAt，语义突变
  @ApiPropertyOptional({ example: '2026-08-01T21:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ example: 1500, description: '票价（分）；已售票后不可修改' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  // 三态：未传=不变；null=改为不限量；数值=新上限（@IsOptional 对 null 同样跳过校验，天然承载 null 档）
  @ApiPropertyOptional({ example: 200, nullable: true, description: '票量上限；null=不限；已售票后只可上调' })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;
}

// 用户购票（POST /events/:id/purchase）；支付为本期 mock
export class PurchaseTicketDto {
  @ApiPropertyOptional({ enum: ['wechat', 'alipay', 'stripe'], description: '支付方式（mock，仅记录）' })
  @IsOptional()
  @IsEnum(['wechat', 'alipay', 'stripe'])
  paymentMethod?: string;
}

// 入场核销（POST /admin/events/checkin）
// 校验消息中文化：扫码路径会把任意二维码内容（如超长海报 URL）送进来，默认英文消息会直达核销员界面
export class CheckinTicketDto {
  @ApiProperty({ example: 'UMT-3F9A2K7Q' })
  @IsString({ message: '票码格式不正确' })
  @MaxLength(40, { message: '不是有效票码' })
  code: string;

  @ApiPropertyOptional({ description: '限定活动：票不属于该活动时拒绝核销（防扫错场次）' })
  @IsOptional()
  @IsString({ message: '活动标识不正确' })
  @MaxLength(64, { message: '活动标识不正确' })
  eventId?: string;
}
