/* Interface outline: implementation bodies removed. */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(...);
  async createReport(userId: string, dto: CreateReportDto);
