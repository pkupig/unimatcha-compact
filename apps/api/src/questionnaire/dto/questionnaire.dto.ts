import {
  IsString, IsOptional, IsBoolean, IsInt, IsEnum, IsArray,
  ValidateNested, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType, QuestionnaireType } from '@prisma/client';

// 启用/禁用题目（PATCH /admin/questionnaire/questions/:id/toggle；原裸 @Body('isEnabled')）
export class ToggleQuestionDto {
  @ApiProperty()
  @IsBoolean()
  isEnabled: boolean;
}

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
  // 问卷类型：ROMANTIC（恋人）| FRIEND（朋友）。各 type 独立版本线，每 type 至多一个 active。
  @ApiProperty({ enum: QuestionnaireType }) @IsEnum(QuestionnaireType) type: QuestionnaireType;
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
