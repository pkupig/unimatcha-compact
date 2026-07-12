import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async createReport(userId: string, dto: CreateReportDto) {
    const report = await this.prisma.report.create({
      data: {
        userId,
        category: dto.category,
        content: dto.content,
        contact: dto.contact,
      },
      select: { id: true },
    });
    return { id: report.id, message: 'Report submitted. Thank you for your feedback.' };
  }
}
