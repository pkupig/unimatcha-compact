/* Interface outline: implementation bodies removed. */
import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty, ApiConsumes } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { diskStorage } from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

  mkdirSync(...);
  cb(...);
function imageFileFilter(_req: any, file: Express.Multer.File, cb: any);
  cb(null, true);
class UploadUrlDto {
class UploadRealPhotoDto {
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(...);
@Post('image')
@UseInterceptors(
  FileInterceptor(...);
  async uploadImage(...);
@Post('avatar')
  async setAvatar(...);
@Post('real-photo')
  async addRealPhoto(...);
