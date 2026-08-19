/* Interface outline: implementation bodies removed. */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MetadataService } from './metadata.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('metadata')
export class MetadataController {
  constructor(...);
@Get('uk/cities')
  getUkCities();
@Get('uk/universities')
  getUkUniversities();
@Get('uk/majors')
  getUkMajors();
@Get('mbti-types')
  getMbtiTypes();
@Get('nationalities')
  getNationalities();
