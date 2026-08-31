/**
 * 搜索索引保障脚本（幂等，每次启动可跑）。
 *
 * 为什么是独立脚本而不是 Prisma schema：
 * pg_trgm 扩展与 GIN 表达式索引无法用 Prisma schema 声明，因此**有意留在
 * schema/迁移之外**，由本脚本幂等维护（2026-08-31 起启动链走 `prisma migrate deploy`，
 * 它只执行迁移 SQL、不会动这些计划外索引；这批索引也别写进迁移文件，保持单一归属）。
 *
 * 为什么是 pg_trgm 而不是 tsvector 全文检索：
 * 广场内容中英混排，Postgres 内置 FTS 对中文不分词（'simple' 配置会把整句当一个 token），
 * 要中文分词得装 zhparser/pg_jieba 扩展，生产镜像成本高。
 * pg_trgm 按三元组做子串匹配，对中英文一视同仁，且能给 ILIKE '%x%' 加索引
 * （btree 对前后通配的 LIKE 完全无效，这正是现有 ILIKE 搜索全表扫的原因）。
 *
 * 注意：CREATE INDEX 未加 CONCURRENTLY——启动时表还小，短暂写锁可接受；
 * 且 CONCURRENTLY 不能在事务里跑，失败还会留下 INVALID 索引，启动脚本里更麻烦。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 每条都是幂等 DDL（IF NOT EXISTS），可重复执行
const STATEMENTS: { label: string; sql: string }[] = [
  {
    label: 'extension pg_trgm',
    sql: `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  },
  // ── 广场搜索：标题/正文子串匹配 ──
  {
    label: 'idx_square_posts_title_trgm',
    sql: `CREATE INDEX IF NOT EXISTS idx_square_posts_title_trgm
          ON square_posts USING gin (title gin_trgm_ops)`,
  },
  {
    label: 'idx_square_posts_content_trgm',
    sql: `CREATE INDEX IF NOT EXISTS idx_square_posts_content_trgm
          ON square_posts USING gin (content gin_trgm_ops)`,
  },
  // 标签是 text[]，走 GIN 数组包含（tags @> ARRAY['x']）而非 trgm
  {
    label: 'idx_square_posts_tags',
    sql: `CREATE INDEX IF NOT EXISTS idx_square_posts_tags
          ON square_posts USING gin (tags)`,
  },
  // 评论正文检索（P1-9）：命中评论时回主帖并附命中片段
  {
    label: 'idx_square_post_comments_content_trgm',
    sql: `CREATE INDEX IF NOT EXISTS idx_square_post_comments_content_trgm
          ON square_post_comments USING gin (content gin_trgm_ops)`,
  },
  // ── 联系人搜索：昵称/学校/专业/城市 ──
  {
    label: 'idx_profiles_nickname_trgm',
    sql: `CREATE INDEX IF NOT EXISTS idx_profiles_nickname_trgm
          ON profiles USING gin (nickname gin_trgm_ops)`,
  },
  {
    label: 'idx_profiles_school_trgm',
    sql: `CREATE INDEX IF NOT EXISTS idx_profiles_school_trgm
          ON profiles USING gin (school gin_trgm_ops)`,
  },
  {
    label: 'idx_profiles_major_trgm',
    sql: `CREATE INDEX IF NOT EXISTS idx_profiles_major_trgm
          ON profiles USING gin (major gin_trgm_ops)`,
  },
  {
    label: 'idx_profiles_city_trgm',
    sql: `CREATE INDEX IF NOT EXISTS idx_profiles_city_trgm
          ON profiles USING gin (city gin_trgm_ops)`,
  },
  // 「猜你认识」按学校/年级/专业召回候选，这三列组合是热路径
  {
    label: 'idx_profiles_school_grade',
    sql: `CREATE INDEX IF NOT EXISTS idx_profiles_school_grade
          ON profiles (school, grade)`,
  },
  {
    label: 'idx_profiles_interests',
    sql: `CREATE INDEX IF NOT EXISTS idx_profiles_interests
          ON profiles USING gin (interests)`,
  },
  {
    label: 'idx_profiles_tags',
    sql: `CREATE INDEX IF NOT EXISTS idx_profiles_tags
          ON profiles USING gin (tags)`,
  },
];

async function main() {
  let ok = 0;
  let failed = 0;
  for (const { label, sql } of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      ok++;
      console.log(`[search-indexes] OK   ${label}`);
    } catch (e: any) {
      failed++;
      // 不抛：缺 pg_trgm 权限（如托管库未开放扩展）时，搜索退化为无索引 ILIKE，
      // 功能仍可用，不该因此阻断 API 启动。
      console.warn(`[search-indexes] FAIL ${label}: ${e?.message || e}`);
    }
  }
  console.log(`[search-indexes] done: ${ok} ok, ${failed} failed`);
}

main()
  .catch((e) => {
    console.warn('[search-indexes] aborted:', e?.message || e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
