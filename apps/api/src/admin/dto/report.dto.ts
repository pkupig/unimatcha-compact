import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

/** 用户反馈举报 DTO（原 admin.controller.ts 内联类，Step8 迁入） */

export class UpdateReportStatusDto {
  @ApiProperty({ enum: ['open', 'resolved'], description: 'open → resolved（幂等）' })
  @IsIn(['open', 'resolved'], { message: 'status 参数无效（open / resolved）' })
  status: 'open' | 'resolved';
}

export class ListReportsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'resolved'] })
  @IsOptional()
  @IsIn(['open', 'resolved'])
  status?: 'open' | 'resolved';
}
