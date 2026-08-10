import { Controller, Post, Body, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';

@ApiTags('管理员认证')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private adminAuthService: AdminAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理员登录' })
  async login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  // 所有已登录角色可用（含 SPONSOR）——身份以此为准，前端启动时拉取
  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前管理员信息（与 login 返回的 admin 同形状，实时读库）' })
  async me(@CurrentAdmin() actor: AdminActor) {
    return this.adminAuthService.getMe(actor.id);
  }
}
