import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { SchoolsService } from './schools.service';
import { AdminJwtAuthGuard } from '../common/guards/admin-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateSchoolDto,
  UpdateSchoolBankDto,
  UpdateSchoolDto,
} from './dto/schools.dto';

// 当前登录后管（来自 admin-jwt 策略写入的 req.user）
type CurrentAdmin = {
  id: string;
  role: AdminRole | null;
  schoolId: string | null;
  isSuperAdmin: boolean;
};

@ApiTags('学校管理')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller('admin/schools')
export class SchoolsAdminController {
  constructor(private schoolsService: SchoolsService) {}

  @Get()
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION, AdminRole.SPONSOR)
  @ApiOperation({ summary: '学校列表（学生会仅见本校；商家仅返回瘦身字段 + 生效单价，供投放选择）' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @CurrentUser() admin: CurrentAdmin,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.schoolsService.list(admin, { search, isActive, page, limit });
  }

  @Post()
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '创建学校（name 唯一；分成 bps 0–10000）' })
  create(@Body() dto: CreateSchoolDto) {
    return this.schoolsService.create(dto);
  }

  @Get(':id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '学校详情 + 统计（学生会仅本校）' })
  detail(@CurrentUser() admin: CurrentAdmin, @Param('id') id: string) {
    return this.schoolsService.detail(admin, id);
  }

  @Put(':id')
  @Roles(AdminRole.SUPER, AdminRole.TEAM)
  @ApiOperation({ summary: '更新学校（基本信息 + 分成 bps + 计价覆盖，null 清除覆盖）' })
  update(@Param('id') id: string, @Body() dto: UpdateSchoolDto) {
    return this.schoolsService.update(id, dto);
  }

  @Put(':id/bank')
  @Roles(AdminRole.SUPER, AdminRole.TEAM, AdminRole.STUDENT_UNION)
  @ApiOperation({ summary: '绑定提现银行账户（学生会仅本校 / 团队任意）' })
  updateBank(
    @CurrentUser() admin: CurrentAdmin,
    @Param('id') id: string,
    @Body() dto: UpdateSchoolBankDto,
  ) {
    return this.schoolsService.updateBank(admin, id, dto);
  }
}

// AdPricingAdminController 已拆至 ad-pricing-admin.controller.ts（Step7：一文件一控制器）
