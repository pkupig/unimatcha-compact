import {
  IsString, IsOptional, IsBoolean, IsIn, IsInt, Min, Max,
  IsArray, ArrayMaxSize, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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
  // triggeredBy 字段已删除：服务端按当前管理员自动填入，不属于客户端输入
  @ApiPropertyOptional({ enum: ['romantic', 'friend'], example: 'romantic', description: '触发的模式（缺省 romantic）' })
  @IsOptional()
  @IsIn(['romantic', 'friend'])
  mode?: 'romantic' | 'friend';
}

/**
 * POST /matching/start — 用户开始匹配（双模式 + 增强，§3.4 / §10.2）。
 */
export class StartMatchDto {
  @ApiPropertyOptional({ enum: ['romantic', 'friend'], example: 'romantic', description: '匹配模式（缺省 romantic）' })
  @IsOptional()
  @IsIn(['romantic', 'friend'])
  mode?: 'romantic' | 'friend';

  @ApiPropertyOptional({ example: false, description: '是否开启增强模式（预扣能量，无视75分阈值强配）' })
  @IsOptional()
  @IsBoolean()
  enhanced?: boolean;

  @ApiPropertyOptional({
    example: 1,
    description: '朋友增强档位 1–5（=保证匹配的朋友数 N；恋人忽略，固定3格）',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  cells?: number;
}

/**
 * POST /matching/feedback/events — 客户端行为埋点上报（P0-2）。
 * 仅允许「看过类」事件；confirmed/message 等由服务端在权威动作处自动落库。
 */
export class MatchFeedbackEventDto {
  @ApiProperty({ description: '事件所属 matchId' })
  @IsString()
  matchId: string;

  @ApiProperty({ enum: ['viewed', 'openedProfile'], description: '事件类型（客户端白名单）' })
  @IsIn(['viewed', 'openedProfile'])
  type: 'viewed' | 'openedProfile';
}

export class ReportMatchFeedbackEventsDto {
  @ApiProperty({ type: [MatchFeedbackEventDto], description: '事件批（最多 50 条）' })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MatchFeedbackEventDto)
  events: MatchFeedbackEventDto[];
}

export { DissolveDto } from './dissolve.dto';
