import { Test, TestingModule } from '@nestjs/testing';
import { QuestionnaireService } from '../questionnaire.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { QuestionType, QuestionnaireType } from '@prisma/client';

const mockPrisma: any = {
  questionnaireVersion: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
  },
  question: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
  },
  questionOption: {
    deleteMany: jest.fn(),
  },
  // publishVersion 现在用事务原子化下线旧 active + 上线本版本
  $transaction: jest.fn((arg: any) =>
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
  ),
};

describe('QuestionnaireService', () => {
  let service: QuestionnaireService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionnaireService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<QuestionnaireService>(QuestionnaireService);
    jest.clearAllMocks();
  });

  describe('getActiveQuestionnaire', () => {
    it('should return active questionnaire with questions', async () => {
      const mockVersion = {
        id: 'v1', version: 1, title: 'Test Q', isActive: true,
        questions: [
          { id: 'q1', title: 'Q1', type: QuestionType.SINGLE_CHOICE, options: [] },
        ],
      };
      mockPrisma.questionnaireVersion.findFirst.mockResolvedValue(mockVersion);

      const result = await service.getActiveQuestionnaire();
      expect(result.version).toBe(1);
      expect(result.questions).toHaveLength(1);
    });

    it('should throw NotFoundException if no active questionnaire', async () => {
      mockPrisma.questionnaireVersion.findFirst.mockResolvedValue(null);
      await expect(service.getActiveQuestionnaire()).rejects.toThrow(NotFoundException);
    });
  });

  describe('createVersion', () => {
    it('should create new questionnaire version with auto-incremented version number', async () => {
      mockPrisma.questionnaireVersion.findFirst.mockResolvedValue({ version: 2 });
      mockPrisma.questionnaireVersion.create.mockResolvedValue({
        id: 'new_v', version: 3, title: 'New Version',
        questions: [],
      });

      const result = await service.createVersion({ type: QuestionnaireType.ROMANTIC, title: 'New Version' });
      expect(result.version).toBe(3);

      const createCall = mockPrisma.questionnaireVersion.create.mock.calls[0][0];
      expect(createCall.data.version).toBe(3);
    });

    it('should start at version 1 if no existing versions', async () => {
      mockPrisma.questionnaireVersion.findFirst.mockResolvedValue(null);
      mockPrisma.questionnaireVersion.create.mockResolvedValue({
        id: 'v1', version: 1, title: 'First', questions: [],
      });

      await service.createVersion({ type: QuestionnaireType.ROMANTIC, title: 'First' });
      const createCall = mockPrisma.questionnaireVersion.create.mock.calls[0][0];
      expect(createCall.data.version).toBe(1);
    });
  });

  describe('publishVersion', () => {
    it('should deactivate other active versions of the same type and activate the target (atomically)', async () => {
      mockPrisma.questionnaireVersion.findUnique.mockResolvedValue({
        id: 'v2', version: 2, title: 'V2', type: QuestionnaireType.ROMANTIC,
      });
      mockPrisma.questionnaireVersion.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.questionnaireVersion.update.mockResolvedValue({
        id: 'v2', isActive: true, publishedAt: new Date(),
      });

      await service.publishVersion('v2');

      // 在事务内执行（G 规则：每 type ≤ 1 active）
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      // 仅下线同 type 的其它 active（排除本版本），不影响其它 type
      expect(mockPrisma.questionnaireVersion.updateMany).toHaveBeenCalledWith({
        where: { isActive: true, type: QuestionnaireType.ROMANTIC, id: { not: 'v2' } },
        data: { isActive: false },
      });
      expect(mockPrisma.questionnaireVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'v2' }, data: { isActive: true, publishedAt: expect.any(Date) } }),
      );
    });

    it('should throw NotFoundException if the version does not exist', async () => {
      mockPrisma.questionnaireVersion.findUnique.mockResolvedValue(null);
      await expect(service.publishVersion('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
