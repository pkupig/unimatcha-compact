import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';
import { CreateProfileDto } from './dto/profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('用户资料')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private profilesService: ProfilesService) {}

  @Get('me')
  @ApiOperation({ summary: '获取我的资料' })
  async getMyProfile(@CurrentUser('id') userId: string) {
    return this.profilesService.getMyProfile(userId);
  }

  @Put('me')
  @ApiOperation({ summary: '创建/更新我的资料' })
  async upsertProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProfileDto,
  ) {
    return this.profilesService.upsertProfile(userId, dto);
  }
}
