import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CoupleService } from './couple.service';

class SetStatusDto {
  @ApiProperty({ example: 'Missing you' }) @IsString() status: string;
}

class CravingDto {
  @ApiProperty({ example: 'Ramen' }) @IsString() text: string;
}

class ScheduleDto {
  @ApiProperty({ example: 'Library then gym' }) @IsString() text: string;
  @ApiProperty({ example: '2026-06-21T14:00' }) @IsString() startAt: string;
  @ApiProperty({ example: '2026-06-21T18:00' }) @IsString() endAt: string;
}

class AnniversaryDto {
  @ApiProperty({ example: 'First date' }) @IsString() title: string;
  @ApiProperty({ example: '2026-09-01' }) @IsString() date: string;
}

class AnniversaryUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() image?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
}

class BucketAddDto {
  @ApiProperty({ example: 'Watch the sunrise together' }) @IsString() text: string;
}

class BucketToggleDto {
  @ApiProperty({ example: true }) @IsBoolean() done: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() image?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
}

class CoverDto {
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string | null;
}

@ApiTags('情侣空间')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('couple')
export class CoupleController {
  constructor(private readonly couple: CoupleService) {}

  @Get(':matchId')
  @ApiOperation({ summary: '获取情侣空间聚合数据（本轮反馈2）' })
  getSpace(@CurrentUser('id') userId: string, @Param('matchId') matchId: string) {
    return this.couple.getSpace(userId, matchId);
  }

  @Put(':matchId/cover')
  @ApiOperation({ summary: '设置/清除我的情侣封面（各自一张，本轮反馈4）' })
  setCover(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Body() dto: CoverDto,
  ) {
    return this.couple.setCover(userId, matchId, dto.imageUrl ?? null);
  }

  @Post(':matchId/love-you')
  @ApiOperation({ summary: '发送「我爱你」（每天一次；彩蛋：双方各满100次发里程碑）' })
  sendLoveYou(@CurrentUser('id') userId: string, @Param('matchId') matchId: string) {
    return this.couple.sendLoveYou(userId, matchId);
  }

  @Put(':matchId/status')
  @ApiOperation({ summary: '设置我的今日状态（顶部卡片）' })
  setStatus(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.couple.setStatus(userId, matchId, dto.status);
  }

  @Post(':matchId/craving')
  @ApiOperation({ summary: '今天想吃：记录一次（入历史）' })
  addCraving(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Body() dto: CravingDto,
  ) {
    return this.couple.addCraving(userId, matchId, dto.text);
  }

  @Post(':matchId/schedule')
  @ApiOperation({ summary: '近期安排：新增一条（带起止时间）' })
  addSchedule(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Body() dto: ScheduleDto,
  ) {
    return this.couple.addSchedule(userId, matchId, dto);
  }

  @Delete(':matchId/schedule/:id')
  @ApiOperation({ summary: '删除我的安排' })
  deleteSchedule(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Param('id') id: string,
  ) {
    return this.couple.deleteSchedule(userId, matchId, id);
  }

  @Post(':matchId/anniversary')
  @ApiOperation({ summary: '新增纪念日' })
  addAnniversary(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Body() dto: AnniversaryDto,
  ) {
    return this.couple.addAnniversary(userId, matchId, dto);
  }

  @Patch(':matchId/anniversary/:id')
  @ApiOperation({ summary: '编辑纪念日（标题/日期/图文，本轮反馈6b）' })
  updateAnniversary(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Param('id') id: string,
    @Body() dto: AnniversaryUpdateDto,
  ) {
    return this.couple.updateAnniversary(userId, matchId, id, dto);
  }

  @Delete(':matchId/anniversary/:id')
  @ApiOperation({ summary: '删除纪念日' })
  deleteAnniversary(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Param('id') id: string,
  ) {
    return this.couple.deleteAnniversary(userId, matchId, id);
  }

  @Post(':matchId/bucket')
  @ApiOperation({ summary: '新增打卡清单项' })
  addBucket(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Body() dto: BucketAddDto,
  ) {
    return this.couple.addBucket(userId, matchId, dto);
  }

  @Patch(':matchId/bucket/:id')
  @ApiOperation({ summary: '打勾完成（可附文字+图片）/ 取消打勾' })
  toggleBucket(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Param('id') id: string,
    @Body() dto: BucketToggleDto,
  ) {
    return this.couple.toggleBucket(userId, matchId, id, dto);
  }

  @Delete(':matchId/bucket/:id')
  @ApiOperation({ summary: '删除打卡清单项（已完成的不可删除）' })
  deleteBucket(
    @CurrentUser('id') userId: string,
    @Param('matchId') matchId: string,
    @Param('id') id: string,
  ) {
    return this.couple.deleteBucket(userId, matchId, id);
  }
}
