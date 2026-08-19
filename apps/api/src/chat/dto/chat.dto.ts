import { IsString, IsOptional, IsIn, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiPropertyOptional({ description: '消息内容（content 与 imageUrl 至少传一个）', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({ description: '图片 URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

// ─── 会话列表查询（§4.2） ─────────────────────────────────
export class ConversationSessionsQueryDto {
  @ApiPropertyOptional({
    description: '模式筛选：romantic | friend | all（默认 all 不限）',
    enum: ['romantic', 'friend', 'all'],
  })
  @IsOptional()
  @IsIn(['romantic', 'friend', 'all'])
  mode?: 'romantic' | 'friend' | 'all';

  @ApiPropertyOptional({ description: '返回条数（默认 50，最大 100）', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
