import { Test, TestingModule } from '@nestjs/testing';
import { MatchingService, MATCH_QUEUE } from '../matching.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfilesService } from '../../profiles/profiles.service';
import { MATCH_MODEL_PROVIDER } from '../providers/match-model.interface';
import { NotificationService } from '../../notifications/notification.service';
import { EnergyService } from '../../energy/energy.service';
import { MatchFeedbackService } from '../feedback/match-feedback.service';
import { getQueueToken } from '@nestjs/bull';
import { BadRequestException } from '@nestjs/common';

const mockPrisma: any = {
  matchConfig: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
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
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  userModeState: {
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  userMatchPreferences: { upsert: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  questionnaireVersion: { findFirst: jest.fn() },
  answer: { count: jest.fn() },
  notification: { create: jest.fn(), createMany: jest.fn() },
  systemConfig: { findUnique: jest.fn() },
  $transaction: jest.fn((arg: any) =>
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
  ),
};

const mockMatchModelProvider = { generateMatches: jest.fn() };
const mockQueue = { add: jest.fn().mockResolvedValue({}) };
const mockProfilesService = { getPublicProfile: jest.fn() };
const mockNotificationService = {
  createNotification: jest.fn(),
  createManyNotifications: jest.fn(),
};
const mockEnergyService = {
  getAvailableEnergy: jest.fn(),
  consumeInTx: jest.fn(),
  refund: jest.fn(),
};
const mockMatchFeedback = {
  logExposure: jest.fn().mockResolvedValue(undefined),
  logEvent: jest.fn().mockResolvedValue(undefined),
  ingestClientEvents: jest.fn(),
};

describe('MatchingService (dual-mode)', () => {
  let service: MatchingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProfilesService, useValue: mockProfilesService },
        { provide: MATCH_MODEL_PROVIDER, useValue: mockMatchModelProvider },
        { provide: getQueueToken(MATCH_QUEUE), useValue: mockQueue },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: EnergyService, useValue: mockEnergyService },
        { provide: MatchFeedbackService, useValue: mockMatchFeedback },
      ],
    }).compile();

    service = module.get<MatchingService>(MatchingService);
    jest.clearAllMocks();
  });

  describe('triggerMatchJob', () => {
    it('should create a romantic job and enqueue with mode', async () => {
      mockPrisma.matchJob.findFirst.mockResolvedValue(null);
      mockPrisma.matchJob.create.mockResolvedValue({ id: 'job_1', status: 'PENDING' });

      const result = await service.triggerMatchJob('manual:admin_1', 'romantic');

      expect(mockPrisma.matchJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ triggeredBy: 'manual:admin_1:romantic' }),
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        { jobId: 'job_1', mode: 'romantic' },
        expect.any(Object),
      );
      expect(result.status).toBe('PENDING');
    });

    it('should create a friend job tagged with friend mode', async () => {
      mockPrisma.matchJob.findFirst.mockResolvedValue(null);
      mockPrisma.matchJob.create.mockResolvedValue({ id: 'job_2', status: 'PENDING' });

      await service.triggerMatchJob('scheduler', 'friend');

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        { jobId: 'job_2', mode: 'friend' },
        expect.any(Object),
      );
    });

    it('should throw if a job is already running', async () => {
      mockPrisma.matchJob.findFirst.mockResolvedValue({ id: 'running', status: 'RUNNING' });
      await expect(service.triggerMatchJob('manual', 'romantic')).rejects.toThrow(BadRequestException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('executeMatchJob', () => {
    it('should complete with 0 matches when fewer than 2 candidates', async () => {
      mockPrisma.matchJob.findUnique.mockResolvedValue({ id: 'job_1', status: 'PENDING' });
      mockPrisma.matchJob.update.mockResolvedValue({});
      mockPrisma.questionnaireVersion.findFirst.mockResolvedValue({ id: 'v1' });
      mockPrisma.userModeState.findMany.mockResolvedValue([]); // 0 searching users

      await service.executeMatchJob('job_1', 'romantic');

      const calls = mockPrisma.matchJob.update.mock.calls;
      const last = calls[calls.length - 1];
      expect(last[0].data.status).toBe('COMPLETED');
      expect(last[0].data.totalMatched).toBe(0);
    });

    it('should create a MATCHED_ROMANTIC pair and set UMS=matched', async () => {
      mockPrisma.matchJob.findUnique.mockResolvedValue({ id: 'job_1', status: 'PENDING' });
      mockPrisma.matchJob.update.mockResolvedValue({});
      mockPrisma.questionnaireVersion.findFirst.mockResolvedValue({ id: 'v1' });
      mockPrisma.userModeState.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', profile: { gender: 'male', genderPref: 'female', age: 21, city: '北京', school: '北大', interests: [] }, matchPreferences: [], answers: [] },
        { id: 'u2', profile: { gender: 'female', genderPref: 'male', age: 20, city: '北京', school: '清华', interests: [] }, matchPreferences: [], answers: [] },
      ]);
      mockMatchModelProvider.generateMatches.mockResolvedValue({
        pairs: [{ userAId: 'u1', userBId: 'u2', score: 85, enhanced: false, metadata: {} }],
        unmatched: [],
        emptyPoolUserIds: [],
      });
      mockPrisma.match.findFirst.mockResolvedValue(null);
      mockPrisma.match.upsert.mockResolvedValue({ id: 'm1' });
      mockPrisma.userModeState.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });

      await service.executeMatchJob('job_1', 'romantic');

      expect(mockMatchModelProvider.generateMatches).toHaveBeenCalledTimes(1);
      // upsert（非 create）：避免同一对跨轮次重新匹配时触发 @@unique([userAId,userBId,mode]) 冲突
      expect(mockPrisma.match.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userAId_userBId_mode: { userAId: 'u1', userBId: 'u2', mode: 'ROMANTIC' },
          }),
          create: expect.objectContaining({
            status: 'MATCHED_ROMANTIC',
            mode: 'ROMANTIC',
            score: 85,
          }),
        }),
      );
      expect(mockPrisma.userModeState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ matchState: 'matched' }) }),
      );
    });

    it('should refund empty-pool enhanced users (friend mode)', async () => {
      mockPrisma.matchJob.findUnique.mockResolvedValue({ id: 'job_3', status: 'PENDING' });
      mockPrisma.matchJob.update.mockResolvedValue({});
      mockPrisma.questionnaireVersion.findFirst.mockResolvedValue({ id: 'vf' });
      mockPrisma.userModeState.findMany.mockResolvedValue([{ userId: 'f1' }, { userId: 'f2' }]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'f1', profile: { gender: 'male', genderPref: 'any', age: 22, city: 'A', school: 'S', interests: [] }, matchPreferences: [{ enhancedModeEnabled: true, friendEnhancedCells: 2 }], answers: [] },
        { id: 'f2', profile: { gender: 'female', genderPref: 'any', age: 22, city: 'A', school: 'S', interests: [] }, matchPreferences: [], answers: [] },
      ]);
      mockMatchModelProvider.generateMatches.mockResolvedValue({
        pairs: [],
        unmatched: ['f1', 'f2'],
        emptyPoolUserIds: [{ userId: 'f1', mode: 'friend', cost: 2 }],
      });
      mockPrisma.userModeState.updateMany.mockResolvedValue({ count: 2 });
      mockNotificationService.createManyNotifications.mockResolvedValue({ count: 2 });

      await service.executeMatchJob('job_3', 'friend');

      expect(mockEnergyService.refund).toHaveBeenCalledWith(
        'f1', 'friend', 2, null, '本轮无可配对象', 'empty_pool', 'job_3:f1',
      );
    });
  });

  describe('startMatchForUser', () => {
    it('should reject romantic re-match when already in relationship (B rule)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE' });
      mockPrisma.questionnaireVersion.findFirst.mockResolvedValue(null); // no active Q -> pass G
      mockPrisma.userModeState.upsert.mockResolvedValue({ matchState: 'relationship' });

      await expect(service.startMatchForUser('u1', 'romantic')).rejects.toThrow(BadRequestException);
    });
  });
});
