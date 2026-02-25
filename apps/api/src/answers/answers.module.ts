import { Module } from '@nestjs/common';
import { AnswersService } from './answers.service';
import { AnswersController } from './answers.controller';

@Module({
  providers: [AnswersService],
  controllers: [AnswersController],
  exports: [AnswersService],
})
export class AnswersModule {}
