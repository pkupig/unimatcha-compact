import {
  IsString,
  IsOptional,
  MaxLength,
  IsArray,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 广场 v2 DTO（§8.1.5）。
 * board 一律小写：'recommend' | 'campus_wall'，与前端契约一致；
 * 服务层再映射到 Prisma 枚举 SquareBoard。
 */

// 用户发帖（POST /square/v2/posts）
export class CreatePostDto {
  @ApiProperty({ enum: ['recommend', 'campus_wall'], example: 'recommend' })
  @IsEnum(['recommend', 'campus_wall'])
  board: 'recommend' | 'campus_wall';

  @ApiPropertyOptional({ example: '图书馆偶遇' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiProperty({ example: '今天在三楼自习室捡到一支钢笔，失主请联系我～' })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  images?: string[];

  @ApiPropertyOptional({ description: '匿名发帖（默认 false）；学校标注照常显示' })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @ApiPropertyOptional({ type: [String], description: '分类标签（本期入库占位，不参与排序）' })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional({ enum: ['normal', 'poll'], description: 'poll=校园墙投票帖（需审核后展示）' })
  @IsOptional()
  @IsEnum(['normal', 'poll'])
  postType?: 'normal' | 'poll';

  @ApiPropertyOptional({ type: [String], description: '投票选项（postType=poll 必填，2–6 个）' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  pollOptions?: string[];
}

// 投票（POST /square/v2/posts/:id/vote）
export class VotePollDto {
  @ApiProperty({ example: 0, description: '所选选项下标（可改票）' })
  @IsInt()
  @Min(0)
  optionIndex: number;
}

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

// 评论（POST /square/v2/posts/:id/comments）—楼中楼，复用 SquarePostComment
export class CreateCommentDto {
  @ApiProperty({ example: '好可爱～' })
  @IsString()
  @MaxLength(500)
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: '回复同帖下的某条顶层评论' })
  @IsOptional()
  @IsString()
  parentCommentId?: string;
}

// 举报（POST /square/v2/posts/:id/report）
export class ReportPostDto {
  @ApiPropertyOptional({ description: '举报理由（可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

// 后管发官方帖（由 admin 模块调用 createOfficialPost）
export class CreateOfficialPostDto {
  @ApiPropertyOptional({ enum: ['recommend', 'campus_wall'], example: 'recommend' })
  @IsOptional()
  @IsEnum(['recommend', 'campus_wall'])
  board?: 'recommend' | 'campus_wall';

  @ApiProperty({
    enum: ['STUDENT_UNION', 'TEAM', 'SPONSOR'],
    description: '官方帖作者类型；通常由后管 role 推导，可不传',
  })
  @IsOptional()
  @IsEnum(['STUDENT_UNION', 'TEAM', 'SPONSOR'])
  authorType?: 'STUDENT_UNION' | 'TEAM' | 'SPONSOR';

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
