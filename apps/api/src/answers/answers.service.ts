import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
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
    if (!version) throw new NotFoundException('问卷版本不存在');
    if (!version.isActive) throw new BadRequestException('该版本问卷已不再接受提交，请使用最新版本');

    // Validate required questions answered
    const answeredIds = dto.answers.map((a) => a.questionId);
    const missingRequired = version.questions.filter((q) => !answeredIds.includes(q.id));
    if (missingRequired.length > 0) {
      throw new BadRequestException(`以下必答题未填写: ${missingRequired.map((q) => q.title).join('、')}`);
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
      message: '问卷提交成功',
      answeredCount: saved.length,
      questionnaireVersion: version.version,
    };
  }

  async getMyAnswers(userId: string, questionnaireVersionId?: string) {
    const where: any = { userId };
    if (questionnaireVersionId) where.questionnaireVersionId = questionnaireVersionId;

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
