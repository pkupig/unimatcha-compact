import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { QuestionnaireType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionnaireVersionDto, CreateQuestionDto, UpdateQuestionDto } from './dto/questionnaire.dto';

@Injectable()
export class QuestionnaireService {
  constructor(private prisma: PrismaService) {}

  // ─── User-facing ─────────────────────────────────────────
  // 按 type 取当前激活问卷（每 type 至多一个 active），默认 ROMANTIC。
  async getActiveQuestionnaire(type: QuestionnaireType = QuestionnaireType.ROMANTIC) {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { isActive: true, type },
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
    if (!version) throw new NotFoundException('No questionnaire available');
    return version;
  }

  // 两类问卷完成度：用于 G 规则判断能否进入对应模式匹配（§5.1/§5.2）。
  // 返回 { romantic: {completed, versionId?}, friend: {completed, versionId?} }
  async getCompletion(userId: string) {
    const out: Record<string, { completed: boolean; versionId?: string }> = {};
    for (const type of [QuestionnaireType.ROMANTIC, QuestionnaireType.FRIEND]) {
      const version = await this.prisma.questionnaireVersion.findFirst({
        where: { isActive: true, type },
        include: {
          questions: {
            where: { isEnabled: true, isRequired: true },
            select: { id: true },
          },
        },
      });
      const key = type.toLowerCase();
      if (!version) { out[key] = { completed: false }; continue; }
      const requiredIds = version.questions.map((q) => q.id);
      const answered = await this.prisma.answer.count({
        where: {
          userId,
          questionnaireVersionId: version.id,
          questionId: { in: requiredIds },
        },
      });
      out[key] = { completed: answered >= requiredIds.length, versionId: version.id };
    }
    return out;
  }

  // ─── Admin CRUD ───────────────────────────────────────────
  // type 透传：传入则只列该 type，不传列全部。
  async listVersions(type?: QuestionnaireType) {
    // 非分页列表统一 { items }（管理端契约，见 common/utils/pagination.ts）
    return {
      items: await this.prisma.questionnaireVersion.findMany({
        where: type ? { type } : {},
        orderBy: { version: 'desc' },
        include: { _count: { select: { questions: true, answers: true } } },
      }),
    };
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
    // version 仍全局自增（@unique），但版本线按 type 区分
    const latest = await this.prisma.questionnaireVersion.findFirst({
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version || 0) + 1;

    return this.prisma.questionnaireVersion.create({
      data: {
        version: nextVersion,
        type: dto.type,
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
                // 问卷 v2 元数据（不传走列默认：similar/soft/1/self）
                code: q.code,
                semantics: q.semantics ?? undefined,
                hardness: q.hardness ?? undefined,
                weight: q.weight ?? undefined,
                target: q.target ?? undefined,
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
    // G 规则（每 type ≤ 1 active）：下线同 type 其它 active 与上线本版本须在
    // 同一事务内原子执行，避免并发发布两个版本时同时存在多个 active。
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.questionnaireVersion.findUnique({ where: { id } });
      if (!version) throw new NotFoundException('问卷版本不存在');

      // type-scoped 下线：把同 type 的其它 active 置 false（排除本版本）
      await tx.questionnaireVersion.updateMany({
        where: { isActive: true, type: version.type, id: { not: id } },
        data: { isActive: false },
      });

      return tx.questionnaireVersion.update({
        where: { id },
        data: { isActive: true, publishedAt: new Date() },
      });
    });
  }

  async addQuestion(versionId: string, dto: CreateQuestionDto) {
    const version = await this.prisma.questionnaireVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('问卷版本不存在');
    // 已发布（active）版本的题目不可原地增删改：用户答案锚定该版本，改题会让历史答案与题面错位。
    // 须新建版本再修改（§5.1）。
    if (version.isActive) {
      throw new BadRequestException('已发布版本的题目不可修改，请新建版本');
    }

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
        code: dto.code,
        semantics: dto.semantics ?? undefined,
        hardness: dto.hardness ?? undefined,
        weight: dto.weight ?? undefined,
        target: dto.target ?? undefined,
        options: dto.options ? { create: dto.options } : undefined,
      },
      include: { options: true },
    });
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto) {
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { questionnaire: { select: { isActive: true } } },
    });
    if (!existing) throw new NotFoundException('题目不存在');
    // 已发布（active）版本的题目不可原地修改（§5.1）
    if (existing.questionnaire?.isActive) {
      throw new BadRequestException('已发布版本的题目不可修改，请新建版本');
    }

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
        code: dto.code,
        semantics: dto.semantics,
        hardness: dto.hardness,
        weight: dto.weight,
        target: dto.target,
        options: dto.options ? { create: dto.options } : undefined,
      },
      include: { options: true },
    });
  }

  async deleteQuestion(questionId: string) {
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { questionnaire: { select: { isActive: true } } },
    });
    if (!existing) throw new NotFoundException('题目不存在');
    // 已发布（active）版本的题目不可删除（§5.1）
    if (existing.questionnaire?.isActive) {
      throw new BadRequestException('已发布版本的题目不可修改，请新建版本');
    }
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
