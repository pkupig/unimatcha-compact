import {
  IsString, IsOptional, IsBoolean, IsInt, IsEnum, IsArray,
  ValidateNested, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType } from '@prisma/client';

export class CreateOptionDto {
  @ApiProperty() @IsString() label: string;
  @ApiProperty() @IsString() value: string;
  @ApiProperty() @IsInt() order: number;
}

export class CreateQuestionDto {
  @ApiProperty({ enum: QuestionType }) @IsEnum(QuestionType) type: QuestionType;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() order?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() group?: string;

  @ApiPropertyOptional({ type: [CreateOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options?: CreateOptionDto[];
}

export class CreateQuestionnaireVersionDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ type: [CreateQuestionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions?: CreateQuestionDto[];
}

export class UpdateQuestionDto extends CreateQuestionDto {}

export class ReorderQuestionsDto {
  @ApiProperty({ type: [String], description: '按新顺序排列的问题 ID 数组' })
  @IsArray()
  @IsString({ each: true })
  questionIds: string[];
}
