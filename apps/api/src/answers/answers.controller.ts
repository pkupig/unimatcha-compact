import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AnswersService } from './answers.service';
import { SubmitAnswersDto } from './dto/answer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
  @ApiOperation({ summary: '获取我的答案' })
  async getMyAnswers(
    @CurrentUser('id') userId: string,
    @Query('versionId') versionId?: string,
  ) {
    return this.answersService.getMyAnswers(userId, versionId);
  }
}
