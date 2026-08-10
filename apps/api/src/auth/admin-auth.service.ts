import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminUser } from '@prisma/client';
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

    if (!admin) throw new UnauthorizedException('账号或密码错误');

    const valid = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('账号或密码错误');

    if (!admin.isActive) throw new UnauthorizedException('该账号已被停用');

    return this.issueFor(admin);
  }

  /**
   * 为给定管理员行签发 token + 塑形返回。
   * login 与邀请码自注册「注册即登录」（B5，POST /admin/auth/register-sponsor）共用；
   * 不做任何凭据/状态校验——调用方须自行保证该行有登录资格。
   */
  async issueFor(admin: AdminUser) {
    const token = this.jwtService.sign(
      { sub: admin.id, email: admin.email, role: 'admin' },
      {
        secret: this.config.get('ADMIN_JWT_SECRET'),
        expiresIn: this.config.get('ADMIN_JWT_EXPIRES_IN', '8h'),
      },
    );

    return { admin: await this.shapeAdminMe(admin), token };
  }

  /** GET /admin/auth/me：每次从库重读——前端不再长期信任本地缓存的身份信息 */
  async getMe(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw new UnauthorizedException('管理员账号不存在');
    if (!admin.isActive) throw new UnauthorizedException('该账号已被停用');
    return this.shapeAdminMe(admin);
  }

  /**
   * login 与 /me 共用的响应塑形。
   * schoolId 现为 School.id（ADMIN-REDESIGN §2）：解析学校名，学生会带 schoolName、
   * 自拉商家带 sourcedBySchoolName，前端免二次查询。
   */
  private async shapeAdminMe(admin: AdminUser) {
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
      // 后管角色体系（§8.1.3）：role/schoolId/organizationName 供前端控制导航与发帖范围
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
    };
  }

  async validateAdmin(id: string) {
    // 选出 role/schoolId/sourcedBySchoolId 供 admin-jwt 策略解析 AdminActor 写入 req.user，
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
