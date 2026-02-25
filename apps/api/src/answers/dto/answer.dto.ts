import { IsString, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AnswerItemDto {
  @ApiProperty() @IsString() questionId: string;
  @ApiProperty({ description: '答案值：string | string[] | number' }) value: any;
}

export class SubmitAnswersDto {
  @ApiProperty({ description: '问卷版本 ID' })
  @IsString()
  questionnaireVersionId: string;

  @ApiProperty({ type: [AnswerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers: AnswerItemDto[];
}
