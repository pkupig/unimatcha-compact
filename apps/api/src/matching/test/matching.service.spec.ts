import { Test, TestingModule } from '@nestjs/testing';
import { MatchingService, MATCH_QUEUE } from '../matching.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfilesService } from '../../profiles/profiles.service';
import { MATCH_MODEL_PROVIDER } from '../providers/match-model.interface';
import { getQueueToken } from '@nestjs/bull';
import { BadRequestException } from '@nestjs/common';

const mockPrisma = {
  matchConfig: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  matchJob: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  match: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  questionnaireVersion: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};

const mockMatchModelProvider = {
  generateMatches: jest.fn(),
};

const mockQueue = {
  add: jest.fn().mockResolvedValue({}),
};

const mockProfilesService = {
  getPublicProfile: jest.fn(),
};

describe('MatchingService', () => {
  let service: MatchingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProfilesService, useValue: mockProfilesService },
        { provide: MATCH_MODEL_PROVIDER, useValue: mockMatchModelProvider },
        { provide: getQueueToken(MATCH_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<MatchingService>(MatchingService);
    jest.clearAllMocks();
  });

  describe('triggerMatchJob', () => {
    it('should create a match job and enqueue it', async () => {
      mockPrisma.matchJob.findFirst.mockResolvedValue(null); // no running job
      mockPrisma.matchJob.create.mockResolvedValue({ id: 'job_1', status: 'PENDING' });

      const result = await service.triggerMatchJob('manual:admin_1');

      expect(mockPrisma.matchJob.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ triggeredBy: 'manual:admin_1' }) }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        { jobId: 'job_1' },
        expect.any(Object),
      );
      expect(result.status).toBe('PENDING');
    });

    it('should throw BadRequestException if a job is already running', async () => {
      mockPrisma.matchJob.findFirst.mockResolvedValue({ id: 'running_job', status: 'RUNNING' });

      await expect(service.triggerMatchJob('manual')).rejects.toThrow(BadRequestException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('executeMatchJob', () => {
    it('should complete job with 0 matches when fewer than 2 candidates', async () => {
      mockPrisma.matchJob.update.mockResolvedValue({});
      mockPrisma.questionnaireVersion.findFirst.mockResolvedValue({ id: 'v1' });
      mockPrisma.user.findMany.mockResolvedValue([]); // 0 candidates

      await service.executeMatchJob('job_1');

      const lastUpdate = mockPrisma.matchJob.update.mock.calls[mockPrisma.matchJob.update.mock.calls.length - 1];
      expect(lastUpdate[0].data.status).toBe('COMPLETED');
      expect(lastUpdate[0].data.totalMatched).toBe(0);
    });

    it('should call AI provider and save match results', async () => {
      mockPrisma.matchJob.update.mockResolvedValue({});
      mockPrisma.questionnaireVersion.findFirst.mockResolvedValue({ id: 'v1' });
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', profile: { gender: 'male', genderPref: 'female', age: 21, city: '北京', school: '北大', interests: [] }, answers: [] },
        { id: 'u2', profile: { gender: 'female', genderPref: 'male', age: 20, city: '北京', school: '清华', interests: [] }, answers: [] },
      ]);

      mockMatchModelProvider.generateMatches.mockResolvedValue({
        pairs: [{ userAId: 'u1', userBId: 'u2', score: 85, metadata: {} }],
        unmatched: [],
      });

      mockPrisma.match.findFirst.mockResolvedValue(null); // not previously matched
      mockPrisma.match.create.mockResolvedValue({});
      mockPrisma.user.updateMany.mockResolvedValue({});

      await service.executeMatchJob('job_1');

      expect(mockMatchModelProvider.generateMatches).toHaveBeenCalledTimes(1);
      expect(mockPrisma.match.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { mode: 'RELATIONSHIP_MODE' } }),
      );
    });
  });
});
