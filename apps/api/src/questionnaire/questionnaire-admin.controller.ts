import {
  Controller, Get, Post, Put, Delete, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { QuestionnaireType } from '@prisma/client';
import { QuestionnaireService } from './questionnaire.service';
import { toQType, normalizeMode } from '../matching/mode.util';
import {
  CreateQuestionnaireVersionDto, CreateQuestionDto, UpdateQuestionDto, ReorderQuestionsDto,
  ToggleQuestionDto,
} from './dto/questionnaire.dto';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('问卷管理（管理员）')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles('SUPER', 'TEAM')
@Controller('admin/questionnaire')
export class QuestionnaireAdminController {
  constructor(private questionnaireService: QuestionnaireService) {}

  @Get('versions')
  @ApiOperation({ summary: '获取问卷版本列表（可按 type 过滤）' })
  @ApiQuery({ name: 'type', required: false, enum: ['romantic', 'friend'] })
  listVersions(@Query('type') type?: string) {
    // 传入 type 则只列该 type；不传列全部
    const qType: QuestionnaireType | undefined = type ? toQType(normalizeMode(type)) : undefined;
    return this.questionnaireService.listVersions(qType);
  }

  @Get('versions/:id')
  @ApiOperation({ summary: '获取问卷版本详情（含题目）' })
  getVersion(@Param('id') id: string) { return this.questionnaireService.getVersion(id); }

  @Post('versions')
  @ApiOperation({ summary: '创建新问卷版本' })
  createVersion(@Body() dto: CreateQuestionnaireVersionDto) {
    return this.questionnaireService.createVersion(dto);
  }

  @Post('versions/:id/publish')
  @ApiOperation({ summary: '发布问卷版本（设为激活）' })
  publishVersion(@Param('id') id: string) { return this.questionnaireService.publishVersion(id); }

  @Post('versions/:versionId/questions')
  @ApiOperation({ summary: '向版本添加题目' })
  addQuestion(@Param('versionId') versionId: string, @Body() dto: CreateQuestionDto) {
    return this.questionnaireService.addQuestion(versionId, dto);
  }

  @Put('questions/:id')
  @ApiOperation({ summary: '更新题目' })
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questionnaireService.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  @ApiOperation({ summary: '删除题目' })
  deleteQuestion(@Param('id') id: string) { return this.questionnaireService.deleteQuestion(id); }

  @Patch('versions/:versionId/questions/reorder')
  @ApiOperation({ summary: '调整题目顺序' })
  reorderQuestions(@Param('versionId') versionId: string, @Body() dto: ReorderQuestionsDto) {
    return this.questionnaireService.reorderQuestions(versionId, dto.questionIds);
  }

  @Patch('questions/:id/toggle')
  @ApiOperation({ summary: '启用/禁用题目' })
  toggleQuestion(@Param('id') id: string, @Body() dto: ToggleQuestionDto) {
    return this.questionnaireService.toggleQuestion(id, dto.isEnabled);
  }
}
