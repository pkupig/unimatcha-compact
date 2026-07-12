import {
  IsString, IsOptional, IsInt, IsArray, IsEnum, IsObject, Min, Max,
  MaxLength, ArrayMaxSize,
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

const MBTI_VALUES = [
  'INTJ','INTP','ENTJ','ENTP',
  'INFJ','INFP','ENFJ','ENFP',
  'ISTJ','ISFJ','ESTJ','ESFJ',
  'ISTP','ISFP','ESTP','ESFP',
];

const GRADE_VALUES = ['大一','大二','大三','大四','研一','研二','研三','博士一','博士二','博士三','博士四'];

export class CreateProfileDto {
  // 资料可分步填写，全部改为可选；upsert 会保留未提交字段
  @ApiProperty({ example: '晓月', required: false })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiProperty({ example: 'Xiaoyue Zhang', required: false, description: '真实姓名（合成），仅对已确认的伴侣/好友可见' })
  @IsOptional()
  @IsString()
  realName?: string;

  @ApiProperty({ example: 'Zhang', required: false, description: '姓' })
  @IsOptional()
  @IsString()
  familyName?: string;

  @ApiProperty({ example: 'Xiaoyue', required: false, description: '名' })
  @IsOptional()
  @IsString()
  givenName?: string;

  @ApiProperty({ example: 'University of Oxford', required: false })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiProperty({ example: '大三', enum: GRADE_VALUES, required: false })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ enum: GenderPref, required: false })
  @IsOptional()
  @IsEnum(GenderPref)
  genderPref?: GenderPref;

  @ApiProperty({ example: 21, required: false })
  @IsOptional()
  @IsInt()
  @Min(16)
  @Max(40)
  age?: number;

  @ApiProperty({ example: 'London', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: ['Music', 'Travel'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional({ example: ['Vinyl record', 'Film camera'], description: '礼物罐子：最多5个想要的礼物（本轮反馈2-5）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  wishGifts?: string[];

  @ApiPropertyOptional({ example: '喜欢发呆，在城市里找角落...' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: '社交联系方式 JSON',
    example: { wechat: 'myWx123', qq: '123456', xiaohongshu: '', weibo: '', instagram: '' },
  })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;

  @ApiPropertyOptional({ example: '愿世间美好与你环环相扣' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  signature?: string;

  @ApiPropertyOptional({ example: 'https://example.com/cover.jpg' })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({
    example: ['学霸', '猫奴', 'Coffee lover'],
    description: '个人标签，最多10个，每个最多20字符',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  @MaxLength(20, { each: true })
  tags?: string[];

  // ─── 第三轮新增 ─────────────────────────────
  @ApiPropertyOptional({ example: 'Computer Science' })
  @IsOptional()
  @IsString()
  major?: string;

  @ApiPropertyOptional({ example: 'INTJ', enum: MBTI_VALUES })
  @IsOptional()
  @IsString()
  mbti?: string;

  @ApiPropertyOptional({ example: 'Chinese' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ example: ['https://example.com/photo1.jpg'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(6)
  realPhotos?: string[];

  @ApiPropertyOptional({ example: '白羊座' })
  @IsOptional()
  @IsString()
  zodiac?: string;
}

export class UpdateProfileDto extends CreateProfileDto {}
