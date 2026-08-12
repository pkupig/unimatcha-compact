import {
  IsString,
  IsOptional,
  MaxLength,
  IsArray,
  IsEnum,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';

/** 广场后管 DTO（原散在 square.dto.ts 与 admin.controller.ts 内联，Step5 收拢于此） */

// 后管审核投票帖（POST /admin/square/polls/:id/review）
export class ReviewPollDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsEnum(['approve', 'reject'])
  action: 'approve' | 'reject';

  @ApiPropertyOptional({ description: '审核备注（驳回时展示给作者）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

// 后管发官方帖（POST /admin/square/posts）
// 原 authorType 字段已删除：服务层始终由 role 推导，声明了也不生效
export class CreateOfficialPostDto {
  @ApiPropertyOptional({ enum: ['recommend', 'campus_wall'], example: 'recommend' })
  @IsOptional()
  @IsEnum(['recommend', 'campus_wall'])
  board?: 'recommend' | 'campus_wall';

  @ApiPropertyOptional({ description: '学校标注；STUDENT_UNION 必填且须为本校，TEAM/SPONSOR 可空（跨校）' })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  images?: string[];

  @ApiPropertyOptional({ description: 'SPONSOR 帖强制 true；其它角色可选' })
  @IsOptional()
  @IsBoolean()
  isSponsored?: boolean;
}

// 后管编辑官方帖（PATCH /admin/square/posts/:id）；校验口径与 CreateOfficialPostDto 对齐
export class UpdateOfficialPostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  images?: string[];
}

// 校园墙帖置顶/取消置顶（POST /admin/square/posts/:id/pin）
export class PinPostDto {
  @ApiProperty({ description: 'true=置顶，false=取消置顶' })
  @IsBoolean()
  pinned: boolean;
}

// 后管下架帖子（DELETE /admin/square/posts/:id）
export class DeletePostDto {
  @ApiPropertyOptional({ description: '下架理由（可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

// 后管帖子列表查询（GET /admin/square/posts）
export class ListSquarePostsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'RECOMMEND / CAMPUS_WALL（容忍小写）' })
  @IsOptional()
  @IsString()
  board?: string;

  @ApiPropertyOptional({ description: '学校名（仅 SUPER/TEAM 有效；学生会强制本校）' })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiPropertyOptional({ description: 'all（默认）/ visible / hidden' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'true → 仅被举报帖（含自动隐藏）' })
  @IsOptional()
  @IsString()
  reported?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

// 投票审核列表查询（GET /admin/square/polls）
export class ListPollsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'pending（默认）/ approved / rejected' })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';
}
