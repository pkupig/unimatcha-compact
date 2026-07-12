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
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

// Ensure the uploads directory exists
const UPLOADS_DIR = join(process.cwd(), 'uploads');
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

const imageStorage = diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

// 仅允许位图类型；显式拒绝 image/svg+xml——SVG 可内嵌 <script>，
// 同源访问 /uploads/x.svg 时会触发存储型 XSS（§安全）。
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function imageFileFilter(_req: any, file: Express.Multer.File, cb: any) {
  if (!ALLOWED_IMAGE_MIMES.has((file.mimetype || '').toLowerCase())) {
    return cb(new BadRequestException('Only JPEG, PNG, GIF, or WebP images are allowed'), false);
  }
  cb(null, true);
}

class UploadUrlDto {
  @ApiProperty({ description: '图片 URL' })
  @IsString()
  url: string;
}

class UploadRealPhotoDto {
  @ApiProperty()
  @IsString()
  url: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  caption?: string;
}

@ApiTags('上传')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 上传图片文件（multipart/form-data, field name: "file"）
   * 文件保存到 /uploads 目录，通过 /uploads/{filename} 访问
   */
  @Post('image')
  @ApiOperation({ summary: '上传图片文件' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: imageStorage,
      fileFilter: imageFileFilter,
      limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('Please select an image to upload');
    const host = `${req.protocol}://${req.get('host')}`;
    const url = `${host}/uploads/${file.filename}`;
    return { url, filename: file.filename };
  }

  @Post('avatar')
  @ApiOperation({ summary: '设置头像 URL（占位：直接存 URL）' })
  async setAvatar(
    @CurrentUser('id') userId: string,
    @Body() dto: UploadUrlDto,
  ) {
    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, avatarUrl: dto.url },
      update: { avatarUrl: dto.url },
    });
    return { message: 'Avatar updated', avatarUrl: dto.url };
  }

  @Post('real-photo')
  @ApiOperation({ summary: '添加真实照片 URL（占位）' })
  async addRealPhoto(
    @CurrentUser('id') userId: string,
    @Body() dto: UploadRealPhotoDto,
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { realPhotos: true },
    });
    const existing = profile?.realPhotos ?? [];
    if (existing.length >= 6) {
      return { message: 'You can upload at most 6 real photos', realPhotos: existing };
    }
    const updated = [...existing, dto.url];
    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, realPhotos: updated },
      update: { realPhotos: updated },
    });
    return { message: 'Real photo added', realPhotos: updated };
  }
}
