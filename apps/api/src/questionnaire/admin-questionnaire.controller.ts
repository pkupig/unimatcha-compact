import {
  Controller, Get, Post, Put, Delete, Patch, Param, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { QuestionnaireService } from './questionnaire.service';
import {
  CreateQuestionnaireVersionDto, CreateQuestionDto, UpdateQuestionDto, ReorderQuestionsDto,
} from './dto/questionnaire.dto';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';

@ApiTags('问卷管理（管理员）')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
@Controller('admin/questionnaire')
export class AdminQuestionnaireController {
  constructor(private questionnaireService: QuestionnaireService) {}

  @Get('versions')
  @ApiOperation({ summary: '获取所有问卷版本列表' })
  listVersions() { return this.questionnaireService.listVersions(); }

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
  toggleQuestion(@Param('id') id: string, @Body('isEnabled') isEnabled: boolean) {
    return this.questionnaireService.toggleQuestion(id, isEnabled);
  }
}
