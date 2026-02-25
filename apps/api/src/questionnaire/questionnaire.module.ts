import { Module } from '@nestjs/common';
import { QuestionnaireService } from './questionnaire.service';
import { QuestionnaireController } from './questionnaire.controller';
import { AdminQuestionnaireController } from './admin-questionnaire.controller';

@Module({
  providers: [QuestionnaireService],
  controllers: [QuestionnaireController, AdminQuestionnaireController],
  exports: [QuestionnaireService],
})
export class QuestionnaireModule {}
