import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';
import { SponsorLedgerType } from '@prisma/client';
import { ListQueryDto } from '../../common/dto/list-query.dto';

/**
 * 商家能量钱包 DTO（能量经济 2026-08，B1）。
 * 1 元 = 100 分 = 100 能量，数值同构；amountCents 承载能量数。
 */

// 充值（POST /admin/sponsor-wallet/topup，SPONSOR；MVP mock 即时到账，无订单表）
export class TopupDto {
  @ApiProperty({ example: 10000, description: '充值能量数（≡ 分，至少 100 = 1 元）' })
  @IsInt()
  @Min(100, { message: '充值金额至少 100 能量（1 元）' })
  amountCents: number;

  @ApiProperty({ description: '客户端幂等键（防连点/重试重复入账），8-64 位' })
  @IsString()
  @Length(8, 64, { message: '幂等键长度须在 8-64 位之间' })
  clientToken: string;
}

// 平台手工调整（POST /admin/sponsor-wallet/adjustments，SUPER/TEAM）
export class AdjustWalletDto {
  @ApiProperty({ description: '目标商家 AdminUser.id（须为 SPONSOR 角色）' })
  @IsString()
  @IsNotEmpty()
  sponsorAdminId: string;

  @ApiProperty({ description: '调整金额（有符号，非 0；正=加、负=扣）' })
  @IsInt()
  @NotEquals(0, { message: '调整金额不能为 0' })
  amountCents: number;

  @ApiProperty({ description: '调整原因（必填，留痕）' })
  @IsString()
  @IsNotEmpty({ message: '调整原因必填' })
  @MaxLength(200)
  note: string;

  @ApiPropertyOptional({ description: '关联单据 id（如 SUSPENDED 人工退款对应的 campaignId）' })
  @IsOptional()
  @IsString()
  refId?: string;
}

// 流水查询（GET /admin/sponsor-wallet/ledger，SPONSOR own）
export class ListLedgerQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: SponsorLedgerType, description: '按流水类型过滤' })
  @IsOptional()
  @IsEnum(SponsorLedgerType)
  type?: SponsorLedgerType;
}
