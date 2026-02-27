import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateProfileDto } from '../profiles/dto/profile.dto';

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

  @Get(':id/public-profile')
  @ApiOperation({ summary: '获取用户公开资料（匹配对象主页展示）' })
  async getPublicProfile(
    @CurrentUser('id') _currentUserId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.usersService.getPublicProfile(targetUserId);
  }
}
