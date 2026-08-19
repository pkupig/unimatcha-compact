/* Interface outline: implementation bodies removed. */
import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { QuestionnaireType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionnaireVersionDto, CreateQuestionDto, UpdateQuestionDto } from './dto/questionnaire.dto';

@Injectable()
export class QuestionnaireService {
  constructor(...);
  async getActiveQuestionnaire(type: QuestionnaireType = QuestionnaireType.ROMANTIC);
  async getCompletion(userId: string);
  async listVersions(type?: QuestionnaireType);
  async getVersion(id: string);
  async createVersion(dto: CreateQuestionnaireVersionDto);
  async publishVersion(id: string);
  async addQuestion(versionId: string, dto: CreateQuestionDto);
  async updateQuestion(questionId: string, dto: UpdateQuestionDto);
  async deleteQuestion(questionId: string);
  async reorderQuestions(versionId: string, questionIds: string[]);
  async toggleQuestion(questionId: string, isEnabled: boolean);
