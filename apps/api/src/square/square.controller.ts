import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SquareService } from './square.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreatePostDto,
  CreateCommentDto,
  ReportPostDto,
} from './dto/square.dto';

/**
 * 广场 v2 控制器（§8.1.5）。
 * 用户侧端点统一挂在 /square/v2/*，走用户 JWT。
 * 官方发帖 / 后管下架在 admin 模块，调用 SquareService.createOfficialPost / adminDeletePost。
 */
@ApiTags('广场 v2')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('square/v2')
export class SquareController {
  constructor(private squareService: SquareService) {}

  @Post('posts')
  @ApiOperation({ summary: '用户发帖（authorType=USER；school 取自资料）' })
  async createPost(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.squareService.createPost(userId, dto);
  }

  @Get('recommend')
  @ApiOperation({ summary: '推荐流（加权混排，§8.1.4），分页' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'cursor', required: false })
  async listRecommend(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.squareService.listRecommend(userId, {
      page: page ? Number(page) : undefined,
      // 页大小由客户端传入，须夹在 [1,50] 防止超大 limit 拖垮查询
      limit: limit != null ? Math.min(Math.max(Number(limit), 1), 50) : undefined,
      cursor,
    });
  }

  @Get('campus-wall')
  @ApiOperation({ summary: '校园墙流（同校硬过滤），分页' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'cursor', required: false })
  async listCampusWall(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.squareService.listCampusWall(userId, {
      page: page ? Number(page) : undefined,
      // 页大小由客户端传入，须夹在 [1,50] 防止超大 limit 拖垮查询
      limit: limit != null ? Math.min(Math.max(Number(limit), 1), 50) : undefined,
      cursor,
    });
  }

  @Get('posts/:id')
  @ApiOperation({ summary: '帖子详情（含评论、myLiked）' })
  async getPost(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
  ) {
    return this.squareService.getPost(postId, userId);
  }

  @Post('posts/:id/like')
  @ApiOperation({ summary: '点赞（切换）' })
  async likePost(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
  ) {
    return this.squareService.likePost(postId, userId);
  }

  @Post('posts/:id/comments')
  @ApiOperation({ summary: '评论（楼中楼）' })
  async createComment(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.squareService.createComment(userId, postId, dto);
  }

  @Post('posts/:id/report')
  @ApiOperation({ summary: '举报（累计 ≥3 自动隐藏）' })
  async reportPost(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
    @Body() dto: ReportPostDto,
  ) {
    return this.squareService.reportPost(postId, userId, dto?.reason);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: '作者自删（置 isHidden）' })
  async deleteOwnPost(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
  ) {
    return this.squareService.deleteOwnPost(userId, postId);
  }
}
