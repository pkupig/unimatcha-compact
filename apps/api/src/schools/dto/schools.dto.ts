import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 学校管理 DTO（docs/ADMIN-REDESIGN.md §4 schools）。
 * - 分成比例用基点 bps（0–10000）
 * - 计价覆盖为可空整数（分）：null = 清除覆盖，回落到 SystemConfig ad_pricing_defaults
 */
export class CreateSchoolDto {
  @ApiProperty({ example: 'University of Warwick', description: '学校名（唯一，与 Profile.school 字符串相等匹配）' })
  @IsString()
  @IsNotEmpty({ message: '学校名不能为空' })
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional({ example: 'Coventry' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  city?: string;

  @ApiPropertyOptional({ description: '平台直签广告分成（bps，0–10000），默认 1000', example: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0, { message: '分成比例须在 0–10000 基点之间' })
  @Max(10000, { message: '分成比例须在 0–10000 基点之间' })
  platformShareBps?: number;

  @ApiPropertyOptional({ description: '学生会自拉赞助分成（bps，0–10000），默认 3000', example: 3000 })
  @IsOptional()
  @IsInt()
  @Min(0, { message: '分成比例须在 0–10000 基点之间' })
  @Max(10000, { message: '分成比例须在 0–10000 基点之间' })
  selfSourcedShareBps?: number;

  @ApiPropertyOptional({ description: '包断日单价覆盖（分/天/校）；不传 = 用全局默认' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: '单价须为正整数（分）' })
  buyoutDailyPriceCents?: number;

  @ApiPropertyOptional({ description: 'CPM 单价覆盖（分/千次曝光）' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: '单价须为正整数（分）' })
  cpmPriceCents?: number;

  @ApiPropertyOptional({ description: 'CPC 单价覆盖（分/次点击）' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: '单价须为正整数（分）' })
  cpcPriceCents?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * 更新学校：全部可选；计价覆盖字段允许显式传 null 以清除覆盖
 * （@IsOptional 对 null/undefined 均跳过校验，服务层以 !== undefined 判断是否更新）。
 */
export class UpdateSchoolDto {
  @ApiPropertyOptional({ example: 'University of Warwick' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '学校名不能为空' })
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ example: 'Coventry' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '平台直签广告分成（bps，0–10000）' })
  @IsOptional()
  @IsInt()
  @Min(0, { message: '分成比例须在 0–10000 基点之间' })
  @Max(10000, { message: '分成比例须在 0–10000 基点之间' })
  platformShareBps?: number;

  @ApiPropertyOptional({ description: '学生会自拉赞助分成（bps，0–10000）' })
  @IsOptional()
  @IsInt()
  @Min(0, { message: '分成比例须在 0–10000 基点之间' })
  @Max(10000, { message: '分成比例须在 0–10000 基点之间' })
  selfSourcedShareBps?: number;

  @ApiPropertyOptional({ description: '包断日单价覆盖（分）；传 null 清除覆盖', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1, { message: '单价须为正整数（分）' })
  buyoutDailyPriceCents?: number | null;

  @ApiPropertyOptional({ description: 'CPM 单价覆盖（分）；传 null 清除覆盖', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1, { message: '单价须为正整数（分）' })
  cpmPriceCents?: number | null;

  @ApiPropertyOptional({ description: 'CPC 单价覆盖（分）；传 null 清除覆盖', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1, { message: '单价须为正整数（分）' })
  cpcPriceCents?: number | null;
}

/**
 * 绑定提现银行账户（三个字段均必填非空；MVP 仅记录，提现时快照）。
 */
export class UpdateSchoolBankDto {
  @ApiProperty({ example: 'Warwick Students Union' })
  @IsString()
  @IsNotEmpty({ message: '开户名不能为空' })
  @MaxLength(128)
  bankAccountName: string;

  @ApiProperty({ example: 'HSBC' })
  @IsString()
  @IsNotEmpty({ message: '开户银行不能为空' })
  @MaxLength(128)
  bankName: string;

  @ApiProperty({ example: '12345678' })
  @IsString()
  @IsNotEmpty({ message: '银行账号不能为空' })
  @MaxLength(64)
  bankAccountNo: string;
}

/**
 * 全局计价默认值（SystemConfig key: ad_pricing_defaults）。
 */
export class UpdateAdPricingDefaultsDto {
  @ApiProperty({ description: '包断默认日单价（分/天/校）', example: 20000 })
  @IsInt()
  @Min(1, { message: '单价须为正整数（分）' })
  buyoutDailyPriceCents: number;

  @ApiProperty({ description: 'CPM 默认单价（分/千次曝光）', example: 5000 })
  @IsInt()
  @Min(1, { message: '单价须为正整数（分）' })
  cpmPriceCents: number;

  @ApiProperty({ description: 'CPC 默认单价（分/次点击）', example: 200 })
  @IsInt()
  @Min(1, { message: '单价须为正整数（分）' })
  cpcPriceCents: number;
}
