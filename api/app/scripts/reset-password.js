/**
 * 测试账号密码重置 / 列出账号工具
 *
 * 用法（在 API 容器内运行，自动复用容器里的 Prisma + bcrypt + DATABASE_URL）：
 *
 *   列出所有用户邮箱：
 *     node reset-password.js
 *
 *   重置某个用户的密码：
 *     node reset-password.js <email> <new-password>
 *   例：
 *     node reset-password.js test@demo.com Test@123456
 *
 * 见 README 或对话中的“运行方式”说明，把本文件 docker cp 进容器后执行即可。
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const [, , email, newPassword] = process.argv;

  // 无参数 → 列出所有账号，方便找回是哪一个
  if (!email) {
    const users = await prisma.user.findMany({
      select: {
        email: true,
        status: true,
        createdAt: true,
        profile: { select: { nickname: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (users.length === 0) {
      console.log('（数据库里还没有任何用户，请先在 H5 注册一个）');
      return;
    }
    console.log(`共 ${users.length} 个用户：\n`);
    for (const u of users) {
      const name = u.profile?.nickname ? ` · ${u.profile.nickname}` : '';
      console.log(`  ${u.email}${name}   [${u.status}]   注册于 ${u.createdAt.toISOString().slice(0, 10)}`);
    }
    console.log('\n重置密码：node reset-password.js <上面的邮箱> <新密码>');
    return;
  }

  // 有参数 → 重置密码
  if (!newPassword) {
    console.error('❌ 缺少新密码。用法：node reset-password.js <email> <new-password>');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`❌ 找不到邮箱为 ${email} 的用户。先运行不带参数的命令列出所有邮箱。`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12); // 与 auth.service 一致（12 轮）
  await prisma.user.update({ where: { email }, data: { passwordHash } });
  console.log(`✅ 已重置：${email}`);
  console.log(`   新密码：${newPassword}`);
  console.log('   现在可以用这组邮箱 + 密码在 H5 登录了。');
}

main()
  .catch((e) => {
    console.error('出错：', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
