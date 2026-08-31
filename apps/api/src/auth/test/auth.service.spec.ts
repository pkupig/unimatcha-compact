import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  profile: {
    findUnique: jest.fn(),
  },
  emailVerificationCode: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn(() => 'mock.jwt.token'),
};

const mockConfigService = {
  get: jest.fn((key: string, def?: any) => {
    const config: Record<string, any> = {
      JWT_SECRET: 'test_secret',
      JWT_EXPIRES_IN: '7d',
    };
    return config[key] ?? def;
  }),
};

// isConfigured / devFallbackAllowed 用普通属性模拟 getter；各用例按需翻转
const mockMailService = {
  isConfigured: false,
  devFallbackAllowed: true, // 测试态相当于非生产，允许 devCode 回退
  sendVerificationCode: jest.fn(),
};

/** 一条有效的注册验证码行（10 分钟内、零错误尝试） */
function validCodeRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'evc_1',
    email: 'test@test.com',
    purpose: 'register',
    code: '123456',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockMailService.isConfigured = false;
    mockMailService.devFallbackAllowed = true;
  });

  // ─── Register: send code ──────────────────────────────────
  describe('sendRegisterCode', () => {
    it('should throw ConflictException if email already registered', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u1' });

      await expect(service.sendRegisterCode('test@test.com')).rejects.toThrow(ConflictException);
      expect(mockPrismaService.emailVerificationCode.upsert).not.toHaveBeenCalled();
    });

    it('should enforce 60s resend cooldown (based on issue time, not updatedAt)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      // 刚签发 10 秒：expiresAt = now + 10min - 10s
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(
        validCodeRow({ expiresAt: new Date(Date.now() + 10 * 60 * 1000 - 10 * 1000) }),
      );

      await expect(service.sendRegisterCode('test@test.com')).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.emailVerificationCode.upsert).not.toHaveBeenCalled();
    });

    it('should allow resend after cooldown and reset attempts', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      // 签发已 2 分钟：expiresAt = now + 8min
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(
        validCodeRow({ expiresAt: new Date(Date.now() + 8 * 60 * 1000), attempts: 3 }),
      );
      mockPrismaService.emailVerificationCode.upsert.mockResolvedValue(validCodeRow());

      const res = await service.sendRegisterCode('test@test.com');

      const upsertArg = mockPrismaService.emailVerificationCode.upsert.mock.calls[0][0];
      expect(upsertArg.update.attempts).toBe(0);
      expect(res).toHaveProperty('devCode'); // 未配置 SMTP → 开发回退
    });

    it('should return devCode when mail is not configured', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.upsert.mockResolvedValue(validCodeRow());

      const res = await service.sendRegisterCode('Test@Test.com');

      expect(res.devCode).toMatch(/^\d{6}$/);
      expect(mockMailService.sendVerificationCode).not.toHaveBeenCalled();
      // 邮箱统一小写归一化
      const upsertArg = mockPrismaService.emailVerificationCode.upsert.mock.calls[0][0];
      expect(upsertArg.create.email).toBe('test@test.com');
    });

    it('should send real email and hide devCode when mail is configured', async () => {
      mockMailService.isConfigured = true;
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.upsert.mockResolvedValue(validCodeRow());
      mockMailService.sendVerificationCode.mockResolvedValue(undefined);

      const res = await service.sendRegisterCode('test@test.com');

      expect(mockMailService.sendVerificationCode).toHaveBeenCalledWith(
        'test@test.com',
        expect.stringMatching(/^\d{6}$/),
        'register',
      );
      expect(res).not.toHaveProperty('devCode');
    });

    it('should 503 (not leak devCode) in production when SMTP is unconfigured', async () => {
      mockMailService.isConfigured = false;
      mockMailService.devFallbackAllowed = false; // 生产：禁止 devCode 回退
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.upsert.mockResolvedValue(validCodeRow());

      await expect(service.sendRegisterCode('test@test.com')).rejects.toThrow(
        ServiceUnavailableException,
      );
      // 生成的码要清掉，别把未送达的码留在库里
      expect(mockPrismaService.emailVerificationCode.deleteMany).toHaveBeenCalled();
    });

    it('should clear the code row when email sending fails (no cooldown lock-out)', async () => {
      mockMailService.isConfigured = true;
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.upsert.mockResolvedValue(validCodeRow());
      mockMailService.sendVerificationCode.mockRejectedValue(
        new ServiceUnavailableException('smtp down'),
      );

      await expect(service.sendRegisterCode('test@test.com')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockPrismaService.emailVerificationCode.deleteMany).toHaveBeenCalledWith({
        where: { email: 'test@test.com', purpose: 'register' },
      });
    });
  });

  // ─── Register ─────────────────────────────────────────────
  describe('register', () => {
    it('should register a new user successfully with a valid code', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(validCodeRow());
      mockPrismaService.emailVerificationCode.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.emailVerificationCode.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user_1',
        email: 'test@test.com',
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      const result = await service.register({
        email: 'test@test.com',
        password: 'Password@123',
        code: '123456',
      });

      expect(result).toHaveProperty('token', 'mock.jwt.token');
      expect(result.user.email).toBe('test@test.com');
      expect(mockPrismaService.user.create).toHaveBeenCalledTimes(1);
      // 验证码一次性消费
      expect(mockPrismaService.emailVerificationCode.deleteMany).toHaveBeenCalledWith({
        where: { email: 'test@test.com', purpose: 'register' },
      });
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing_user',
        email: 'test@test.com',
      });

      await expect(
        service.register({ email: 'test@test.com', password: 'Password@123', code: '123456' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject when no code was requested', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(null);

      await expect(
        service.register({ email: 'test@test.com', password: 'Password@123', code: '123456' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('should reject an expired code', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(
        validCodeRow({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(
        service.register({ email: 'test@test.com', password: 'Password@123', code: '123456' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('should reject after too many incorrect attempts (atomic claim finds no slot)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(
        validCodeRow({ attempts: 5 }),
      );
      // 原子占位：attempts >= 上限 → 条件 UPDATE 落空
      mockPrismaService.emailVerificationCode.updateMany.mockResolvedValue({ count: 0 });

      // 即使这次码是对的，也已作废——否则爆破者第 6 次蒙对仍能进
      await expect(
        service.register({ email: 'test@test.com', password: 'Password@123', code: '123456' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
      // 占位条件必须带 attempts 上限过滤——防并发批量猜码全部放行的关键
      const claimArg = mockPrismaService.emailVerificationCode.updateMany.mock.calls[0][0];
      expect(claimArg.where.attempts).toEqual({ lt: 5 });
      expect(claimArg.data).toEqual({ attempts: { increment: 1 } });
    });

    it('should consume an attempt slot on a wrong code', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(validCodeRow());
      mockPrismaService.emailVerificationCode.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.register({ email: 'test@test.com', password: 'Password@123', code: '999999' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.emailVerificationCode.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: { increment: 1 } } }),
      );
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('should hash password before saving', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.emailVerificationCode.findUnique.mockResolvedValue(
        validCodeRow({ email: 'new@test.com' }),
      );
      mockPrismaService.emailVerificationCode.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.emailVerificationCode.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.user.create.mockImplementation(async ({ data }) => {
        // Verify password is hashed, not plain text
        expect(data.passwordHash).not.toBe('Password@123');
        expect(await bcrypt.compare('Password@123', data.passwordHash)).toBe(true);
        return { id: 'user_1', email: data.email, status: 'ACTIVE', createdAt: new Date() };
      });

      await service.register({ email: 'new@test.com', password: 'Password@123', code: '123456' });
    });
  });

  // ─── Login ────────────────────────────────────────────────
  describe('login', () => {
    it('should login successfully with correct credentials', async () => {
      const hashedPw = await bcrypt.hash('Password@123', 12);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@test.com',
        passwordHash: hashedPw,
        status: 'ACTIVE',
        mode: 'MATCH_MODE',
      });
      mockPrismaService.profile.findUnique.mockResolvedValue(null);

      const result = await service.login({
        email: 'test@test.com',
        password: 'Password@123',
      });

      expect(result).toHaveProperty('token', 'mock.jwt.token');
      expect(result.user.email).toBe('test@test.com');
    });

    it('should fall back to lowercase lookup when exact email misses', async () => {
      const hashedPw = await bcrypt.hash('Password@123', 12);
      mockPrismaService.user.findUnique.mockImplementation(async ({ where }) =>
        where.email === 'test@test.com'
          ? { id: 'user_1', email: 'test@test.com', passwordHash: hashedPw, status: 'ACTIVE' }
          : null,
      );
      mockPrismaService.profile.findUnique.mockResolvedValue(null);

      const result = await service.login({
        email: 'Test@Test.com',
        password: 'Password@123',
      });

      expect(result.user.email).toBe('test@test.com');
    });

    it('should throw UnauthorizedException with wrong password', async () => {
      const hashedPw = await bcrypt.hash('correctPassword', 12);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'test@test.com',
        passwordHash: hashedPw,
        status: 'ACTIVE',
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'wrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'notfound@test.com', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is banned', async () => {
      const hashedPw = await bcrypt.hash('Password@123', 12);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user_1',
        email: 'banned@test.com',
        passwordHash: hashedPw,
        status: 'BANNED',
      });

      await expect(
        service.login({ email: 'banned@test.com', password: 'Password@123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
