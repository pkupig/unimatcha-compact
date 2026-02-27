import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMatchConfigDto {
  @ApiProperty({ example: '0 20 * * 3', description: 'Cron 表达式' })
  @IsString()
  cronExpr: string;

  @ApiPropertyOptional({ example: '每周三晚上20:00' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ example: 'Asia/Shanghai' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class TriggerMatchJobDto {
  @ApiPropertyOptional({ description: '手动触发的管理员 ID（自动填入）' })
  @IsOptional()
  @IsString()
  triggeredBy?: string;
}

export class DissolveDto {
  @ApiPropertyOptional({ example: '性格不合', description: '解除原因（可选）' })
  @IsOptional()
  @IsString()
  reason?: string;
}
