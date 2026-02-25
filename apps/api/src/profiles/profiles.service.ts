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

    const profile = await this.prisma.profile.upsert({
      where: { userId },
      update: { ...dto, profileCompleteness: completeness },
      create: { userId, ...dto, profileCompleteness: completeness },
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

    const result: any = {};
    publicFields.forEach((field) => {
      result[field] = (profile as any)[field];
    });
    return result;
  }
}
