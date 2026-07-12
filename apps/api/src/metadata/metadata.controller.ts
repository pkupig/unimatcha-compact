import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MetadataService } from './metadata.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('元数据')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get('uk/cities')
  @ApiOperation({ summary: '获取英国城市列表' })
  getUkCities() {
    return { items: this.metadataService.getUkCities() };
  }

  @Get('uk/universities')
  @ApiOperation({ summary: '获取英国大学列表' })
  getUkUniversities() {
    return { items: this.metadataService.getUkUniversities() };
  }

  @Get('uk/majors')
  @ApiOperation({ summary: '获取专业列表' })
  getUkMajors() {
    return { items: this.metadataService.getUkMajors() };
  }

  @Get('mbti-types')
  @ApiOperation({ summary: '获取 MBTI 类型列表' })
  getMbtiTypes() {
    return { items: this.metadataService.getMbtiTypes() };
  }

  @Get('nationalities')
  @ApiOperation({ summary: '获取国籍列表' })
  getNationalities() {
    return { items: this.metadataService.getCommonNationalities() };
  }
}
