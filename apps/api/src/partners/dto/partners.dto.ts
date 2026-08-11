import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

/**
 * 跨校合作消息线程 DTO（B6）。
 * 目录（学校/广告商）与线程列表均为 ListQueryDto + search 的标准分页形状；
 * 消息列表默认 limit 放大到 50（聊天场景一页 20 太碎）。
 */

// 学校目录查询（GET /admin/partners/schools，广告商侧）
export class ListPartnerSchoolsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: '模糊匹配学校名' })
  @IsOptional()
  @IsString()
  search?: string;
}

// 广告商目录查询（GET /admin/partners/sponsors，学生会侧）
export class ListPartnerSponsorsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: '模糊匹配广告商组织名' })
  @IsOptional()
  @IsString()
  search?: string;
}

// 线程列表查询（GET /admin/partners/threads）
export class ListThreadsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: '模糊匹配洽谈主题' })
  @IsOptional()
  @IsString()
  search?: string;
}

// 消息列表查询（GET /admin/partners/threads/:id/messages）：默认 limit 50
export class ListThreadMessagesQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}

/**
 * 发起洽谈（POST /admin/partners/threads）。
 * 目标字段按发起方角色二选一（服务层校验必填组合，多余组合 400）：
 *   广告商发起 → targetSchoolId 必填；学生会发起 → targetSponsorAdminId 必填。
 */
export class CreateThreadDto {
  @ApiProperty({ description: '洽谈主题', maxLength: 80, example: '迎新周奶茶联名活动' })
  @IsString()
  @IsNotEmpty({ message: '洽谈主题不能为空' })
  @MaxLength(80, { message: '洽谈主题最长 80 字' })
  subject: string;

  @ApiProperty({ description: '首条消息内容', maxLength: 2000 })
  @IsString()
  @IsNotEmpty({ message: '消息内容不能为空' })
  @MaxLength(2000, { message: '消息内容最长 2000 字' })
  content: string;

  @ApiPropertyOptional({ description: '目标学校 id（广告商发起时必填）' })
  @IsOptional()
  @IsString()
  targetSchoolId?: string;

  @ApiPropertyOptional({ description: '目标广告商管理员 id（学生会发起时必填）' })
  @IsOptional()
  @IsString()
  targetSponsorAdminId?: string;
}

// 发消息（POST /admin/partners/threads/:id/messages）
export class PostThreadMessageDto {
  @ApiProperty({ description: '消息内容', maxLength: 2000 })
  @IsString()
  @IsNotEmpty({ message: '消息内容不能为空' })
  @MaxLength(2000, { message: '消息内容最长 2000 字' })
  content: string;
}
