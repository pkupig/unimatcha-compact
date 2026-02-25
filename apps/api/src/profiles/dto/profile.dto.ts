import {
  IsString, IsOptional, IsInt, IsArray, IsEnum, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  NON_BINARY = 'non_binary',
  OTHER = 'other',
}

export enum GenderPref {
  MALE = 'male',
  FEMALE = 'female',
  ANY = 'any',
}

export class CreateProfileDto {
  @ApiProperty({ example: '晓月' })
  @IsString()
  nickname: string;

  @ApiProperty({ example: '北京大学' })
  @IsString()
  school: string;

  @ApiProperty({ example: '大三', enum: ['大一', '大二', '大三', '大四', '研一', '研二', '研三'] })
  @IsString()
  grade: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({ enum: GenderPref })
  @IsEnum(GenderPref)
  genderPref: GenderPref;

  @ApiProperty({ example: 21 })
  @IsInt()
  @Min(16)
  @Max(30)
  age: number;

  @ApiProperty({ example: '北京' })
  @IsString()
  city: string;

  @ApiPropertyOptional({ example: ['音乐', '旅行', '摄影'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional({ example: '喜欢发呆，在城市里找角落...' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class UpdateProfileDto extends CreateProfileDto {}
