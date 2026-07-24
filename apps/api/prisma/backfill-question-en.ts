/**
 * 幂等回填：为数据库中已存在的问卷题目补英文题面 titleEn。
 *
 * 映射来源：直接复用 seed.ts 导出的题库数组（title → titleEn 单一数据源，
 * seed.ts 的 main() 有 require.main 守卫，import 不会触发 seeding）。
 * 按 title 精确匹配 updateMany，重复执行结果一致（幂等），可安全重跑。
 *
 * 运行（与 seed 同款方式）：
 *   开发：cd apps/api && npx ts-node prisma/backfill-question-en.ts
 *   生产（编译产物）：node dist/prisma/backfill-question-en.js
 */
import { PrismaClient } from '@prisma/client';
import { SOUL_QUESTIONS, FRIEND_QUESTIONS } from './seed';

const prisma = new PrismaClient();

async function main() {
  const entries = [...SOUL_QUESTIONS, ...FRIEND_QUESTIONS];
  let updatedRows = 0;
  const notFound: string[] = [];

  for (const q of entries) {
    const res = await prisma.question.updateMany({
      where: { title: q.title },
      data: { titleEn: q.titleEn },
    });
    if (res.count === 0) notFound.push(q.title);
    updatedRows += res.count;
  }

  console.log(`✅ titleEn backfill done: ${updatedRows} question rows updated (${entries.length} titles in mapping)`);
  if (notFound.length > 0) {
    console.log(`ℹ️  ${notFound.length} titles not present in DB (skipped):`);
    for (const t of notFound) console.log(`   - ${t}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
