import { Module } from '@nestjs/common';
import { QuestionnaireService } from './questionnaire.service';
import { QuestionnaireController } from './questionnaire.controller';
import { QuestionnaireAdminController } from './questionnaire-admin.controller';

@Module({
  providers: [QuestionnaireService],
  controllers: [QuestionnaireController, QuestionnaireAdminController],
  exports: [QuestionnaireService],
})
export class QuestionnaireModule {}
