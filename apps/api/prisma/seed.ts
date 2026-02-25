import { PrismaClient, QuestionType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Admin User ───────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@campuslove.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: '超级管理员',
      isSuperAdmin: true,
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);

  // ─── Default Match Config ─────────────────────────────────
  await prisma.matchConfig.upsert({
    where: { id: 'default-match-config' },
    update: {},
    create: {
      id: 'default-match-config',
      cronExpr: '0 20 * * 3',
      description: '每周三晚上20:00执行匹配',
      isEnabled: false,
      timezone: 'Asia/Shanghai',
    },
  });
  console.log('✅ Default match config created');

  // ─── System Configs ───────────────────────────────────────
  await prisma.systemConfig.upsert({
    where: { key: 'public_profile_fields' },
    update: {},
    create: {
      key: 'public_profile_fields',
      value: ['nickname', 'school', 'grade', 'age', 'city', 'interests', 'bio', 'avatarUrl'],
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'profile_required_fields' },
    update: {},
    create: {
      key: 'profile_required_fields',
      value: ['nickname', 'school', 'grade', 'gender', 'genderPref', 'age', 'city'],
    },
  });
  console.log('✅ System configs created');

  // ─── Initial Questionnaire ────────────────────────────────
  const existing = await prisma.questionnaireVersion.findFirst({ where: { version: 1 } });
  if (!existing) {
    const questionnaire = await prisma.questionnaireVersion.create({
      data: {
        version: 1,
        title: '校园恋爱匹配问卷 V1',
        description: '帮助我们了解你，找到最适合你的那个人',
        isActive: true,
        publishedAt: new Date(),
        questions: {
          create: [
            {
              type: QuestionType.SINGLE_CHOICE,
              title: '你通常是哪种类型的人？',
              isRequired: true,
              order: 1,
              group: '性格',
              options: {
                create: [
                  { label: '内向型（喜欢独处，安静）', value: 'introvert', order: 1 },
                  { label: '外向型（喜欢社交，活跃）', value: 'extrovert', order: 2 },
                  { label: '中间型（两者均可）', value: 'ambivert', order: 3 },
                ],
              },
            },
            {
              type: QuestionType.SCALE,
              title: '你对恋爱关系中"独立空间"的重视程度？（1=非常不重视，5=非常重视）',
              isRequired: true,
              order: 2,
              group: '恋爱观',
            },
            {
              type: QuestionType.MULTIPLE_CHOICE,
              title: '你希望未来伴侣拥有哪些特质？（多选）',
              isRequired: true,
              order: 3,
              group: '期待',
              options: {
                create: [
                  { label: '幽默感', value: 'humor', order: 1 },
                  { label: '上进心', value: 'ambitious', order: 2 },
                  { label: '温柔体贴', value: 'gentle', order: 3 },
                  { label: '独立自主', value: 'independent', order: 4 },
                  { label: '兴趣相投', value: 'common_interests', order: 5 },
                  { label: '颜值高', value: 'attractive', order: 6 },
                ],
              },
            },
            {
              type: QuestionType.SCALE,
              title: '你在恋爱中会主动表达爱意的频率？（1=很少，5=经常）',
              isRequired: true,
              order: 4,
              group: '恋爱观',
            },
            {
              type: QuestionType.SINGLE_CHOICE,
              title: '你偏好的约会方式是？',
              isRequired: true,
              order: 5,
              group: '生活方式',
              options: {
                create: [
                  { label: '户外探险（徒步、露营等）', value: 'outdoor', order: 1 },
                  { label: '文艺活动（展览、音乐会等）', value: 'cultural', order: 2 },
                  { label: '宅家娱乐（游戏、电影等）', value: 'indoor', order: 3 },
                  { label: '美食探店', value: 'food', order: 4 },
                  { label: '都可以随缘', value: 'flexible', order: 5 },
                ],
              },
            },
            {
              type: QuestionType.TEXT,
              title: '用三个词描述你理想中的感情状态',
              isRequired: false,
              order: 6,
              group: '其他',
            },
          ],
        },
      },
    });
    console.log(`✅ Questionnaire V${questionnaire.version} created with questions`);
  } else {
    console.log('ℹ️  Questionnaire already exists, skipping');
  }

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
