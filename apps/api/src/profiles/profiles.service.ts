import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/profile.dto';

const REQUIRED_FIELDS = ['nickname', 'school', 'grade', 'gender', 'genderPref', 'age', 'city'];
const ALL_FIELDS = [
  ...REQUIRED_FIELDS,
  'interests', 'bio', 'avatarUrl', 'signature', 'tags',
  'major', 'mbti', 'nationality', 'zodiac',
];

function calcCompleteness(profile: any): number {
  const filled = ALL_FIELDS.filter((f) => {
    const v = profile[f];
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== undefined && v !== '';
  });
  return Math.round((filled.length / ALL_FIELDS.length) * 100);
}

@Injectable()
export class ProfilesService {
  constructor(private prisma: PrismaService) {}

  async upsertProfile(userId: string, dto: CreateProfileDto) {
    // 完整度基于「已存资料 + 本次 dto」合并后计算，避免部分编辑把完整度打低
    const existing = await this.prisma.profile.findUnique({ where: { userId } });
    const merged = { ...(existing || {}), ...(dto as any) };
    const completeness = calcCompleteness(merged);

    const { socialLinks, ...rest } = dto as any;
    const data: any = { ...rest, profileCompleteness: completeness };
    if (socialLinks !== undefined) {
      data.socialLinks = socialLinks;
    }

    const profile = await this.prisma.profile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    return profile;
  }

  async getMyProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile not completed');
    return profile;
  }

  // Return only public fields for matched user display
  async getPublicProfile(userId: string) {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'public_profile_fields' },
    });
    const publicFields: string[] = (config?.value as string[]) || ProfilesService.STRANGER_SAFE_FIELDS;

    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) return null;

    // 获取用户认证状态
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { verificationStatus: true },
    });

    const result: any = { userId, verificationStatus: user?.verificationStatus || 'unverified' };
    publicFields.forEach((field) => {
      result[field] = (profile as any)[field];
    });
    return result;
  }

  // 配置缺失时的兜底公开字段（fail-closed：不含封面 / 真实照片墙 / 真实姓名）
  private static readonly STRANGER_SAFE_FIELDS: string[] = [
    'nickname', 'school', 'grade', 'age', 'city', 'interests', 'bio',
    'avatarUrl', 'signature', 'tags',
    'major', 'mbti', 'nationality', 'zodiac',
  ];

  // Batch variant of getPublicProfile (avoids N+1 when resolving many partners at once).
  // Returns a Map<userId, publicProfile>; missing profiles are simply absent from the map.
  async getPublicProfilesByIds(userIds: string[]): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    const uniqueIds = Array.from(new Set(userIds));
    if (uniqueIds.length === 0) return result;

    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'public_profile_fields' },
    });
    const publicFields: string[] = (config?.value as string[]) || [
      'nickname', 'school', 'grade', 'age', 'city', 'interests', 'bio',
      'avatarUrl', 'signature', 'coverUrl', 'tags',
      'major', 'mbti', 'nationality', 'realPhotos', 'zodiac',
    ];

    const [profiles, users] = await Promise.all([
      this.prisma.profile.findMany({ where: { userId: { in: uniqueIds } } }),
      this.prisma.user.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, verificationStatus: true },
      }),
    ]);
    const verificationMap = new Map(users.map((u) => [u.id, u.verificationStatus]));

    for (const profile of profiles) {
      const entry: any = {
        userId: profile.userId,
        verificationStatus: verificationMap.get(profile.userId) || 'unverified',
      };
      publicFields.forEach((field) => {
        entry[field] = (profile as any)[field];
      });
      result.set(profile.userId, entry);
    }
    return result;
  }

  // Full public profile with social links (for relationship partners)
  async getFullPublicProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { verificationStatus: true },
    });

    return {
      userId,
      verificationStatus: user?.verificationStatus || 'unverified',
      nickname: profile.nickname,
      realName: profile.realName,
      school: profile.school,
      grade: profile.grade,
      age: profile.age,
      city: profile.city,
      interests: profile.interests,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      socialLinks: profile.socialLinks,
      relationshipScore: profile.relationshipScore,
      signature: profile.signature,
      coverUrl: profile.coverUrl,
      tags: profile.tags,
      major: profile.major,
      mbti: profile.mbti,
      nationality: profile.nationality,
      realPhotos: profile.realPhotos,
      zodiac: profile.zodiac,
    };
  }
}
