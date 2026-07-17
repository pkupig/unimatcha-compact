import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WaitlistDto {
  @ApiProperty({ example: 'student@campus.edu' })
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ example: 'zh' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;
}

export class SponsorApplicationDto extends WaitlistDto {
  @ApiProperty({ example: 'UCL Students Union' })
  @IsString()
  @MaxLength(120)
  organization: string;

  @ApiPropertyOptional({ example: '想为迎新周申请活动赞助' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
