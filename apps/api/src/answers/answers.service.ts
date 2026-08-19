/* Interface outline: implementation bodies removed. */
import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionnaireType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAnswersDto } from './dto/answer.dto';

@Injectable()
export class AnswersService {
  constructor(...);
  async submitAnswers(userId: string, dto: SubmitAnswersDto);
  async getMyAnswers(...);
type?: QuestionnaireType,
  async hasSubmittedCurrentVersion(userId: string): Promise<boolean>;
