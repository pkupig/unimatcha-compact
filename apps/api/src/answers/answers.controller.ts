/* Interface outline: implementation bodies removed. */
import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AnswersService } from './answers.service';
import { SubmitAnswersDto } from './dto/answer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { toQType, normalizeMode } from '../matching/mode.util';

@UseGuards(JwtAuthGuard)
@Controller('answers')
export class AnswersController {
  constructor(...);
@Post()
  async submit(@CurrentUser('id') userId: string, @Body() dto: SubmitAnswersDto);
@Get('mine')
  async getMyAnswers(...);
type ? toQType(normalizeMode(type)) : undefined,
