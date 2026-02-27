import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/profile.dto';

const REQUIRED_FIELDS = ['nickname', 'school', 'grade', 'gender', 'genderPref', 'age', 'city'];
const ALL_FIELDS = [...REQUIRED_FIELDS, 'interests', 'bio', 'avatarUrl'];

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
    const completeness = calcCompleteness(dto);

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
    if (!profile) throw new NotFoundException('资料尚未填写');
    return profile;
  }

  // Return only public fields for matched user display
  async getPublicProfile(userId: string) {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'public_profile_fields' },
    });
    const publicFields: string[] = (config?.value as string[]) || [
      'nickname', 'school', 'grade', 'age', 'city', 'interests', 'bio', 'avatarUrl',
    ];

    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) return null;

    const result: any = { userId };
    publicFields.forEach((field) => {
      result[field] = (profile as any)[field];
    });
    return result;
  }

  // Full public profile with social links (for relationship partners)
  async getFullPublicProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) return null;

    return {
      userId,
      nickname: profile.nickname,
      school: profile.school,
      grade: profile.grade,
      age: profile.age,
      city: profile.city,
      interests: profile.interests,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      socialLinks: profile.socialLinks,
      relationshipScore: profile.relationshipScore,
    };
  }
}
