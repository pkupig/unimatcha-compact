import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AnswersService } from './answers.service';
import { SubmitAnswersDto } from './dto/answer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { toQType, normalizeMode } from '../matching/mode.util';

@ApiTags('问卷答案')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('answers')
export class AnswersController {
  constructor(private answersService: AnswersService) {}

  @Post()
  @ApiOperation({ summary: '提交问卷答案' })
  async submit(@CurrentUser('id') userId: string, @Body() dto: SubmitAnswersDto) {
    return this.answersService.submitAnswers(userId, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: '获取我的答案（可按版本或模式过滤）' })
  @ApiQuery({ name: 'versionId', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['romantic', 'friend'] })
  async getMyAnswers(
    @CurrentUser('id') userId: string,
    @Query('versionId') versionId?: string,
    @Query('type') type?: string,
  ) {
    return this.answersService.getMyAnswers(
      userId,
      versionId,
      type ? toQType(normalizeMode(type)) : undefined,
    );
  }
}
