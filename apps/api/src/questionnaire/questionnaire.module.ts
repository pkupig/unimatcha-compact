/* Interface outline: implementation bodies removed. */
import { Module } from '@nestjs/common';
import { QuestionnaireService } from './questionnaire.service';
import { QuestionnaireController } from './questionnaire.controller';
import { AdminQuestionnaireController } from './admin-questionnaire.controller';

@Module({
export class QuestionnaireModule {
