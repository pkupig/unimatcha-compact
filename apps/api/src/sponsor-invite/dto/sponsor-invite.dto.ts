import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

/**
 * 学生会邀请码 DTO（B5）。
 * schoolId 不在创建入参内——恒取自当前学生会账号绑定的学校（requireUnionSchool）。
 */
export class CreateInviteDto {
  @ApiPropertyOptional({ description: '备注/用途标签', example: '五一集市招商' })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '备注最长 64 字' })
  note?: string;

  @ApiPropertyOptional({ description: '最大使用次数（缺省不限次）', minimum: 1 })
  @IsOptional()
  @IsInt({ message: '使用次数上限必须为整数' })
  @Min(1, { message: '使用次数上限至少为 1' })
  maxUses?: number;

  @ApiPropertyOptional({ description: '过期时间（ISO 日期串，缺省永久有效）' })
  @IsOptional()
  @IsDateString({}, { message: '过期时间格式无效' })
  expiresAt?: string;
}

export class ToggleInviteDto {
  @ApiProperty({ description: '启用 / 停用（可重新启用）' })
  @IsBoolean({ message: 'isActive 必须为布尔值' })
  isActive: boolean;
}

// 邀请码列表查询（GET /admin/sponsor-invites）
export class ListInvitesQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: "'true' / 'false'" })
  @IsOptional()
  @IsString()
  isActive?: string;

  @ApiPropertyOptional({ description: '按学校过滤（School.id；仅平台侧生效，学生会强制本校）' })
  @IsOptional()
  @IsString()
  schoolId?: string;
}

/** 商家公开自注册（POST /admin/auth/register-sponsor，无鉴权 + IP 限流） */
export class RegisterSponsorDto {
  @ApiProperty({ description: '学生会邀请码', example: 'INV-XXXXXXXXXXXX' })
  @IsString({ message: '邀请码必须为字符串' })
  code: string;

  @ApiProperty({ example: 'sponsor@example.com' })
  @IsEmail({}, { message: '请输入合法的邮箱地址' })
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 64 })
  @IsString()
  @Length(8, 64, { message: '密码长度须为 8–64 位' })
  password: string;

  @ApiProperty({ description: '商家/组织名称', example: '校门口奶茶店' })
  @IsString({ message: '组织名必须为字符串' })
  @MaxLength(80, { message: '组织名最长 80 字' })
  organizationName: string;

  @ApiProperty({ description: '联系人姓名' })
  @IsString({ message: '联系人必须为字符串' })
  @MaxLength(40, { message: '联系人最长 40 字' })
  contactName: string;

  @ApiPropertyOptional({ description: '联系电话' })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: '联系电话最长 30 字' })
  contactPhone?: string;
}
