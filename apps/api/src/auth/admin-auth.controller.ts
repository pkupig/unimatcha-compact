import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';

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
}
