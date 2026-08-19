/* Interface outline: implementation bodies removed. */
import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, ChangePasswordDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(...);
@Post('register')
  async register(@Body() dto: RegisterDto);
@Post('login')
  async login(@Body() dto: LoginDto);
@UseGuards(JwtAuthGuard)
@Post('change-password')
  async changePassword(...);
