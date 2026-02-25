import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { QuestionnaireService } from './questionnaire.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('问卷（用户端）')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('questionnaire')
export class QuestionnaireController {
  constructor(private questionnaireService: QuestionnaireService) {}

  @Get('active')
  @ApiOperation({ summary: '获取当前激活问卷' })
  async getActive() {
    return this.questionnaireService.getActiveQuestionnaire();
  }
}
