import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, RegisterSendCodeDto, LoginDto, ChangePasswordDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthCodeRateLimitGuard } from '../public/public-rate-limit.guard';

@ApiTags('用户认证')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 公开发码端点会真实触发邮件外发，套 IP 限流；阈值适配校园共享 NAT（见 guard 注释）
  @Public()
  @UseGuards(AuthCodeRateLimitGuard)
  @Post('register/send-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注册：发送邮箱验证码（未配置邮件服务时返回 devCode）' })
  async sendRegisterCode(@Body() dto: RegisterSendCodeDto) {
    return this.authService.sendRegisterCode(dto.email);
  }

  // 同样限流：register 是公开端点且承担验证码比对。并发猜码由每码 5 次上限兜底，
  // 这里只挡无脑刷量，阈值同样适配校园共享 NAT。
  @Public()
  @UseGuards(AuthCodeRateLimitGuard)
  @Post('register')
  @ApiOperation({ summary: '用户注册（需先经 register/send-code 获取邮箱验证码）' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用户登录' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '修改密码（需登录）' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() body: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, body?.currentPassword, body?.password);
  }
}
