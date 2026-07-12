import {
  IsBoolean, IsOptional, IsArray, IsString, IsInt, Min, Max, IsIn, MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMatchPreferencesDto {
  @ApiPropertyOptional({ enum: ['romantic', 'friend'], example: 'romantic', description: '偏好所属模式（缺省 romantic）' })
  @IsOptional()
  @IsIn(['romantic', 'friend'])
  mode?: 'romantic' | 'friend';

  @ApiPropertyOptional({ example: false, description: '只匹配同城用户' })
  @IsOptional()
  @IsBoolean()
  requireSameCity?: boolean;

  @ApiPropertyOptional({ example: 'female', description: '偏好性别（不设置表示不限）' })
  @IsOptional()
  @IsString()
  preferredGender?: string;

  @ApiPropertyOptional({ example: 20, description: '偏好年龄下限' })
  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(60)
  ageMin?: number;

  @ApiPropertyOptional({ example: 28, description: '偏好年龄上限' })
  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(60)
  ageMax?: number;

  @ApiPropertyOptional({
    example: 'undergraduate,master',
    description: '偏好学段（逗号分隔多值，可选 undergraduate/master/doctor，不设置表示不限）',
  })
  @IsOptional()
  @IsString()
  universityStage?: string;

  @ApiPropertyOptional({ example: false, description: '只匹配同校用户' })
  @IsOptional()
  @IsBoolean()
  requireSameUniversity?: boolean;

  @ApiPropertyOptional({
    example: 'both',
    enum: ['questionnaire', 'profile', 'both'],
    description: '匹配依据：questionnaire（仅问卷）/ profile（仅资料）/ both（默认，问卷+资料）',
  })
  @IsOptional()
  @IsIn(['questionnaire', 'profile', 'both'])
  matchBasis?: string;

  @ApiPropertyOptional({ example: '希望对方喜欢户外运动', description: '额外匹配补充信息（暂仅存储，未来供 AI 匹配使用）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  extraMatchInfo?: string;

  // ─── 预留字段 ────────────────────────────────────────────────
  @ApiPropertyOptional({ example: false, description: '只匹配同专业用户（预留）' })
  @IsOptional()
  @IsBoolean()
  requireSameMajor?: boolean;

  @ApiPropertyOptional({ example: ['Chinese', 'British'], description: '偏好国籍（预留，空数组表示不限）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredNationalities?: string[];

  @ApiPropertyOptional({ example: ['INTJ', 'INFP'], description: '偏好 MBTI（预留，空数组表示不限）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredMbti?: string[];

  // ─── 朋友模式偏好（§3.6 / 新 schema） ───────────────────────────
  @ApiPropertyOptional({ example: ['篮球', '摄影'], description: '偏好兴趣（朋友模式软约束加分，空数组表示不限）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredInterests?: string[];

  @ApiPropertyOptional({ example: ['爬山', '桌游'], description: '偏好活动（朋友模式软约束加分，空数组表示不限）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredActivities?: string[];

  @ApiPropertyOptional({ example: '希望对方喜欢运动、性格开朗', description: '朋友匹配补充要求（暂仅存储）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  friendRequirements?: string;

  // ─── 增强模式开关（§10，J 规则） ────────────────────────────────
  @ApiPropertyOptional({ example: false, description: '是否开启增强模式（预扣能量，无视75分阈值强配）' })
  @IsOptional()
  @IsBoolean()
  enhancedModeEnabled?: boolean;

  @ApiPropertyOptional({ example: 1, description: '朋友增强档位 1–5（=保证匹配的朋友数 N；恋人忽略，固定3）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  friendEnhancedCells?: number;
}
