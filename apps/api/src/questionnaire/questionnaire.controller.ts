import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { QuestionnaireService } from './questionnaire.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { toQType, normalizeMode } from '../matching/mode.util';

@ApiTags('问卷（用户端）')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('questionnaire')
export class QuestionnaireController {
  constructor(private questionnaireService: QuestionnaireService) {}

  @Get('active')
  @ApiOperation({ summary: '获取当前激活问卷（按模式）' })
  @ApiQuery({ name: 'type', required: false, enum: ['romantic', 'friend'] })
  async getActive(@Query('type') type = 'romantic') {
    // mode 字符串 → QuestionnaireType 枚举（非法值兜底为 romantic）
    return this.questionnaireService.getActiveQuestionnaire(toQType(normalizeMode(type)));
  }

  @Get('completion')
  @ApiOperation({ summary: '获取两类问卷的完成度（G 规则）' })
  async getCompletion(@CurrentUser('id') userId: string) {
    return this.questionnaireService.getCompletion(userId);
  }
}
