import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/auth.dto';

@Injectable()
export class AdminAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: AdminLoginDto) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    if (!admin) throw new UnauthorizedException('Incorrect account or password');

    const valid = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Incorrect account or password');

    if (!admin.isActive) throw new UnauthorizedException('This account has been disabled');

    const token = this.jwtService.sign(
      { sub: admin.id, email: admin.email, role: 'admin' },
      {
        secret: this.config.get('ADMIN_JWT_SECRET'),
        expiresIn: this.config.get('ADMIN_JWT_EXPIRES_IN', '8h'),
      },
    );

    // schoolId 现为 School.id（ADMIN-REDESIGN §2）：登录时解析学校名，
    // 学生会带 schoolName，自拉商家带 sourcedBySchoolName，前端免二次查询
    const schoolIds = [admin.schoolId, admin.sourcedBySchoolId].filter(
      (v): v is string => !!v,
    );
    const schools = schoolIds.length
      ? await this.prisma.school.findMany({
          where: { id: { in: schoolIds } },
          select: { id: true, name: true },
        })
      : [];
    const schoolNameOf = (id: string | null) =>
      schools.find((s) => s.id === id)?.name ?? null;

    return {
      // 后管角色体系（§8.1.3）：登录返回 role/schoolId/organizationName，前端据此控制发帖范围
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        schoolId: admin.schoolId,
        schoolName: schoolNameOf(admin.schoolId),
        organizationName: admin.organizationName,
        // SPONSOR 来源（ADMIN-REDESIGN §1）：null=平台直签，非空=学生会自拉
        sourcedBySchoolId: admin.sourcedBySchoolId,
        sourcedBySchoolName: schoolNameOf(admin.sourcedBySchoolId),
        contactName: admin.contactName,
        contactPhone: admin.contactPhone,
        isActive: admin.isActive,
        isSuperAdmin: admin.isSuperAdmin, // 兼容旧字段
      },
      token,
    };
  }

  async validateAdmin(id: string) {
    // 选出 role/schoolId/sourcedBySchoolId 供 admin-jwt 策略写入 req.user，
    // 服务层据此做范围校验（学生会仅本校、商家仅自身，ADMIN-REDESIGN §1）
    return this.prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        schoolId: true,
        organizationName: true,
        sourcedBySchoolId: true,
        contactName: true,
        contactPhone: true,
        isActive: true,
        isSuperAdmin: true,
      },
    });
  }
}
