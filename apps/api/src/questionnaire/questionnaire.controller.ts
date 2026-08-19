/* Interface outline: implementation bodies removed. */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { QuestionnaireService } from './questionnaire.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { toQType, normalizeMode } from '../matching/mode.util';

@UseGuards(JwtAuthGuard)
@Controller('questionnaire')
export class QuestionnaireController {
  constructor(...);
@Get('active')
  async getActive(@Query('type') type = 'romantic');
@Get('completion')
  async getCompletion(@CurrentUser('id') userId: string);
