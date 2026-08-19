/* Interface outline: implementation bodies removed. */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/auth.dto';

@Injectable()
export class AdminAuthService {
  constructor(...);
  async login(dto: AdminLoginDto);
  async validateAdmin(id: string);
