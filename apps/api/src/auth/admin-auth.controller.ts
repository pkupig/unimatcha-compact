import { Controller, Post, Body, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { CurrentAdmin } from '../admin-core/current-admin.decorator';
import { AdminActor } from '../admin-core/admin-actor';
import { PublicRateLimitGuard } from '../public/public-rate-limit.guard';
import { SponsorInviteService } from '../sponsor-invite/sponsor-invite.service';
import { RegisterSponsorDto } from '../sponsor-invite/dto/sponsor-invite.dto';

@ApiTags('管理员认证')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private adminAuthService: AdminAuthService,
    private sponsorInviteService: SponsorInviteService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理员登录' })
  async login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  // ── 广告商自注册（B5 + 开放注册）：无鉴权公开端点 + IP 限流 ──────

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Get('invite-info')
  @ApiOperation({ summary: '邀请码预校验（注册页用；恒 200 返回 valid/reason，不抛错）' })
  async inviteInfo(@Query('code') code?: string) {
    // code 缺省按 NOT_FOUND 处理（服务层对空串直接短路）
    return this.sponsorInviteService.getInviteInfo(code ?? '');
  }

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('register-sponsor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '广告商自注册：凭学生会邀请码或直接注册（无码=平台直签；注册即登录，返回 {admin, token}）',
  })
  async registerSponsor(@Body() dto: RegisterSponsorDto) {
    const admin = await this.sponsorInviteService.registerViaCode(dto);
    return this.adminAuthService.issueFor(admin);
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
