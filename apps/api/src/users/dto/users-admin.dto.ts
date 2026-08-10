import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
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
