/* Interface outline: implementation bodies removed. */
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
import { SquareBoard } from '@prisma/client';
import { SquareService } from './square.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreatePostDto,
  CreateCommentDto,
  ReportPostDto,
  VotePollDto,
} from './dto/square.dto';

@UseGuards(JwtAuthGuard)
@Controller('square/v2')
export class SquareController {
  constructor(...);
@Post('posts')
  async createPost(...);
@Get('recommend')
  async listRecommend(...);
@Get('campus-wall')
  async listCampusWall(...);
@Get('search')
  async search(...);
@Get('posts/:id')
  async getPost(...);
@Post('posts/:id/vote')
  async votePoll(...);
@Post('posts/:id/like')
  async likePost(...);
@Post('posts/:id/comments')
  async createComment(...);
@Post('comments/:id/like')
  async likeComment(...);
@Post('posts/:id/report')
  async reportPost(...);
@Delete('posts/:id')
  async deleteOwnPost(...);
