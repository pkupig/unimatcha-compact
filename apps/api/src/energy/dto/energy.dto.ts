import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 充值档位标识（§10.4）
export type EnergyPackageId = 'pkg_30' | 'pkg_60' | 'pkg_100';

// 免费领取类型（§10.4）
export type EnergyClaimType = 'registration' | 'daily-checkin' | 'task-complete';

/**
 * POST /energy/purchase — 发起充值下单（§10.4）。
 * 本期 mock：下单后直接可 confirm 成功（渠道对接期只换实现）。
 */
export class PurchaseEnergyDto {
  @ApiProperty({
    enum: ['pkg_30', 'pkg_60', 'pkg_100'],
    example: 'pkg_30',
    description: '充值档位：pkg_30=30格 / pkg_60=60格 / pkg_100=100格',
  })
  @IsIn(['pkg_30', 'pkg_60', 'pkg_100'])
  packageId!: EnergyPackageId;
}

/**
 * POST /energy/purchase/confirm — 支付回调入账（§10.4）。
 * 本期 mock：orderId 由 purchase 返回；transactionId 可选（渠道流水号）。
 */
export class ConfirmPurchaseDto {
  @ApiProperty({ example: 'order_ck...', description: '订单号（由 /energy/purchase 返回）' })
  @IsString()
  orderId!: string;

  @ApiProperty({
    enum: ['pkg_30', 'pkg_60', 'pkg_100'],
    example: 'pkg_30',
    description: '充值档位（本期 mock 无 Order 表，confirm 时回传以定位入账格数）',
  })
  @IsIn(['pkg_30', 'pkg_60', 'pkg_100'])
  packageId!: EnergyPackageId;

  @ApiPropertyOptional({ example: 'wx_txn_...', description: '渠道支付流水号（mock 可省略）' })
  @IsOptional()
  @IsString()
  transactionId?: string;
}

/**
 * POST /energy/claim — 免费领取能量（§10.4）。
 */
export class ClaimEnergyDto {
  @ApiProperty({
    enum: ['registration', 'daily-checkin', 'task-complete'],
    example: 'daily-checkin',
    description: '领取类型：registration=注册赠送 / daily-checkin=每日签到 / task-complete=任务奖励',
  })
  @IsIn(['registration', 'daily-checkin', 'task-complete'])
  claimType!: EnergyClaimType;

  @ApiPropertyOptional({
    example: 'friend-questionnaire',
    description: 'task-complete 时的任务键（用于按任务去重防重放）',
  })
  @IsOptional()
  @IsString()
  taskKey?: string;
}

/**
 * GET /energy/transactions?page=1&limit=20 — 流水分页查询（§10.4）。
 */
export class TransactionsQueryDto {
  @ApiPropertyOptional({ example: 1, description: '页码（从 1 开始）', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, description: '每页条数', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
