/**
 * 给 demo@campuslove.com 造"匹配成功后"的演示数据：
 *  - 恋人关系（RELATIONSHIP_ROMANTIC，partner=Mia，约 12 天）+ 聊天记录
 *  - 一个待确认的朋友提议（MATCHED_FRIEND，48h 倒计时）+ 一句聊天
 *  - 给已有的"扫码加好友"会话补几条聊天
 * 幂等：match 用 upsert，message 先按 matchId 清空再插。无 emoji（UI 规则）。
 *
 * 运行（容器内）：node scripts/seed-demo-matched.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DAY = 86400000;
const ago = (d = 0, h = 0) => new Date(Date.now() - d * DAY - h * 3600000);

async function ensureMatch(aId, bId, mode, status, extra) {
  const [userAId, userBId] = [aId, bId].sort();
  return prisma.match.upsert({
    where: { userAId_userBId_mode: { userAId, userBId, mode } },
    create: { userAId, userBId, mode, status, ...extra },
    update: { status, ...extra },
  });
}

async function setUms(userId, mode, matchState) {
  await prisma.userModeState.upsert({
    where: { userId_mode: { userId, mode } },
    create: { userId, mode, matchState },
    update: { matchState },
  });
}

async function seedChat(matchId, meId, themId, lines) {
  await prisma.message.deleteMany({ where: { matchId } });
  for (const l of lines) {
    await prisma.message.create({
      data: {
        matchId,
        senderId: l.me ? meId : themId,
        content: l.t,
        isRead: !l.unread,
        createdAt: ago(l.d || 0, l.h || 0),
      },
    });
  }
}

// 给演示伴侣补全资料：封面图 + 真实照片墙 + 专业/MBTI/星座/国籍，
// 让全屏对方资料页（本轮反馈2）能完整展示 cover photo / Photo Portfolio。
async function enrichProfile(userId, d) {
  if (!userId) return;
  await prisma.profile.update({ where: { userId }, data: d }).catch((e) => {
    console.log('! enrichProfile skipped for', userId, '-', e.message);
  });
}
// 内置渐变占位图（data-URI SVG，本轮反馈4：不依赖外部图床）
const svgPlaceholder = (seed, w, h) => {
  let hash = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const hue2 = (hue + 40) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},70%,72%)'/><stop offset='1' stop-color='hsl(${hue2},65%,55%)'/></linearGradient></defs><rect width='100%' height='100%' fill='url(%23g)'/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29');
};
const pics = (seed, n, w = 600, h = 800) =>
  Array.from({ length: n }, (_, i) => svgPlaceholder(seed + '-' + (i + 1), w, h));

async function main() {
  const demo = await prisma.user.findUnique({ where: { email: 'demo@campuslove.com' }, select: { id: true } });
  if (!demo) throw new Error('demo user not found — register demo@campuslove.com first');
  const demoId = demo.id;
  const noteMap = {}; // demo 对各伴侣的备注（中文，UTF-8 源文件安全），随匹配一起重建
  let friendMatchId = null; // 用于给 demo 的 Leo 会话演示一张聊天背景（本轮反馈7）
  let romMatchId = null; // 用于给 demo 的情侣空间演示一张封面（本轮反馈4）

  const mia = await prisma.user.findFirst({ where: { email: 'sq.demo.mia@campus.demo' }, select: { id: true } });
  const males = await prisma.user.findMany({
    where: { email: { startsWith: 'sq.demo.' }, profile: { gender: 'male' } },
    select: { id: true, email: true }, take: 2,
  });

  // ── 1) 恋人关系 demo <-> Mia ──
  if (mia) {
    const rom = await ensureMatch(demoId, mia.id, 'ROMANTIC', 'RELATIONSHIP_ROMANTIC', {
      userAConfirmed: true, userBConfirmed: true,
      confirmedAt: ago(12), relationshipStartedAt: ago(12), createdAt: ago(13),
      score: 92, compatibilityScore: 92, metadata: { source: 'seed-demo-matched' },
      dissolvedAt: null, dissolvedBy: null, dissolveReason: null,
    });
    await setUms(demoId, 'romantic', 'relationship');
    await setUms(mia.id, 'romantic', 'relationship');
    await seedChat(rom.id, demoId, mia.id, [
      { me: false, t: 'Hey Alex! That film society idea sounds great.', d: 5 },
      { me: true, t: 'Right? We should go to the first screening together.', d: 5, h: -1 },
      { me: false, t: "I'd love that. Friday works for me.", d: 4 },
      { me: true, t: "It's a plan. I'll grab us seats.", d: 4, h: -1 },
      { me: false, t: 'Had a lovely time yesterday. Same place next week?', d: 2 },
      { me: true, t: 'Definitely. Coffee before?', d: 2, h: -1 },
      { me: false, t: 'Yes please, the usual flat white.', d: 1 },
      { me: false, t: "Btw did you finish the maths assignment? Stuck on Q3.", d: 0, h: 2, unread: true },
    ]);
    await enrichProfile(mia.id, {
      realName: 'Mia Thompson', givenName: 'Mia', familyName: 'Thompson',
      coverUrl: svgPlaceholder('cl-mia-cover', 900, 600),
      realPhotos: pics('cl-mia', 4),
      major: 'English Literature', mbti: 'INFP', zodiac: 'Libra', nationality: 'United Kingdom',
    });
    noteMap[mia.id] = 'My baby';
    romMatchId = rom.id;
    // 情侣空间演示数据（本轮反馈2）：礼物罐子 + 双方状态 + 纪念日 + 打卡清单
    await enrichProfile(demoId, { wishGifts: ['Vinyl record', 'A handwritten letter', 'Film camera'], givenName: 'Alex', familyName: 'Carter', realName: 'Alex Carter' });
    await enrichProfile(mia.id, { wishGifts: ['Cold brew kit', 'Poetry book', 'Cozy hoodie'] });
    await prisma.coupleMemberState.deleteMany({ where: { matchId: rom.id } });
    await prisma.coupleMemberState.createMany({
      data: [
        { matchId: rom.id, userId: demoId, status: 'Missing you' },
        { matchId: rom.id, userId: mia.id, status: 'Happy and sleepy' },
      ],
    });
    // 今天想吃：历史（最新一条为当前）
    await prisma.coupleCravingEntry.deleteMany({ where: { matchId: rom.id } });
    await prisma.coupleCravingEntry.createMany({
      data: [
        { matchId: rom.id, userId: demoId, text: 'Sushi', createdAt: ago(2) },
        { matchId: rom.id, userId: demoId, text: 'Pizza', createdAt: ago(1) },
        { matchId: rom.id, userId: demoId, text: 'Ramen', createdAt: ago(0, 1) },
        { matchId: rom.id, userId: mia.id, text: 'Sushi', createdAt: ago(0, 2) },
      ],
    });
    // 近期安排：一条已结束（记录）+ 一条进行中
    await prisma.coupleScheduleEntry.deleteMany({ where: { matchId: rom.id } });
    await prisma.coupleScheduleEntry.createMany({
      data: [
        { matchId: rom.id, userId: demoId, text: 'Morning lecture', startAt: ago(0, 6), endAt: ago(0, 3) },
        { matchId: rom.id, userId: demoId, text: 'Library then free', startAt: ago(0, 1), endAt: ago(0, -3) },
        { matchId: rom.id, userId: mia.id, text: 'Seminar', startAt: ago(0, 0), endAt: ago(0, -2) },
      ],
    });
    await prisma.coupleAnniversary.deleteMany({ where: { matchId: rom.id } });
    await prisma.coupleAnniversary.createMany({
      data: [
        { matchId: rom.id, title: 'First date', date: ago(12), createdBy: demoId, note: 'Coffee at the old library cafe — talked for hours.', images: pics('cl-anni-firstdate', 3, 800, 500) },
        { matchId: rom.id, title: '100 days together', date: ago(-88), createdBy: mia.id },
      ],
    });
    await prisma.coupleBucketItem.deleteMany({ where: { matchId: rom.id } });
    await prisma.coupleBucketItem.createMany({
      data: [
        { matchId: rom.id, text: 'Watch the sunrise at Port Meadow', createdBy: demoId, done: false },
        { matchId: rom.id, text: 'Try the new ramen place', createdBy: mia.id, done: true, doneBy: mia.id, doneNote: 'So good — the tonkotsu was unreal!', doneImages: pics('cl-ramen', 2, 600, 400) },
      ],
    });
    console.log('✓ romantic relationship + chat + couple space (partner: Mia)');
  } else {
    console.log('! Mia demo user missing — skipped romantic');
  }

  // ── 2) 已确认朋友 demo <-> males[0] + 聊天 ──
  if (males[0]) {
    const fc = await ensureMatch(demoId, males[0].id, 'FRIEND', 'FRIEND_CONFIRMED', {
      userAConfirmed: true, userBConfirmed: true,
      confirmedAt: ago(6), relationshipStartedAt: null, createdAt: ago(7),
      score: 84, compatibilityScore: 84, metadata: { source: 'seed-demo-matched' },
      dissolvedAt: null, dissolvedBy: null, dissolveReason: null,
    });
    await setUms(demoId, 'friend', 'relationship');
    await setUms(males[0].id, 'friend', 'relationship');
    await seedChat(fc.id, demoId, males[0].id, [
      { me: false, t: 'Hey! Good to finally connect.', d: 3 },
      { me: true, t: 'Likewise — see you at the society meetup?', d: 3, h: -1 },
      { me: false, t: 'For sure. Bring the others too.', d: 0, h: 4 },
    ]);
    await enrichProfile(males[0].id, {
      realName: 'Leo Walker', givenName: 'Leo', familyName: 'Walker',
      coverUrl: svgPlaceholder('cl-leo-cover', 900, 600),
      realPhotos: pics('cl-leo', 5),
      major: 'Computer Science', mbti: 'ENTP', zodiac: 'Aries', nationality: 'United Kingdom',
    });
    noteMap[males[0].id] = 'Buddy';
    friendMatchId = fc.id;
    console.log('✓ confirmed friend + chat (' + males[0].email + ')');
  }

  // ── 3) 待确认朋友提议 demo <-> males[1]（48h 倒计时）+ 聊天 ──
  if (males[1]) {
    const fp = await ensureMatch(demoId, males[1].id, 'FRIEND', 'MATCHED_FRIEND', {
      userAConfirmed: false, userBConfirmed: false,
      confirmedAt: null, relationshipStartedAt: null, createdAt: ago(0, 6),
      score: 81, compatibilityScore: 81, metadata: { source: 'seed-demo-matched' },
      dissolvedAt: null, dissolvedBy: null, dissolveReason: null,
    });
    await setUms(males[1].id, 'friend', 'matched');
    await seedChat(fp.id, demoId, males[1].id, [
      { me: false, t: 'Hey, saw we matched as friends — you into hiking too?', d: 0, h: 5 },
    ]);
    await enrichProfile(males[1].id, {
      realName: 'Tom Hughes', givenName: 'Tom', familyName: 'Hughes',
      coverUrl: svgPlaceholder('cl-tom-cover', 900, 600),
      realPhotos: pics('cl-tom', 3),
      major: 'Economics', mbti: 'ISTJ', zodiac: 'Taurus', nationality: 'Ireland',
    });
    console.log('✓ friend proposal (48h) + chat (' + males[1].email + ')');
  }

  const demoUser = await prisma.user.findUnique({ where: { id: demoId }, select: { settings: true } });
  const chatBackgrounds = friendMatchId
    ? { [friendMatchId]: svgPlaceholder('cl-chat-wallpaper', 800, 1200) }
    : {};
  const coupleCovers = romMatchId ? { [romMatchId]: svgPlaceholder('cl-couple-cover', 900, 600) } : {};
  await prisma.user.update({
    where: { id: demoId },
    data: { settings: { ...(demoUser?.settings || {}), notes: noteMap, chatBackgrounds, coupleCovers } },
  });
  console.log('Done. notes =', JSON.stringify(noteMap));
  console.log('Log in as demo@campuslove.com / Demo@123456 to see post-match states.');
}

main()
  .catch((e) => { console.error('seed error:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
