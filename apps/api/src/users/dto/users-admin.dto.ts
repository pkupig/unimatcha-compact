import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

/** 用户后管 DTO（原 admin.controller.ts 内联类，Step6 迁入） */

export class UpdateStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'BANNED'] })
  @IsEnum(['ACTIVE', 'BANNED'])
  status: 'ACTIVE' | 'BANNED';
}

export class UpdateVerificationDto {
  @ApiProperty({ enum: ['unverified', 'pending', 'verified', 'rejected'] })
  @IsIn(['unverified', 'pending', 'verified', 'rejected'])
  status: 'unverified' | 'pending' | 'verified' | 'rejected';

  // 认证学校快照（校标唯一依据）。status=verified 时不传则回落到申请人当时的
  // profile.school；管理员在审核队列里能看到学邮域名，可据此纠正。
  @ApiPropertyOptional({ description: '认证学校名（须与 School.name 精确一致）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  verifiedSchool?: string;
}

export class ListUsersQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: '模糊匹配 email / 昵称' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'BANNED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'BANNED'])
  status?: 'ACTIVE' | 'BANNED';
}

export class UsersOverviewQueryDto {
  @ApiPropertyOptional({
    description: '学校名（School.name）；SUPER/TEAM 可选，不传=全平台；学生会忽略此参数恒为本校',
  })
  @IsOptional()
  @IsString()
  school?: string;
}
