import {
  Controller, Get, Put, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class UpdateStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'BANNED'] })
  @IsEnum(['ACTIVE', 'BANNED'])
  status: 'ACTIVE' | 'BANNED';
}

@ApiTags('管理后台')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: '仪表盘统计数据' })
  getDashboard() { return this.adminService.getDashboardStats(); }

  // ─── Users ────────────────────────────────────────────────
  @Get('users')
  @ApiOperation({ summary: '用户列表' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  listUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.listUsers({ page, limit, search, status });
  }

  @Get('users/:id')
  @ApiOperation({ summary: '用户详情（含答题记录）' })
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: '封禁/解封用户' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.adminService.updateUserStatus(id, dto.status);
  }

  @Patch('users/:id/reset-mode')
  @ApiOperation({ summary: '重置用户匹配模式（relationship -> match）' })
  resetMode(@Param('id') id: string) {
    return this.adminService.resetUserMode(id);
  }

  // ─── System Config ─────────────────────────────────────────
  @Get('configs')
  @ApiOperation({ summary: '获取所有系统配置' })
  getConfigs() { return this.adminService.getAllConfigs(); }

  @Put('configs/:key')
  @ApiOperation({ summary: '更新系统配置' })
  updateConfig(@Param('key') key: string, @Body('value') value: any) {
    return this.adminService.updateSystemConfig(key, value);
  }
}
