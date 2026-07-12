import { IsIn, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const REPORT_CATEGORIES = ['bug', 'user', 'content', 'other'] as const;

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_CATEGORIES, example: 'bug' })
  @IsIn(REPORT_CATEGORIES as unknown as string[])
  category: string;

  @ApiProperty({ example: 'Describe the issue here', maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ example: 'wechat: abc123' })
  @IsOptional()
  @IsString()
  contact?: string;
}
