/* Interface outline: implementation bodies removed. */
import {
  Controller, Get, Post, Put, Delete, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { QuestionnaireType } from '@prisma/client';
import { QuestionnaireService } from './questionnaire.service';
import { toQType, normalizeMode } from '../matching/mode.util';
import {
  CreateQuestionnaireVersionDto, CreateQuestionDto, UpdateQuestionDto, ReorderQuestionsDto,
} from './dto/questionnaire.dto';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/questionnaire')
export class AdminQuestionnaireController {
  constructor(...);
@Get('versions')
  listVersions(@Query('type') type?: string);
@Get('versions/:id')
  getVersion(@Param('id') id: string);
@Post('versions')
  createVersion(@Body() dto: CreateQuestionnaireVersionDto);
@Post('versions/:id/publish')
  publishVersion(@Param('id') id: string);
@Post('versions/:versionId/questions')
  addQuestion(@Param('versionId') versionId: string, @Body() dto: CreateQuestionDto);
@Put('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto);
@Delete('questions/:id')
  deleteQuestion(@Param('id') id: string);
@Patch('versions/:versionId/questions/reorder')
  reorderQuestions(@Param('versionId') versionId: string, @Body() dto: ReorderQuestionsDto);
@Patch('questions/:id/toggle')
  toggleQuestion(@Param('id') id: string, @Body('isEnabled') isEnabled: boolean);
