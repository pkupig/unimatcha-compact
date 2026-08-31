import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateProfileDto } from '../profiles/dto/profile.dto';

class UpdateSettingsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ example: { showProfile: true, showOnline: true, showMoments: true } })
  @IsOptional()
  @IsObject()
  privacy?: Record<string, unknown>;
}

class SendCodeDto {
  @ApiProperty({ example: 'me@ox.ac.uk' })
  @IsString()
  schoolEmail: string;
}

class SubmitVerificationDto {
  @ApiProperty({ description: '学生卡照片 URL（先经 /uploads/image 上传）' })
  @IsString()
  studentCardUrl: string;

  @ApiProperty({ example: 'me@ox.ac.uk' })
  @IsString()
  schoolEmail: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  code: string;
}

class SetNoteDto {
  @ApiProperty()
  @IsString()
  targetUserId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

@ApiTags('用户')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息（含资料和社交联系方式）' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Put('me')
  @ApiOperation({ summary: '更新当前用户资料（含社交联系方式）' })
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProfileDto,
  ) {
    return this.usersService.updateMyProfile(userId, dto);
  }

  @Get('me/match-status')
  @ApiOperation({ summary: '获取当前匹配状态与下次匹配时间' })
  async getMatchStatus(@CurrentUser('id') userId: string) {
    return this.usersService.getMyMatchStatus(userId);
  }

  @Get('me/settings')
  @ApiOperation({ summary: '获取当前用户设置（与默认值合并）' })
  async getSettings(@CurrentUser('id') userId: string) {
    return this.usersService.getSettings(userId);
  }

  @Put('me/settings')
  @ApiOperation({ summary: '更新当前用户设置（部分更新，仅合并已知键）' })
  async updateSettings(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.usersService.updateSettings(userId, dto);
  }

  @Post('me/verification/send-code')
  @ApiOperation({ summary: '学生认证：发送学校邮箱验证码（未配置邮件服务时返回 devCode）' })
  async sendVerificationCode(@CurrentUser('id') userId: string, @Body() dto: SendCodeDto) {
    return this.usersService.sendVerificationCode(userId, dto.schoolEmail);
  }

  @Post('me/verification/submit')
  @ApiOperation({ summary: '学生认证：提交学生卡 + 邮箱验证码 → pending，等管理员审核' })
  async submitVerification(@CurrentUser('id') userId: string, @Body() dto: SubmitVerificationDto) {
    return this.usersService.submitVerification(userId, dto);
  }

  @Get('me/connect-code')
  @ApiOperation({ summary: '扫码加好友：获取我的连接码（二维码编码它）' })
  async getConnectCode(@CurrentUser('id') userId: string) {
    return this.usersService.getOrCreateConnectCode(userId);
  }

  @Put('me/notes')
  @ApiOperation({ summary: '设置对某用户的备注（#3，显示在聊天列表/资料）' })
  async setNote(@CurrentUser('id') userId: string, @Body() dto: SetNoteDto) {
    return this.usersService.setNote(userId, dto.targetUserId, dto.note || '');
  }

  @Get('search')
  @ApiOperation({ summary: '按昵称/学校搜索用户（查找好友，本轮反馈3）' })
  @ApiQuery({ name: 'q', required: true })
  async search(@CurrentUser('id') userId: string, @Query('q') q: string) {
    return this.usersService.searchUsers(userId, q || '');
  }

  @Get(':id/public-profile')
  @ApiOperation({ summary: '获取用户公开资料（匹配对象/他人展示）' })
  async getPublicProfile(
    @CurrentUser('id') currentUserId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.usersService.getPublicProfile(currentUserId, targetUserId);
  }

}
