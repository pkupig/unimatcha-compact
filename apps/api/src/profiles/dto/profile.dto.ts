import {
  IsString, IsOptional, IsInt, IsArray, IsEnum, IsObject, Min, Max,
  MaxLength, ArrayMaxSize, Matches,
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

// 学业阶段：细化到每一学年并含预科（用户反馈）。存英文规范值，中文仅显示层
// 映射（H5 的 META_ZH）。历史值（Freshman/Undergraduate/Postgraduate/Doctorate
// 及旧中文值）不做迁移——前端下拉会把库里已有的值原样保留为可选项。
const GRADE_VALUES = [
  'Foundation',
  'Year 1', 'Year 2', 'Year 3', 'Year 4',
  "Master's",
  'PhD Year 1', 'PhD Year 2', 'PhD Year 3', 'PhD Year 4+',
];

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

  @ApiPropertyOptional({ example: '2004-06-01', description: '生日 YYYY-MM-DD；注册收生日，age 由前端按生日推算一并提交' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthday must be YYYY-MM-DD' })
  birthday?: string;

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

  @ApiPropertyOptional({ example: '2312345', description: '学生卡号；仅本人可见' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  studentId?: string;

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
