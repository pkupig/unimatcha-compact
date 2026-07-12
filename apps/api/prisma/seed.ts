import { PrismaClient, QuestionType, QuestionnaireType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── 50 道灵魂匹配问卷题目（五级量表，1=非常不同意/完全不喜欢，5=非常同意/非常喜欢）────
const SOUL_QUESTIONS = [
  // ─── A. 生活习惯（1-10，权重15%）───────────────────────────────
  { order: 1,  group: '生活习惯', title: '我习惯在凌晨12点以后睡觉，即使第二天有早课或工作' },
  { order: 2,  group: '生活习惯', title: '我愿意花时间把住所收拾得整洁有序，容忍不了长期乱糟糟的环境' },
  { order: 3,  group: '生活习惯', title: '我每周至少进行3次运动（跑步、健身、球类等），并把它视为生活必需' },
  { order: 4,  group: '生活习惯', title: '相比点外卖，我更倾向于自己做饭或跟另一半一起下厨' },
  { order: 5,  group: '生活习惯', title: '我的周末通常是与朋友出去社交，而不是宅在家休息' },
  { order: 6,  group: '生活习惯', title: '我喜欢早起，即使是假期也不愿睡到10点以后' },
  { order: 7,  group: '生活习惯', title: '我会为了追剧、打游戏或刷手机熬夜，哪怕知道第二天会很累' },
  { order: 8,  group: '生活习惯', title: '我认为共同生活中家务应由双方平等分担，不接受一方完全负责' },
  { order: 9,  group: '生活习惯', title: '我愿意在忙碌的平日里抽时间照顾生病或情绪低落的另一半' },
  { order: 10, group: '生活习惯', title: '我喜欢定期整理和断舍离，不囤积没用的物品，追求简洁生活' },

  // ─── B. 价值观与人生目标（11-20，权重20%）──────────────────────
  { order: 11, group: '价值观', title: '我认为职业成就感和事业发展比陪伴家人更值得优先追求' },
  { order: 12, group: '价值观', title: '我希望将来能在一座固定的城市长期定居，不愿频繁搬迁换城市' },
  { order: 13, group: '价值观', title: '出国留学或工作是我人生规划中非常重要的一部分，我会为此认真努力' },
  { order: 14, group: '价值观', title: '我把30岁之前完成婚姻作为自己重要的人生目标之一' },
  { order: 15, group: '价值观', title: '我相信只要足够努力和坚持，大多数人都能实现自己想要的生活' },
  { order: 16, group: '价值观', title: '我认为精神上的契合和共同成长比物质条件更能决定一段关系是否幸福' },
  { order: 17, group: '价值观', title: '我愿意为了另一半的发展机会，改变自己原本的城市或职业规划' },
  { order: 18, group: '价值观', title: '某种宗教信仰、哲学思想或特定价值体系在我的日常生活中扮演重要角色' },
  { order: 19, group: '价值观', title: '我认为一个人的成长背景和原生家庭会深刻影响其性格与价值观，很难改变' },
  { order: 20, group: '价值观', title: '我希望另一半在职业方向、定居城市等重大人生规划上与我高度契合' },

  // ─── C. 恋爱关系观（21-30，权重25%）────────────────────────────
  { order: 21, group: '恋爱观', title: '我需要另一半每天主动与我保持联系，长时间不回消息会让我感到不安' },
  { order: 22, group: '恋爱观', title: '我认为恋爱中两个人各自保持独立的社交圈是健康且必要的' },
  { order: 23, group: '恋爱观', title: '我会介意另一半与前任仍然保持较为密切的朋友关系' },
  { order: 24, group: '恋爱观', title: '我希望一段认真的恋爱关系能在1-2年内进入明确的婚姻轨道' },
  { order: 25, group: '恋爱观', title: '我认为出轨是感情中最不可原谅的行为，即使有任何理由也无法接受' },
  { order: 26, group: '恋爱观', title: '我相信只要两个人真心努力，异地恋也可以长期维持下去' },
  { order: 27, group: '恋爱观', title: '在恋爱关系中，我倾向于主动表达关心和付出，而不是等待对方先迈出第一步' },
  { order: 28, group: '恋爱观', title: '我认为冷战是一种处理感情矛盾的正常方式，偶尔冷静一下没有问题' },
  { order: 29, group: '恋爱观', title: '我希望另一半能够真正融入并接受我的家人和闺蜜/兄弟圈子' },
  { order: 30, group: '恋爱观', title: '我认为情侣之间彼此保留私人手机空间是基本信任，不应相互翻看' },

  // ─── D. 沟通与情感表达（31-40，权重20%）────────────────────────
  { order: 31, group: '沟通', title: '在陌生社交场合，我往往需要一段时间才能真正放松下来，不太擅长主动破冰' },
  { order: 32, group: '沟通', title: '比起当面直接说，我更习惯用文字（短信/聊天）来表达深层的情感和想法' },
  { order: 33, group: '沟通', title: '我觉得和亲密的人安静地坐在一起、什么都不说，也是一种温暖的亲密感' },
  { order: 34, group: '沟通', title: '我会主动对在意的人说"我爱你"或类似话语，不觉得肉麻或别扭' },
  { order: 35, group: '沟通', title: '遇到矛盾时，我倾向于立刻正面沟通来解决，而不是选择暂时回避冷静后再谈' },
  { order: 36, group: '沟通', title: '我经常在朋友圈或社交媒体上分享自己的生活状态，不介意被他人看见' },
  { order: 37, group: '沟通', title: '即使我和另一半在某个重要观点上持续存在分歧，我认为关系也可以继续好好维持' },
  { order: 38, group: '沟通', title: '在朋友聚会或小组场合中，我通常是发言活跃、带动气氛的那一个' },
  { order: 39, group: '沟通', title: '我认为在亲密关系中，双方都有权利拒绝分享某些事或保有部分内心世界' },
  { order: 40, group: '沟通', title: '面对另一半的批评或反馈，我能做到认真倾听并反思，而不是本能地辩解' },

  // ─── E. 财务观与未来规划（41-50，权重20%）──────────────────────
  { order: 41, group: '财务观', title: '我认为恋爱或婚姻中双方各付各的（AA制）比一方完全承担更公平合理' },
  { order: 42, group: '财务观', title: '如果另一半为了追求梦想暂时经济困难，我愿意提供力所能及的经济支持' },
  { order: 43, group: '财务观', title: '我认为在结婚之前买好房子是必要条件，否则我不会同意进入婚姻' },
  { order: 44, group: '财务观', title: '我更倾向于把收入用于享受当下的生活体验，而不是大量储蓄或投资未来' },
  { order: 45, group: '财务观', title: '我认为伴侣的原生家庭经济背景在选择结婚对象时是不可忽视的重要参考' },
  { order: 46, group: '财务观', title: '我计划婚后继续坚持全职工作，不愿意成为完全依赖另一半的全职主妇/主夫' },
  { order: 47, group: '财务观', title: '我觉得两个人在消费观和金钱态度上必须基本一致，否则感情很难长久维系' },
  { order: 48, group: '财务观', title: '对于家庭的长期财务规划（储蓄、投资、保险等），我认为双方应共同参与决策' },
  { order: 49, group: '财务观', title: '我认为婚前对双方财产进行公证或明确财务边界是理性且负责任的做法' },
  { order: 50, group: '财务观', title: '当恋爱双方收入差距较大时，收入高的一方应自然承担更多共同花销' },
];

// ─── 25 道校园朋友匹配问卷题目（五级量表，1=完全不同意，5=完全同意，§5.3）────
const FRIEND_QUESTIONS = [
  // ─── 社交风格 social（权重 15%，order 1-5）───────────────────
  { order: 1, group: '社交风格', title: '我更享受和少数几个挚友深交，而不是认识很多泛泛之交' },
  { order: 2, group: '社交风格', title: '朋友间发生分歧时，我倾向于直接说出来而不是憋在心里' },
  { order: 3, group: '社交风格', title: '我希望朋友能长期稳定地保持联系，而不是聚一阵就淡了' },
  { order: 4, group: '社交风格', title: '我乐于主动张罗聚会、组织大家一起出去玩' },
  { order: 5, group: '社交风格', title: '即使很久没联系，我也认为真正的朋友重逢时依然能无话不谈' },

  // ─── 兴趣活动 interest（权重 25%，order 6-10）─────────────────
  { order: 6, group: '兴趣活动', title: '我希望和朋友有比较一致的兴趣爱好，这样相处更有话题' },
  { order: 7, group: '兴趣活动', title: '我喜欢和朋友一起进行户外/运动类活动（爬山、球类、骑行等）' },
  { order: 8, group: '兴趣活动', title: '我喜欢和朋友一起钻研某项技能或爱好（游戏、乐器、编程、摄影等）' },
  { order: 9, group: '兴趣活动', title: '我愿意经常和朋友相约线下见面，而不只是线上聊天' },
  { order: 10, group: '兴趣活动', title: '我喜欢和朋友一起探索新事物（新店、新展览、新活动），而非总去老地方' },

  // ─── 人格节奏 personality（权重 20%，order 11-15）──────────────
  { order: 11, group: '人格节奏', title: '我的生活节奏偏快，喜欢把日程排得比较满' },
  { order: 12, group: '人格节奏', title: '在群体里我通常是比较外向、主动带动气氛的那一个' },
  { order: 13, group: '人格节奏', title: '我很看重朋友的靠谱程度：答应的事一定会做到' },
  { order: 14, group: '人格节奏', title: '朋友临时改变计划或迟到时，我能比较从容地接受' },
  { order: 15, group: '人格节奏', title: '我喜欢和情绪稳定、不容易内耗的人做朋友' },

  // ─── 价值观 values（权重 20%，order 16-20）────────────────────
  { order: 16, group: '价值观', title: '我更看重和朋友三观一致，胜过单纯玩得来' },
  { order: 17, group: '价值观', title: '当人情和原则冲突时，我倾向于坚持原则' },
  { order: 18, group: '价值观', title: '我无法接受朋友在背后议论或评判我' },
  { order: 19, group: '价值观', title: '我认为朋友之间应当坦诚，不喜欢拐弯抹角或留心眼' },
  { order: 20, group: '价值观', title: '我愿意在朋友需要时认真倾听并提供实际帮助，而不只是说漂亮话' },

  // ─── 生活规划 lifestage（权重 20%，order 21-25）───────────────
  { order: 21, group: '生活规划', title: '我目前正处于学业/事业的关键冲刺阶段，时间比较紧张' },
  { order: 22, group: '生活规划', title: '我未来几年会长期待在同一座城市，不太会频繁搬迁' },
  { order: 23, group: '生活规划', title: '我希望朋友和我处在相近的人生阶段，更容易互相理解' },
  { order: 24, group: '生活规划', title: '未来三年我会把主要精力投入在自我提升上（考研/考证/技能）' },
  { order: 25, group: '生活规划', title: '我愿意结识不同专业/不同背景的朋友来拓展视野' },
];

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Admin User ───────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@campuslove.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    // 旧账号补齐 role（新代码以 role 为准，isSuperAdmin 仅兼容）
    update: { role: 'SUPER', isActive: true },
    create: {
      email: adminEmail,
      passwordHash,
      name: '超级管理员',
      role: 'SUPER',
      isActive: true,
      isSuperAdmin: true,
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);

  // ─── Default Match Config（每周五下午5点） ─────────────────
  await prisma.matchConfig.upsert({
    where: { id: 'default-match-config' },
    update: {
      cronExpr: '0 17 * * 5',
      description: '每周五下午17:00执行匹配（北京时间）',
      isEnabled: true,
    },
    create: {
      id: 'default-match-config',
      cronExpr: '0 17 * * 5',
      description: '每周五下午17:00执行匹配（北京时间）',
      isEnabled: true,
      timezone: 'Asia/Shanghai',
    },
  });
  console.log('✅ Match config set to every Friday 17:00');

  // ─── System Configs ───────────────────────────────────────
  await prisma.systemConfig.upsert({
    where: { key: 'public_profile_fields' },
    // coverUrl/tags 纳入公开字段，让匹配卡/朋友卡能拿到封面与标签（本轮反馈3b）。update 同步老库。
    update: {
      value: ['nickname', 'school', 'grade', 'age', 'city', 'interests', 'bio', 'avatarUrl', 'coverUrl', 'tags'],
    },
    create: {
      key: 'public_profile_fields',
      value: ['nickname', 'school', 'grade', 'age', 'city', 'interests', 'bio', 'avatarUrl', 'coverUrl', 'tags'],
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

  // 匹配质量阈值
  await prisma.systemConfig.upsert({
    where: { key: 'match_score_threshold' },
    update: { value: 75 },
    create: { key: 'match_score_threshold', value: 75 },
  });

  // 广告计价全局默认值（ADMIN-REDESIGN §3）：学校无覆盖值时采用。
  // update:{} —— 已存在则保留团队后台调过的值，不被 seed 重置
  await prisma.systemConfig.upsert({
    where: { key: 'ad_pricing_defaults' },
    update: {},
    create: {
      key: 'ad_pricing_defaults',
      value: { buyoutDailyPriceCents: 20000, cpmPriceCents: 5000, cpcPriceCents: 200 },
    },
  });
  console.log('✅ System configs created');

  // ─── AdminUser.schoolId 迁移（ADMIN-REDESIGN §2）─────────────
  // 旧数据 schoolId 存学校名字符串，现改为 School.id：
  // 对每个学生会账号，schoolId 不是现存 School.id 时视为学校名 → 按名 upsert School 并回填 id
  const unionAdmins = await prisma.adminUser.findMany({
    where: { role: 'STUDENT_UNION', schoolId: { not: null } },
    select: { id: true, email: true, schoolId: true },
  });
  for (const ua of unionAdmins) {
    const sid = ua.schoolId as string;
    const byId = await prisma.school.findUnique({ where: { id: sid } });
    if (byId) continue; // 已是 School.id，无需迁移
    const school = await prisma.school.upsert({
      where: { name: sid },
      update: {},
      create: { name: sid },
    });
    await prisma.adminUser.update({ where: { id: ua.id }, data: { schoolId: school.id } });
    console.log(`✅ Migrated union admin ${ua.email}: schoolId "${sid}" → School.id ${school.id}`);
  }

  // ─── 灵魂匹配问卷 V2（50道题） ───────────────────────────
  const existingV2 = await prisma.questionnaireVersion.findFirst({ where: { version: 2 } });
  if (!existingV2) {
    // 先将 V1 设为非活跃（如果存在）
    await prisma.questionnaireVersion.updateMany({
      where: { version: 1 },
      data: { isActive: false },
    });

    const questionnaire = await prisma.questionnaireVersion.create({
      data: {
        version: 2,
        type: QuestionnaireType.ROMANTIC,
        title: '大学生长期恋爱匹配问卷 V2（灵魂版）',
        description:
          '以下50道题将帮助我们深入了解你的价值观、生活方式和恋爱期望。' +
          '每道题请根据你的真实想法选择同意程度（1=完全不同意，5=完全同意）。' +
          '答题越真实，匹配越精准。',
        isActive: true,
        publishedAt: new Date(),
        questions: {
          create: SOUL_QUESTIONS.map((q) => ({
            type: QuestionType.SCALE,
            title: q.title,
            isRequired: true,
            isEnabled: true,
            order: q.order,
            group: q.group,
          })),
        },
      },
    });
    console.log(`✅ Questionnaire V${questionnaire.version} created with ${SOUL_QUESTIONS.length} questions`);
  } else {
    console.log('ℹ️  Questionnaire V2 already exists, skipping');
  }

  // ─── 校园朋友匹配问卷 V1（25道题，FRIEND） ───────────────
  const existingFriend = await prisma.questionnaireVersion.findFirst({
    where: { type: QuestionnaireType.FRIEND, isActive: true },
  });
  if (!existingFriend) {
    // version 全局唯一，取当前最大版本号 +1
    const latest = await prisma.questionnaireVersion.findFirst({ orderBy: { version: 'desc' } });
    const friendQuestionnaire = await prisma.questionnaireVersion.create({
      data: {
        version: (latest?.version ?? 0) + 1,
        type: QuestionnaireType.FRIEND,
        title: '校园朋友匹配问卷 V1',
        description:
          '以下25道题帮助我们了解你的社交风格与兴趣，找到合拍的朋友。' +
          '1=完全不同意，5=完全同意。',
        isActive: true,
        publishedAt: new Date(),
        questions: {
          create: FRIEND_QUESTIONS.map((q) => ({
            type: QuestionType.SCALE,
            title: q.title,
            isRequired: true,
            isEnabled: true,
            order: q.order,
            group: q.group,
          })),
        },
      },
    });
    console.log(`✅ Friend questionnaire V${friendQuestionnaire.version} created with ${FRIEND_QUESTIONS.length} questions`);
  } else {
    console.log('ℹ️  Friend questionnaire already exists, skipping');
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
