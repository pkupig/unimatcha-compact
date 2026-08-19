/* Interface outline: implementation bodies removed. */
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(...);
@Post('login')
  async login(@Body() dto: AdminLoginDto);
