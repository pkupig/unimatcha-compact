import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  profile: {
    findUnique: jest.fn(),
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

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ─── Register ─────────────────────────────────────────────
  describe('register', () => {
    it('should register a new user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user_1',
        email: 'test@test.com',
        mode: 'MATCH_MODE',
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      const result = await service.register({
        email: 'test@test.com',
        password: 'Password@123',
      });

      expect(result).toHaveProperty('token', 'mock.jwt.token');
      expect(result.user.email).toBe('test@test.com');
      expect(mockPrismaService.user.create).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing_user',
        email: 'test@test.com',
      });

      await expect(
        service.register({ email: 'test@test.com', password: 'Password@123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should hash password before saving', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockImplementation(async ({ data }) => {
        // Verify password is hashed, not plain text
        expect(data.passwordHash).not.toBe('Password@123');
        expect(await bcrypt.compare('Password@123', data.passwordHash)).toBe(true);
        return { id: 'user_1', email: data.email, mode: 'MATCH_MODE', status: 'ACTIVE', createdAt: new Date() };
      });

      await service.register({ email: 'new@test.com', password: 'Password@123' });
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
