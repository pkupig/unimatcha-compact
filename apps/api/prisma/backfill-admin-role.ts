/**
 * 幂等回填：旧世代超管行（isSuperAdmin=true 且 role 为空）补 role='SUPER'。
 *
 * 跑完后代码中仅剩 AdminScopeService.resolveActor 与 RolesGuard 两处
 * 防御性兜底仍认 isSuperAdmin，均为空操作。重复执行结果一致，可安全重跑。
 *
 * 运行（与 seed 同款方式）：
 *   开发：cd apps/api && npx ts-node prisma/backfill-admin-role.ts
 *   生产（编译产物）：node dist/prisma/backfill-admin-role.js
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const res = await prisma.adminUser.updateMany({
    where: { isSuperAdmin: true, role: null },
    data: { role: 'SUPER' },
  });
  console.log(`✅ role=SUPER backfilled on ${res.count} legacy admin rows`);
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
