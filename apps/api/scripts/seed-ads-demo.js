/**
 * 广告商业化演示数据（ADMIN-REDESIGN §4 seed 更新）：
 *   - 3 所学校：University of Warwick（预绑银行账户）/ UCL / University of Manchester
 *   - 3 个学生会账号（密码 Union@123456）+ 3 个商家账号（密码 Sponsor@123456，
 *     其中"一点点奶茶·考文垂"为 Warwick 学生会自拉，其余平台直签）
 *   - 各状态 campaign：ACTIVE BUYOUT（3 校）、ACTIVE CPM（Warwick+UCL）、
 *     PENDING_UNION_REVIEW CPC（Warwick 自拉）、DRAFT CPC、COMPLETED+已结算 BUYOUT（含 AD_SHARE 入账）
 *   - 财务：SPONSOR_GRANT 500 元入账 + 1 笔 PENDING 提现（200 元，带银行卡快照）
 * 幂等：学校/账号按唯一键 upsert；campaign 仅在演示商家名下尚无 campaign 时创建；
 *       赞助入账/提现按存在性检查跳过。可重复运行。
 * 本地运行： cd apps/api && node scripts/seed-ads-demo.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

const UNION_PASSWORD = 'Union@123456';
const SPONSOR_PASSWORD = 'Sponsor@123456';

// 计价（与 SystemConfig ad_pricing_defaults 一致，单位：分）
const BUYOUT_DAILY = 20000; // 包断 200 元/天/校
const CPM_PRICE = 5000; // 50 元 / 千次曝光
const CPC_PRICE = 200; // 2 元 / 点击

const DAY = 24 * 3600 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysAhead = (n) => new Date(Date.now() + n * DAY);
// AdDailyStat.date 为 @db.Date：取当天 UTC 零点，保证 [campaignId, schoolId, date] 唯一键稳定
const dateOnly = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

// 提交时锁定的各校单价快照（ADMIN-REDESIGN §3）
const snapshotFor = (schoolIds) =>
  Object.fromEntries(
    schoolIds.map((id) => [id, { buyoutDaily: BUYOUT_DAILY, cpm: CPM_PRICE, cpc: CPC_PRICE }]),
  );

// 内置渐变占位图（data-URI SVG，与 seed-square-demo 同款：不依赖外部图床）
const svgPlaceholder = (seed, w, h) => {
  let hash = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const hue2 = (hue + 40) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},70%,72%)'/><stop offset='1' stop-color='hsl(${hue2},65%,55%)'/></linearGradient></defs><rect width='100%' height='100%' fill='url(%23g)'/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29');
};
const IMG = (s) => svgPlaceholder('ad' + s, 640, 480);

async function main() {
  // ─── 学校（按 name 唯一键 upsert；Warwick 预绑银行账户）──────────
  console.log('创建学校...');
  const warwick = await prisma.school.upsert({
    where: { name: 'University of Warwick' },
    update: {
      city: 'Coventry',
      bankAccountName: 'Warwick CSSA',
      bankName: 'HSBC',
      bankAccountNo: '12345678',
    },
    create: {
      name: 'University of Warwick',
      city: 'Coventry',
      bankAccountName: 'Warwick CSSA',
      bankName: 'HSBC',
      bankAccountNo: '12345678',
    },
  });
  const ucl = await prisma.school.upsert({
    where: { name: 'University College London' },
    update: { city: 'London' },
    create: { name: 'University College London', city: 'London' },
  });
  const manchester = await prisma.school.upsert({
    where: { name: 'University of Manchester' },
    update: { city: 'Manchester' },
    create: { name: 'University of Manchester', city: 'Manchester' },
  });

  // ─── 学生会账号（schoolId = School.id）────────────────────────
  console.log('创建学生会账号...');
  const unionHash = await bcrypt.hash(UNION_PASSWORD, 12);
  const unionDefs = [
    { email: 'union.warwick@unimatcha.com', name: '华威学生会', school: warwick },
    { email: 'union.ucl@unimatcha.com', name: 'UCL 学生会', school: ucl },
    { email: 'union.manchester@unimatcha.com', name: '曼大学生会', school: manchester },
  ];
  const unions = {};
  for (const u of unionDefs) {
    unions[u.email] = await prisma.adminUser.upsert({
      where: { email: u.email },
      update: { role: 'STUDENT_UNION', schoolId: u.school.id, isActive: true },
      create: {
        email: u.email,
        passwordHash: unionHash,
        name: u.name,
        role: 'STUDENT_UNION',
        schoolId: u.school.id,
        isActive: true,
      },
    });
  }
  const unionWarwick = unions['union.warwick@unimatcha.com'];

  // ─── 商家账号（sourcedBySchoolId：null=平台直签 / Warwick=学生会自拉）──
  console.log('创建商家账号...');
  const sponsorHash = await bcrypt.hash(SPONSOR_PASSWORD, 12);
  const starbucks = await prisma.adminUser.upsert({
    where: { email: 'sponsor.starbucks@unimatcha.com' },
    update: { role: 'SPONSOR', organizationName: '星巴克校园', sourcedBySchoolId: null, isActive: true },
    create: {
      email: 'sponsor.starbucks@unimatcha.com',
      passwordHash: sponsorHash,
      name: '星巴克校园',
      role: 'SPONSOR',
      organizationName: '星巴克校园',
      isActive: true,
    },
  });
  const hsbc = await prisma.adminUser.upsert({
    where: { email: 'sponsor.hsbc@unimatcha.com' },
    update: { role: 'SPONSOR', organizationName: 'HSBC UK', sourcedBySchoolId: null, isActive: true },
    create: {
      email: 'sponsor.hsbc@unimatcha.com',
      passwordHash: sponsorHash,
      name: 'HSBC UK',
      role: 'SPONSOR',
      organizationName: 'HSBC UK',
      isActive: true,
    },
  });
  const milktea = await prisma.adminUser.upsert({
    where: { email: 'sponsor.milktea@unimatcha.com' },
    update: {
      role: 'SPONSOR',
      organizationName: '一点点奶茶·考文垂',
      sourcedBySchoolId: warwick.id,
      isActive: true,
    },
    create: {
      email: 'sponsor.milktea@unimatcha.com',
      passwordHash: sponsorHash,
      name: '一点点奶茶·考文垂',
      role: 'SPONSOR',
      organizationName: '一点点奶茶·考文垂',
      sourcedBySchoolId: warwick.id,
      isActive: true,
    },
  });

  // 平台审核/确认收款人：取任一 SUPER（seed.ts 创建的超管），无则留空
  const superAdmin = await prisma.adminUser.findFirst({
    where: { role: 'SUPER', isActive: true },
    select: { id: true },
  });
  const confirmerId = superAdmin ? superAdmin.id : null;

  // ─── Campaigns（仅当演示商家名下尚无 campaign 时创建，幂等）──────
  const existingCampaigns = await prisma.adCampaign.count({
    where: { advertiserId: { in: [starbucks.id, hsbc.id, milktea.id] } },
  });
  if (existingCampaigns > 0) {
    console.log(`ℹ️ 演示商家已有 ${existingCampaigns} 个 campaign，跳过创建`);
  } else {
    console.log('创建 campaign（各状态）...');

    // (a) Starbucks BUYOUT × 3 校，ACTIVE（3 天前开始，4 天后结束，按 7 天计价已付款）
    const buyoutDays = 7;
    const buyoutPerSchool = buyoutDays * BUYOUT_DAILY; // 140000 = 1400 元/校
    const buyoutTotal = buyoutPerSchool * 3; // 420000 = 4200 元
    const campA = await prisma.adCampaign.create({
      data: {
        advertiserId: starbucks.id,
        title: '星巴克校园咖啡季',
        content: '凭 UniMatcha 学生认证到店出示本卡片，第二杯半价。活动覆盖全部门店，月底截止。',
        images: [IMG(101)],
        landingUrl: 'https://www.starbucks.co.uk',
        pricingModel: 'BUYOUT',
        status: 'ACTIVE',
        startDate: daysAgo(3),
        endDate: daysAhead(4),
        budgetCents: null,
        totalPriceCents: buyoutTotal,
        spendCents: buyoutTotal, // BUYOUT 激活即 spend = totalPrice（ADMIN-REDESIGN §3）
        priceSnapshot: snapshotFor([warwick.id, ucl.id, manchester.id]),
        sourcedBySchoolId: null,
        platformReviewedByAdminId: confirmerId,
        paymentConfirmedByAdminId: confirmerId,
        paymentNote: '线下对公转账已确认（演示数据）',
        paidAt: daysAgo(4),
        placements: {
          create: [warwick, ucl, manchester].map((s) => ({
            schoolId: s.id,
            buyoutPriceCents: buyoutPerSchool,
          })),
        },
      },
    });
    // 过去 3 天 × 3 校日报：曝光 400-900、点击 20-60、spend = buyoutPrice/7 均摊
    const dailyShare = Math.round(buyoutPerSchool / buyoutDays); // 20000
    const statsA = [];
    for (let d = 1; d <= 3; d++) {
      for (const s of [warwick, ucl, manchester]) {
        statsA.push({
          campaignId: campA.id,
          schoolId: s.id,
          date: dateOnly(daysAgo(d)),
          impressions: rnd(400, 900),
          clicks: rnd(20, 60),
          spendCents: dailyShare,
        });
      }
    }
    await prisma.adDailyStat.createMany({ data: statsA, skipDuplicates: true });

    // (b) HSBC CPM 预算 1500 元，ACTIVE，Warwick + UCL，3 天日报（spend = floor(imps×cpm/1000)）
    const campB = await prisma.adCampaign.create({
      data: {
        advertiserId: hsbc.id,
        title: 'HSBC 学生账户开户礼',
        content: '新生开立 HSBC 学生账户即享 100 镑开户礼金与免费国际汇款额度，线上 10 分钟完成。',
        images: [IMG(102)],
        landingUrl: 'https://www.hsbc.co.uk/current-accounts/products/student/',
        pricingModel: 'CPM',
        status: 'ACTIVE',
        startDate: daysAgo(3),
        endDate: daysAhead(11),
        budgetCents: 150000,
        totalPriceCents: 150000,
        priceSnapshot: snapshotFor([warwick.id, ucl.id]),
        sourcedBySchoolId: null,
        platformReviewedByAdminId: confirmerId,
        paymentConfirmedByAdminId: confirmerId,
        paymentNote: '线下对公转账已确认（演示数据）',
        paidAt: daysAgo(4),
        placements: { create: [{ schoolId: warwick.id }, { schoolId: ucl.id }] },
      },
    });
    let spendB = 0;
    const statsB = [];
    for (let d = 1; d <= 3; d++) {
      for (const s of [warwick, ucl]) {
        const impressions = rnd(400, 900);
        const spend = Math.floor((impressions * CPM_PRICE) / 1000);
        spendB += spend;
        statsB.push({
          campaignId: campB.id,
          schoolId: s.id,
          date: dateOnly(daysAgo(d)),
          impressions,
          clicks: rnd(20, 60),
          spendCents: spend,
        });
      }
    }
    await prisma.adDailyStat.createMany({ data: statsB, skipDuplicates: true });
    await prisma.adCampaign.update({ where: { id: campB.id }, data: { spendCents: spendB } });

    // (c) 奶茶店 CPC 预算 300 元，已提交 → Warwick 学生会待审（自拉商家分级审核）
    await prisma.adCampaign.create({
      data: {
        advertiserId: milktea.id,
        title: '一点点奶茶新品尝鲜周',
        content: '波霸厚乳新品上市，UniMatcha 用户到店出示本卡片立减 1 镑，考文垂店限定。',
        images: [IMG(103)],
        landingUrl: null,
        pricingModel: 'CPC',
        status: 'PENDING_UNION_REVIEW',
        startDate: daysAhead(1),
        endDate: daysAhead(8),
        budgetCents: 30000,
        totalPriceCents: 30000,
        priceSnapshot: snapshotFor([warwick.id]),
        sourcedBySchoolId: warwick.id,
        placements: { create: [{ schoolId: warwick.id }] },
      },
    });

    // (d) Starbucks 第二单：CPC 草稿（商家编辑中，未提交无快照）
    await prisma.adCampaign.create({
      data: {
        advertiserId: starbucks.id,
        title: '星巴克秋季新品预热',
        content: '南瓜丝绒拿铁回归，敬请期待（草稿：素材与排期待定）。',
        images: [IMG(104)],
        landingUrl: 'https://www.starbucks.co.uk',
        pricingModel: 'CPC',
        status: 'DRAFT',
        startDate: daysAhead(7),
        endDate: daysAhead(14),
        budgetCents: 50000,
        totalPriceCents: 50000,
        sourcedBySchoolId: null,
        placements: { create: [{ schoolId: ucl.id }] },
      },
    });

    // (e) 上周结束的小额 BUYOUT（Warwick），COMPLETED 且已结算：
    //     spend 60000（3 天 × 20000），平台直签分成 10% → AD_SHARE 6000 分
    const campE = await prisma.adCampaign.create({
      data: {
        advertiserId: starbucks.id,
        title: '星巴克开学周特惠',
        content: '开学第一周全场饮品 8 折，已结束（演示历史订单）。',
        images: [IMG(105)],
        landingUrl: 'https://www.starbucks.co.uk',
        pricingModel: 'BUYOUT',
        status: 'COMPLETED',
        startDate: daysAgo(10),
        endDate: daysAgo(8),
        budgetCents: null,
        totalPriceCents: 60000,
        spendCents: 60000,
        priceSnapshot: snapshotFor([warwick.id]),
        sourcedBySchoolId: null,
        platformReviewedByAdminId: confirmerId,
        paymentConfirmedByAdminId: confirmerId,
        paidAt: daysAgo(11),
        completedAt: daysAgo(8),
        settledAt: daysAgo(8), // 分成已入账幂等标记
        placements: { create: [{ schoolId: warwick.id, buyoutPriceCents: 60000 }] },
      },
    });
    await prisma.adDailyStat.createMany({
      data: [10, 9, 8].map((d) => ({
        campaignId: campE.id,
        schoolId: warwick.id,
        date: dateOnly(daysAgo(d)),
        impressions: rnd(400, 900),
        clicks: rnd(20, 60),
        spendCents: BUYOUT_DAILY,
      })),
      skipDuplicates: true,
    });
    // 结算入账：Warwick platformShareBps 默认 1000（10%）→ 60000 × 10% = 6000 分
    await prisma.schoolLedgerEntry.create({
      data: {
        schoolId: warwick.id,
        type: 'AD_SHARE',
        amountCents: 6000,
        refType: 'campaign',
        refId: campE.id,
        note: '广告分成：星巴克开学周特惠（平台直签 10%）',
        createdByAdminId: confirmerId,
      },
    });
  }

  // ─── 财务：赞助发放 + 待审提现（各自按存在性检查，幂等）──────────
  const existingGrant = await prisma.schoolLedgerEntry.findFirst({
    where: { schoolId: warwick.id, type: 'SPONSOR_GRANT', note: '首季赞助' },
  });
  if (!existingGrant) {
    await prisma.schoolLedgerEntry.create({
      data: {
        schoolId: warwick.id,
        type: 'SPONSOR_GRANT',
        amountCents: 50000,
        refType: 'grant',
        note: '首季赞助',
        createdByAdminId: confirmerId,
      },
    });
    console.log('创建 SPONSOR_GRANT 入账（Warwick +500 元）');
  }

  const existingWithdrawal = await prisma.withdrawalRequest.findFirst({
    where: { schoolId: warwick.id },
  });
  if (!existingWithdrawal) {
    await prisma.withdrawalRequest.create({
      data: {
        schoolId: warwick.id,
        amountCents: 20000,
        status: 'PENDING',
        bankSnapshot: { accountName: 'Warwick CSSA', bankName: 'HSBC', accountNo: '12345678' },
        requestedByAdminId: unionWarwick.id,
      },
    });
    console.log('创建 PENDING 提现申请（Warwick 200 元）');
  }

  // ─── 演示账号汇总 ────────────────────────────────────────────
  console.log('');
  console.log('════════ 广告演示账号（ads demo credentials）════════');
  console.log('学生会（密码 Union@123456）：');
  console.log('  union.warwick@unimatcha.com     华威学生会   → University of Warwick');
  console.log('  union.ucl@unimatcha.com         UCL 学生会   → University College London');
  console.log('  union.manchester@unimatcha.com  曼大学生会   → University of Manchester');
  console.log('商家（密码 Sponsor@123456）：');
  console.log('  sponsor.starbucks@unimatcha.com 星巴克校园        （平台直签）');
  console.log('  sponsor.hsbc@unimatcha.com      HSBC UK           （平台直签）');
  console.log('  sponsor.milktea@unimatcha.com   一点点奶茶·考文垂 （Warwick 自拉）');
  console.log('══════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
