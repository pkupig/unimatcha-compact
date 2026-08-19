/* Interface outline: implementation bodies removed. */
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(...);
  async register(dto: RegisterDto);
  async login(dto: LoginDto);
  async changePassword(userId: string, currentPassword: string, newPassword: string);
  async validateUser(id: string);
  private signToken(userId: string, email: string): string;
