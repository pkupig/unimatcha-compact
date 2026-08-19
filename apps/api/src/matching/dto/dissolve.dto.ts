import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * POST /matching/:matchId/dissolve — 解除关系（恋人/朋友，§3.4 dissolveMatch）。
 */
export class DissolveDto {
  @ApiPropertyOptional({ example: '性格不合', description: '解除原因（可选）' })
  @IsOptional()
  @IsString()
  reason?: string;
}
