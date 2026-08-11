import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * 官网提交（PublicSubmission）后台处理 DTO（docs/ADMIN-REDESIGN.md §5.6）。
 * PATCH 只做 PENDING/CONTACTED/REJECTED 流转；APPROVED 只能经「一键开通」（convert）达成。
 */
export class UpdateSubmissionDto {
  @ApiProperty({
    enum: ['PENDING', 'CONTACTED', 'REJECTED'],
    description: 'APPROVED 不可经 PATCH 设置（走 POST /admin/submissions/:id/convert）',
  })
  @IsIn(['PENDING', 'CONTACTED', 'REJECTED'], { message: '开通账号请使用开通操作' })
  status: 'PENDING' | 'CONTACTED' | 'REJECTED';

  @ApiPropertyOptional({ description: '处理备注（缺省保留原备注；传值则覆盖）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * 一键开通后台账号（§5.6）：
 * STUDENT_UNION → schoolId / newSchoolName 二选一（后者事务内新建 School）；
 * SPONSOR → organizationName 必填，schoolId 可选作为来源学校 sourcedBySchoolId。
 * email 缺省用申请邮箱；password 仅在响应中一次性回显，不落库明文。
 */
export class ConvertSubmissionDto {
  @ApiProperty({ enum: ['STUDENT_UNION', 'SPONSOR'] })
  @IsIn(['STUDENT_UNION', 'SPONSOR'], { message: 'accountRole 参数无效（STUDENT_UNION / SPONSOR）' })
  accountRole: 'STUDENT_UNION' | 'SPONSOR';

  @ApiProperty({ example: 'Warwick 学生会', description: '账号显示名' })
  @IsString()
  @MaxLength(64)
  name: string;

  @ApiProperty({ minLength: 8, description: '初始密码（≥8 位，响应中一次性回显）' })
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(64)
  password: string;

  @ApiPropertyOptional({ description: '登录邮箱；缺省使用申请提交的邮箱' })
  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email?: string;

  @ApiPropertyOptional({
    description:
      'STUDENT_UNION：绑定现有 School.id（与 newSchoolName 二选一）；SPONSOR：可选来源学校 → sourcedBySchoolId',
  })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiPropertyOptional({ description: 'STUDENT_UNION：新建学校名（与 schoolId 二选一，name 唯一）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  newSchoolName?: string;

  @ApiPropertyOptional({ description: '新建学校所在城市（可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  newSchoolCity?: string;

  @ApiPropertyOptional({ description: 'SPONSOR 必填：组织/广告商名' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
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
}

// 官网提交列表查询（GET /admin/submissions）
export class ListSubmissionsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ['WAITLIST', 'SPONSOR'] })
  @IsOptional()
  @IsIn(['WAITLIST', 'SPONSOR'])
  type?: 'WAITLIST' | 'SPONSOR';

  @ApiPropertyOptional({ enum: ['PENDING', 'CONTACTED', 'APPROVED', 'REJECTED'] })
  @IsOptional()
  @IsIn(['PENDING', 'CONTACTED', 'APPROVED', 'REJECTED'])
  status?: string;

  @ApiPropertyOptional({ description: '模糊匹配 email / organization' })
  @IsOptional()
  @IsString()
  search?: string;
}
