import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionnaireType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAnswersDto } from './dto/answer.dto';

@Injectable()
export class AnswersService {
  constructor(private prisma: PrismaService) {}

  async submitAnswers(userId: string, dto: SubmitAnswersDto) {
    // Validate questionnaire version exists and is active
    const version = await this.prisma.questionnaireVersion.findUnique({
      where: { id: dto.questionnaireVersionId },
      include: {
        questions: {
          where: { isEnabled: true, isRequired: true },
        },
      },
    });
    if (!version) throw new NotFoundException('Questionnaire version not found');
    if (!version.isActive) throw new BadRequestException('This questionnaire version no longer accepts submissions, please use the latest version');

    // Validate required questions answered.
    // 必答题不仅要「提交了对应行」，其值还须非空：null / '' / 空白串 / 空数组都视为未作答，
    // 否则前端只要带上空值的 questionId 就能绕过必答校验（§5.1）。
    const isEmptyAnswer = (v: any): boolean => {
      if (v === null || v === undefined) return true;
      if (typeof v === 'string') return v.trim() === '';
      if (Array.isArray(v)) return v.length === 0 || v.every((x) => isEmptyAnswer(x));
      return false;
    };
    const answeredValues = new Map(dto.answers.map((a) => [a.questionId, a.value]));
    const missingRequired = version.questions.filter(
      (q) => !answeredValues.has(q.id) || isEmptyAnswer(answeredValues.get(q.id)),
    );
    if (missingRequired.length > 0) {
      throw new BadRequestException(`The following required questions are not answered: ${missingRequired.map((q) => q.title).join(', ')}`);
    }
    const answeredIds = dto.answers.map((a) => a.questionId);

    // 防跨版本污染：拒绝不属于该问卷版本的 questionId。否则可把「朋友问卷的题」
    // 提交到「恋爱版本 ID」下，buildCandidates 按版本拉答案评分时会把外来题算进去，污染匹配分。
    const versionQuestionIds = new Set(
      (
        await this.prisma.question.findMany({
          where: { questionnaireId: dto.questionnaireVersionId },
          select: { id: true },
        })
      ).map((q) => q.id),
    );
    const foreignIds = answeredIds.filter((id) => !versionQuestionIds.has(id));
    if (foreignIds.length > 0) {
      throw new BadRequestException('Submission contains questions that do not belong to this questionnaire version');
    }

    // Upsert all answers (support re-submission for same version)
    const upsertOps = dto.answers.map((answer) =>
      this.prisma.answer.upsert({
        where: {
          userId_questionnaireVersionId_questionId: {
            userId,
            questionnaireVersionId: dto.questionnaireVersionId,
            questionId: answer.questionId,
          },
        },
        update: { value: answer.value },
        create: {
          userId,
          questionnaireVersionId: dto.questionnaireVersionId,
          questionId: answer.questionId,
          value: answer.value,
        },
      }),
    );

    const saved = await Promise.all(upsertOps);
    return {
      message: 'Questionnaire submitted successfully',
      answeredCount: saved.length,
      questionnaireVersion: version.version,
    };
  }

  // type 过滤通过关联 questionnaireVersion.type 实现（隐含模式区分）；
  // 仍兼容按 questionnaireVersionId 精确过滤。
  async getMyAnswers(
    userId: string,
    questionnaireVersionId?: string,
    type?: QuestionnaireType,
  ) {
    const where: Prisma.AnswerWhereInput = { userId };
    if (questionnaireVersionId) where.questionnaireVersionId = questionnaireVersionId;
    if (type) where.questionnaireVersion = { type };

    return this.prisma.answer.findMany({
      where,
      include: {
        question: { select: { title: true, type: true } },
        questionnaireVersion: { select: { version: true, title: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async hasSubmittedCurrentVersion(userId: string): Promise<boolean> {
    const activeVersion = await this.prisma.questionnaireVersion.findFirst({
      where: { isActive: true },
    });
    if (!activeVersion) return false;

    const count = await this.prisma.answer.count({
      where: { userId, questionnaireVersionId: activeVersion.id },
    });
    return count > 0;
  }
}
