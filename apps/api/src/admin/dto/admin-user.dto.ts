import { AdminRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';

/**
 * 后管账号管理 DTO（§8.1.3）。
 * role 用 Prisma 的 AdminRole 枚举（SUPER/STUDENT_UNION/TEAM/SPONSOR）；
 * STUDENT_UNION 必填 schoolId（业务层校验，非 DTO 层强制）。
 */
export class CreateAdminUserDto {
  @ApiProperty({ example: 'union@pku.edu.cn' })
  @IsEmail({}, { message: 'Please enter a valid email address' })
  email: string;

  @ApiProperty({ example: 'Admin@123456', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(64)
  password: string;

  @ApiProperty({ example: '北大学生会' })
  @IsString()
  @MaxLength(64)
  name: string;

  @ApiPropertyOptional({
    enum: AdminRole,
    example: AdminRole.STUDENT_UNION,
    description: 'SUPER/TEAM 创建时必填；学生会创建时忽略（强制 SPONSOR）',
  })
  @IsOptional()
  @IsEnum(AdminRole, { message: 'Invalid role' })
  role?: AdminRole;

  @ApiPropertyOptional({ description: 'STUDENT_UNION 必填：绑定的 School.id（须已存在于学校表）' })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiPropertyOptional({ description: 'TEAM/SPONSOR 组织名', example: '校园恋爱运营团队' })
  @IsOptional()
  @IsString()
  organizationName?: string;

  @ApiPropertyOptional({ description: '联系人姓名' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactName?: string;

  @ApiPropertyOptional({ description: '联系电话' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({
    description:
      'SPONSOR 来源学校 School.id（TEAM 代学生会创建自拉广告商时显式指定；学生会创建时强制为本校）',
  })
  @IsOptional()
  @IsString()
  sourcedBySchoolId?: string;
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional({ example: '新名称' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ description: '新密码（≥8 位）', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(64)
  password?: string;

  @ApiPropertyOptional({ enum: AdminRole, description: '仅 SUPER 可改' })
  @IsOptional()
  @IsEnum(AdminRole, { message: 'Invalid role' })
  role?: AdminRole;

  @ApiPropertyOptional({ description: '仅 SUPER 可改' })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationName?: string;

  @ApiPropertyOptional({ description: '联系人姓名（本人或 SUPER 可改）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactName?: string;

  @ApiPropertyOptional({ description: '联系电话（本人或 SUPER 可改）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'SPONSOR 来源学校 School.id；仅 SUPER 可改' })
  @IsOptional()
  @IsString()
  sourcedBySchoolId?: string;

  @ApiPropertyOptional({ description: '启用/禁用（软删除）；SUPER 可改，学生会可对本校来源广告商切换' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// 后管账号列表查询（GET /admin/admin-users）
export class ListAdminUsersQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'SUPER / TEAM / STUDENT_UNION / SPONSOR' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: '按绑定学校过滤（School.id）' })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiPropertyOptional({ description: "'true' / 'false'" })
  @IsOptional()
  @IsString()
  isActive?: string;
}
