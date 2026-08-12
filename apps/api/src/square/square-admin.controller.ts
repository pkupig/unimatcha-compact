import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { SquareAdminService } from './square-admin.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';
import {
  CreateOfficialPostDto,
  DeletePostDto,
  ListPollsQueryDto,
  ListSquarePostsQueryDto,
  PinPostDto,
  ReviewPollDto,
  UpdateOfficialPostDto,
} from './dto/square-admin.dto';
import { ListQueryDto } from '../common/dto/list-query.dto';

/** 广场后管（原 AdminController 广场段拆出；URL 不变） */
@ApiTags('广场管理')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/square')
export class SquareAdminController {
  constructor(private squareAdminService: SquareAdminService) {}

  // SUPER 不直接发帖（canPublishOfficial 口径，403 提前到守卫）
  @Post('posts')
  @Roles(AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '官方发帖（按 role/scope 校验 school）' })
  createOfficialPost(@CurrentAdmin() actor: AdminActor, @Body() dto: CreateOfficialPostDto) {
    return this.squareAdminService.createOfficialPost(actor, dto);
  }

  @Get('posts')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '广场帖子管理列表（学生会强制本校；reported=true 过滤被举报帖）' })
  listSquarePosts(@CurrentAdmin() actor: AdminActor, @Query() q: ListSquarePostsQueryDto) {
    return this.squareAdminService.adminListPosts(actor, q);
  }

  @Delete('posts/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '后管下架广场帖（学生会仅本校）' })
  deleteSquarePost(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Body() dto: DeletePostDto,
  ) {
    return this.squareAdminService.adminDeletePost(actor, id, dto?.reason);
  }

  @Post('posts/:id/restore')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '恢复展示（清 deletedBy/deletedAt/deleteReason；学生会仅本校）' })
  restoreSquarePost(@CurrentAdmin() actor: AdminActor, @Param('id') id: string) {
    return this.squareAdminService.adminRestorePost(actor, id);
  }

  @Post('posts/:id/dismiss-reports')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '清除举报（若为举报自动隐藏则同时恢复展示；学生会仅本校）' })
  dismissSquarePostReports(@CurrentAdmin() actor: AdminActor, @Param('id') id: string) {
    return this.squareAdminService.adminDismissReports(actor, id);
  }

  @Post('posts/:id/pin')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '置顶/取消置顶校园墙帖（学生会仅本校）' })
  pinSquarePost(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Body() dto: PinPostDto,
  ) {
    return this.squareAdminService.pinPost(actor, id, dto);
  }

  @Patch('posts/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '编辑官方帖（SUPER 任意；其余仅自己发布的；用户帖/活动帖不可编辑）' })
  updateOfficialPost(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Body() dto: UpdateOfficialPostDto,
  ) {
    return this.squareAdminService.updateOfficialPost(actor, id, dto);
  }

  @Post('posts/:id/purge')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '彻底删除帖子（不可恢复，评论/点赞/投票级联清除；学生会仅本校）' })
  purgeSquarePost(@CurrentAdmin() actor: AdminActor, @Param('id') id: string) {
    return this.squareAdminService.purgePost(actor, id);
  }

  @Get('posts/:id/comments')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '帖子评论列表（学生会仅本校帖）' })
  listPostComments(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Query() q: ListQueryDto,
  ) {
    return this.squareAdminService.listPostComments(actor, id, q);
  }

  @Delete('comments/:id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '删除评论（连带其楼中楼回复；学生会仅本校帖）' })
  deleteComment(@CurrentAdmin() actor: AdminActor, @Param('id') id: string) {
    return this.squareAdminService.deleteComment(actor, id);
  }

  // ─── 校园墙投票审核（学生会本校 / 团队全量）──────────────────
  @Get('polls')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '投票帖审核列表（默认 pending；学生会仅本校，团队视图带 hasUnionReviewer 标记）' })
  listPolls(@CurrentAdmin() actor: AdminActor, @Query() q: ListPollsQueryDto) {
    return this.squareAdminService.listPolls(actor, q);
  }

  @Post('polls/:id/review')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '审核投票帖（approve/reject；学生会仅本校；结果通知作者）' })
  reviewPoll(
    @CurrentAdmin() actor: AdminActor,
    @Param('id') id: string,
    @Body() dto: ReviewPollDto,
  ) {
    return this.squareAdminService.reviewPoll(actor, id, dto);
  }
}
