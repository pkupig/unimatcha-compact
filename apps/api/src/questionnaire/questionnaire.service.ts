import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionnaireVersionDto, CreateQuestionDto, UpdateQuestionDto } from './dto/questionnaire.dto';

@Injectable()
export class QuestionnaireService {
  constructor(private prisma: PrismaService) {}

  // ─── User-facing ─────────────────────────────────────────
  async getActiveQuestionnaire() {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isActive: true },
      include: {
        questions: {
          where: { isEnabled: true },
          orderBy: { order: 'asc' },
          include: {
            options: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!version) throw new NotFoundException('暂无可用问卷');
    return version;
  }

  // ─── Admin CRUD ───────────────────────────────────────────
  async listVersions() {
    return this.prisma.questionnaireVersion.findMany({
      orderBy: { version: 'desc' },
      include: { _count: { select: { questions: true, answers: true } } },
    });
  }

  async getVersion(id: string) {
    const version = await this.prisma.questionnaireVersion.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { options: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!version) throw new NotFoundException('问卷版本不存在');
    return version;
  }

  async createVersion(dto: CreateQuestionnaireVersionDto) {
    // Auto-increment version number
    const latest = await this.prisma.questionnaireVersion.findFirst({
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version || 0) + 1;

    return this.prisma.questionnaireVersion.create({
      data: {
        version: nextVersion,
        title: dto.title,
        description: dto.description,
        questions: dto.questions
          ? {
              create: dto.questions.map((q) => ({
                type: q.type,
                title: q.title,
                description: q.description,
                isRequired: q.isRequired ?? true,
                isEnabled: q.isEnabled ?? true,
                order: q.order ?? 0,
                group: q.group,
                options: q.options
                  ? { create: q.options }
                  : undefined,
              })),
            }
          : undefined,
      },
      include: {
        questions: { include: { options: true } },
      },
    });
  }

  async publishVersion(id: string) {
    const version = await this.getVersion(id);

    // Deactivate all others
    await this.prisma.questionnaireVersion.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    return this.prisma.questionnaireVersion.update({
      where: { id },
      data: { isActive: true, publishedAt: new Date() },
    });
  }

  async addQuestion(versionId: string, dto: CreateQuestionDto) {
    const version = await this.prisma.questionnaireVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('问卷版本不存在');

    const maxOrder = await this.prisma.question.aggregate({
      where: { questionnaireId: versionId },
      _max: { order: true },
    });

    return this.prisma.question.create({
      data: {
        questionnaireId: versionId,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        isRequired: dto.isRequired ?? true,
        isEnabled: dto.isEnabled ?? true,
        order: dto.order ?? (maxOrder._max.order || 0) + 1,
        group: dto.group,
        options: dto.options ? { create: dto.options } : undefined,
      },
      include: { options: true },
    });
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto) {
    const existing = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!existing) throw new NotFoundException('题目不存在');

    // Delete old options and recreate
    if (dto.options !== undefined) {
      await this.prisma.questionOption.deleteMany({ where: { questionId } });
    }

    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description,
        isRequired: dto.isRequired,
        isEnabled: dto.isEnabled,
        order: dto.order,
        group: dto.group,
        options: dto.options ? { create: dto.options } : undefined,
      },
      include: { options: true },
    });
  }

  async deleteQuestion(questionId: string) {
    return this.prisma.question.delete({ where: { id: questionId } });
  }

  async reorderQuestions(versionId: string, questionIds: string[]) {
    const updates = questionIds.map((id, index) =>
      this.prisma.question.update({
        where: { id, questionnaireId: versionId },
        data: { order: index + 1 },
      }),
    );
    return Promise.all(updates);
  }

  async toggleQuestion(questionId: string, isEnabled: boolean) {
    return this.prisma.question.update({
      where: { id: questionId },
      data: { isEnabled },
    });
  }
}
