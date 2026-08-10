import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';

/**
 * 财务 DTO（docs/ADMIN-REDESIGN.md §4 finance）。
 * 金额一律以分（cents, Int）为单位。
 */

// 发放赞助额度（SPONSOR_GRANT，正数入账）
export class CreateGrantDto {
  @ApiProperty({ description: '学校 ID（School.id）' })
  @IsString()
  @IsNotEmpty({ message: '学校 ID 不能为空' })
  schoolId: string;

  @ApiProperty({ description: '发放金额（分，正整数）', example: 100000 })
  @IsInt()
  @Min(1, { message: '发放金额须为正整数（分）' })
  amountCents: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

// 手工调整（ADJUSTMENT，正负均可但不能为 0；备注必填以留痕）
export class CreateAdjustmentDto {
  @ApiProperty({ description: '学校 ID（School.id）' })
  @IsString()
  @IsNotEmpty({ message: '学校 ID 不能为空' })
  schoolId: string;

  @ApiProperty({ description: '调整金额（分，有符号，不能为 0）', example: -5000 })
  @IsInt()
  @NotEquals(0, { message: '调整金额不能为 0' })
  amountCents: number;

  @ApiProperty({ description: '调整原因（必填留痕）' })
  @IsString()
  @IsNotEmpty({ message: '调整原因不能为空' })
  @MaxLength(200)
  note: string;
}

// 学生会发起提现（学校取自当前账号绑定的 schoolId）
export class CreateWithdrawalDto {
  @ApiProperty({ description: '提现金额（分，正整数，≤ 可用余额）', example: 50000 })
  @IsInt()
  @Min(1, { message: '提现金额须为正整数（分）' })
  amountCents: number;
}

// 团队审核提现（PENDING → APPROVED / REJECTED）
export class ReviewWithdrawalDto {
  @ApiProperty({ description: 'true=通过 / false=驳回' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ description: '审核备注' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

// 提现列表查询（GET /admin/finance/withdrawals）
export class ListWithdrawalsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'PENDING / APPROVED / REJECTED / PAID' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '按学校过滤（School.id，仅平台侧生效）' })
  @IsOptional()
  @IsString()
  schoolId?: string;
}

// ─── 能量经济（2026-08）：能量 → 赞助费兑换 ───────────────────────

// 学生会发起兑换（学校取自当前账号绑定的 schoolId；1 能量 = 1 分）
export class CreateConversionDto {
  @ApiProperty({ description: '兑换能量数（= 入账赞助费分数，正整数，≤ 可用能量余额）', example: 50000 })
  @IsInt()
  @Min(1, { message: '兑换金额须为正整数（分）' })
  amountCents: number;
}

// 平台审批兑换（PENDING → APPROVED / REJECTED）
export class ReviewConversionDto {
  @ApiProperty({ description: 'true=通过 / false=驳回' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ description: '审批备注' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

// 兑换列表查询（GET /admin/finance/conversions）
export class ListConversionsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'PENDING / APPROVED / REJECTED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '按学校过滤（School.id，仅平台侧生效）' })
  @IsOptional()
  @IsString()
  schoolId?: string;
}
