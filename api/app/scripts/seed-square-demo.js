/**
 * 广场 v2 演示假数据（§8.1）：基于 SquarePost。
 *   - 个人小卡（board=RECOMMEND, authorType=USER）
 *   - 校园墙中卡（board=CAMPUS_WALL, authorType=USER, 同校可见）
 *   - 4~6 条官方大卡（STUDENT_UNION / TEAM / SPONSOR，带 school / isSponsored）
 *   - 若干匿名帖（anonymous=true）
 * 幂等：每次先清掉上一批 demo（用户 email 以 sq.demo. 开头、admin email 以 sq.demo.admin. 开头）再重建。
 * 本地运行： cd apps/api && node scripts/seed-square-demo.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 假 hash（demo 账号不需要真正登录）
const PW = '$2b$10$demoDemoDemoDemoDemoDeuVqf3yQv7Xq9Yk3mJdpqaa';

const W = (n) => `https://randomuser.me/api/portraits/women/${n}.jpg`;
const M = (n) => `https://randomuser.me/api/portraits/men/${n}.jpg`;
// 内置渐变占位图（data-URI SVG，本轮反馈4：不依赖外部图床，离线/中国均可显示）
const svgPlaceholder = (seed, w, h) => {
  let hash = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const hue2 = (hue + 40) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},70%,72%)'/><stop offset='1' stop-color='hsl(${hue2},65%,55%)'/></linearGradient></defs><rect width='100%' height='100%' fill='url(%23g)'/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29');
};
const IMG = (s) => svgPlaceholder('cl' + s, 640, 480);
const ago = (h) => new Date(Date.now() - h * 3600 * 1000);
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

// ── 用户（带头像/资料）──────────────────────────────────────────────
const USERS = [
  { key: 'mia',   nick: 'Mia',   g: 'female', av: W(44), school: 'University of Oxford',     age: 21, city: 'Oxford',     bio: 'English Lit. Lives on cold brew and margin notes.', tags: ['Reading', 'Coffee', 'Film'] },
  { key: 'leo',   nick: 'Leo',   g: 'male',   av: M(32), school: 'University of Oxford',     age: 22, city: 'Oxford',     bio: 'Physics. Will explain the double-slit experiment unprompted.', tags: ['Climbing', 'Synth', 'Tea'] },
  { key: 'sana',  nick: 'Sana',  g: 'female', av: W(68), school: 'University of Cambridge',  age: 20, city: 'Cambridge',  bio: 'Architecture. Always sketching buildings I cannot afford.', tags: ['Design', 'Cycling', 'Jazz'] },
  { key: 'tom',   nick: 'Tom',   g: 'male',   av: M(54), school: 'University of Cambridge',  age: 23, city: 'Cambridge',  bio: 'Rowing at dawn, regretting it by noon.', tags: ['Rowing', 'Cooking', 'Dogs'] },
  { key: 'priya', nick: 'Priya', g: 'female', av: W(12), school: 'Imperial College London',  age: 22, city: 'London',     bio: 'Bioeng. Plant collection slightly out of control.', tags: ['Plants', 'Baking', 'Hiking'] },
  { key: 'noah',  nick: 'Noah',  g: 'male',   av: M(76), school: 'Imperial College London',  age: 24, city: 'London',     bio: 'CompSci. Building something nobody asked for.', tags: ['Coding', 'Chess', 'Vinyl'] },
  { key: 'ella',  nick: 'Ella',  g: 'female', av: W(33), school: 'University of Oxford',     age: 21, city: 'Oxford',     bio: 'History of Art. Museum dates only, sorry.', tags: ['Galleries', 'Pottery', 'Wine'] },
  { key: 'kai',   nick: 'Kai',   g: 'male',   av: M(11), school: 'University of Cambridge',  age: 22, city: 'Cambridge',  bio: 'Music tech. Bedroom producer with grand delusions.', tags: ['Music', 'Skating', 'Ramen'] },
  { key: 'zoe',   nick: 'Zoe',   g: 'female', av: W(90), school: 'Imperial College London',  age: 20, city: 'London',     bio: 'Geography fieldwork enthusiast. Muddy boots, happy heart.', tags: ['Hiking', 'Photography', 'Tea'] },
  { key: 'finn',  nick: 'Finn',  g: 'male',   av: M(3),  school: 'University of Oxford',     age: 23, city: 'Oxford',     bio: 'Philosophy. Ask me anything, I will overthink it.', tags: ['Debate', 'Running', 'Coffee'] },
];

// ── 个人小卡（board=RECOMMEND，瀑布流小卡）─────────────────────────
// anon: true 则匿名（作者位渲染"匿名同学"，学校仍标注）
const RECOMMEND_POSTS = [
  { author: 'zoe',   title: 'Library life',  content: 'Two espressos deep into finals revision and the library basement has officially become my second home. Send snacks.', imgs: [IMG(21)], h: 6,   likes: 64,  anon: false },
  { author: 'kai',   title: '',              content: 'Joined the rowing club on a whim this morning. My arms have since filed a formal complaint with management.', imgs: [IMG(41)], h: 14,  likes: 47,  anon: false },
  { author: 'ella',  title: 'Found it',      content: 'Rainy afternoon, that tiny secondhand bookshop off the high street, and a 1968 edition of my favourite novel for two pounds.', imgs: [IMG(61)], h: 27,  likes: 88,  anon: false },
  { author: 'finn',  title: '',              content: 'Spent an hour debating whether a hot dog is a sandwich. No conclusion reached. Philosophy degree clearly paying off.', imgs: [], h: 40,  likes: 52,  anon: false },
  { author: 'priya', title: '',              content: 'The plant collection has officially outgrown the windowsill. Considering a custody arrangement with my flatmate.', imgs: [IMG(91)], h: 58,  likes: 73,  anon: false },
  { author: 'noah',  title: '',              content: 'Pushed a tiny feature nobody asked for at 2am and it actually works. This is the only serotonin I have left.', imgs: [], h: 81,  likes: 39,  anon: false },
  { author: 'mia',   title: 'Confession',    content: 'Anonymous confession: I have had a crush on the person who always sits by the window on the library third floor for ages, and today I finally borrowed the book he had just returned.', imgs: [IMG(112)], h: 12,  likes: 131, anon: true },
  { author: 'tom',   title: '',              content: 'Anonymous: finals stress is crushing me. Anyone want to study together and keep each other accountable? I do not want to do this alone.', imgs: [], h: 30,  likes: 95,  anon: true },
];

// ── 校园墙中卡（board=CAMPUS_WALL，同校可见）──────────────────────
// 高赞的会被推荐流偶尔提上来（likeCount >= 10）
const CAMPUS_WALL_POSTS = [
  { author: 'mia',   title: 'Lost & found', content: 'Found a pen in the third-floor study room today, engraved with the letter J. The owner can claim it at the student union lost-and-found.', imgs: [IMG(201)], h: 4,   likes: 22, anon: false },
  { author: 'leo',   title: 'Team up',       content: 'Third-year physics student looking for someone to do a quantum computing course project together, ideally with some Python. DM me.', imgs: [], h: 10,  likes: 14, anon: false },
  { author: 'ella',  title: '',             content: 'The art history society is hosting a free pop-up exhibition tour this Friday. Fellow students welcome, grab a booklet at the door.', imgs: [IMG(202)], h: 18,  likes: 31, anon: false },
  { author: 'finn',  title: '',             content: 'Anonymous: the new mixed-noodle place on the second floor of the canteen is genuinely amazing. Recommending it to everyone on campus.', imgs: [IMG(203)], h: 26,  likes: 48, anon: true },
  { author: 'sana',  title: 'Cycling',      content: 'Any Cambridge folks want to cycle to Grantchester together this weekend? Let us make a plan.', imgs: [IMG(204)], h: 8,   likes: 19, anon: false },
  { author: 'kai',   title: '',             content: 'The Cambridge music festival is recruiting volunteers. Meals provided plus merch. DM me if interested.', imgs: [], h: 22,  likes: 11, anon: false },
  { author: 'zoe',   title: '',             content: 'The Imperial geography department fieldwork photos are out. Fellow students, come claim your unflattering shots haha.', imgs: [IMG(205)], h: 16,  likes: 27, anon: false },
  { author: 'noah',  title: 'Lost item',    content: 'Left a grey thermos on level B1 of the Imperial library. If anyone sees it, please drop it at the front desk. Thanks.', imgs: [], h: 12,  likes: 9,  anon: false },
];

// ── 官方大卡（4~6 条，STUDENT_UNION / TEAM / SPONSOR）──────────────
// adminKey 对应下方 ADMINS；school 仅 STUDENT_UNION 必填
const ADMINS = [
  { key: 'su_ox',   name: 'Oxford Student Union',  role: 'STUDENT_UNION', schoolId: 'University of Oxford',    org: null },
  { key: 'su_cam',  name: 'Cambridge Student Union', role: 'STUDENT_UNION', schoolId: 'University of Cambridge', org: null },
  { key: 'team',    name: 'Campus Love Operations Team', role: 'TEAM',      schoolId: null,                     org: 'Campus Love Team' },
  { key: 'sponsor', name: 'Starbucks Campus',     role: 'SPONSOR',       schoolId: null,                     org: 'Starbucks Campus' },
];

const OFFICIAL_POSTS = [
  { adminKey: 'su_ox',   board: 'RECOMMEND',   school: 'University of Oxford',    title: 'Welcome party sign-up open', content: 'The Oxford Student Union welcome party is this Saturday at 7pm in the Sheldonian Theatre. Scan to sign up, places are limited!', imgs: [IMG(301)], h: 5,  sponsored: false, pinned: true,  weight: 10 },
  { adminKey: 'su_cam',  board: 'CAMPUS_WALL', school: 'University of Cambridge', title: 'Cambridge societies recruitment week', content: 'The Cambridge Student Union societies recruitment week is here. From rowing to debating, there is something for everyone. Location: Market Square.', imgs: [IMG(302)], h: 9,  sponsored: false, pinned: false, weight: 5 },
  { adminKey: 'team',    board: 'RECOMMEND',   school: null,                      title: 'Dual-mode launch announcement', content: 'Campus Love now has a brand-new dual mode: partner + friend, find both kinds of connection at once. Update to the latest version to try it out.', imgs: [IMG(303)], h: 14, sponsored: false, pinned: false, weight: 8 },
  { adminKey: 'sponsor', board: 'RECOMMEND',   school: null,                      title: 'Campus coffee season', content: 'Show your Campus Love school verification at any Starbucks store to get your second drink half price. Offer runs until the end of the month.', imgs: [IMG(304)], h: 20, sponsored: true,  pinned: false, weight: 6 },
  { adminKey: 'su_ox',   board: 'RECOMMEND',   school: 'University of Oxford',    title: 'Finals study rooms open', content: 'The Oxford Student Union has arranged several 24-hour study rooms, open for the finals crunch. Swipe your campus card to enter. Good luck!', imgs: [IMG(305)], h: 30, sponsored: false, pinned: false, weight: 4 },
];

// 评论池（随机取 2-4 条，作者随机非本帖作者）
const COMMENTS = [
  'This is so useful, saving it.',
  'Hahaha so relatable.',
  'Same school here, followed.',
  'Need this energy in my life immediately.',
  'Could you share the exact address? Just a curious passerby.',
  'So jealous, definitely doing this!',
  'Saving this for motivation.',
  'Fellow student here, bumping this so more people see it.',
  'I went last week too, it really was great.',
  'You said exactly what was on my mind.',
];

async function clearDemo() {
  console.log('清理旧 demo 数据...');
  // 删 demo 用户（cascade 其 SquarePost / 评论 / 点赞 / profile）
  const users = await prisma.user.findMany({ where: { email: { startsWith: 'sq.demo.' } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  // 删 demo 后管发的官方帖（adminId 在 demo admin 集合内）
  const admins = await prisma.adminUser.findMany({ where: { email: { startsWith: 'sq.demo.admin.' } }, select: { id: true } });
  const aids = admins.map((a) => a.id);

  if (aids.length) {
    await prisma.squarePost.deleteMany({ where: { adminId: { in: aids } } });
  }
  if (uids.length) {
    // SquarePost(authorUserId) onDelete=SetNull，不会随用户删除，手动清
    await prisma.squarePost.deleteMany({ where: { authorUserId: { in: uids } } });
    // 这些用户可能被 Match 引用（演示/扫码加好友数据），Match 外键无级联 → 先删 Match（级联其 Message），否则删用户违反外键
    await prisma.match.deleteMany({ where: { OR: [{ userAId: { in: uids } }, { userBId: { in: uids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: uids } } });
  }
  if (aids.length) {
    await prisma.adminUser.deleteMany({ where: { id: { in: aids } } });
  }
}

async function main() {
  await clearDemo();

  console.log('创建用户 + 资料...');
  const U = {};
  for (const u of USERS) {
    const created = await prisma.user.create({
      data: {
        email: `sq.demo.${u.key}@campus.demo`,
        passwordHash: PW,
        status: 'ACTIVE',
        profile: {
          create: {
            nickname: u.nick, school: u.school, grade: 'Undergraduate', gender: u.g,
            genderPref: u.g === 'female' ? 'male' : 'female', age: u.age, city: u.city,
            interests: u.tags, bio: u.bio, avatarUrl: u.av, tags: u.tags,
          },
        },
      },
    });
    U[u.key] = created.id;
  }

  console.log('创建 demo 后管账号...');
  const A = {};
  for (const a of ADMINS) {
    const created = await prisma.adminUser.create({
      data: {
        email: `sq.demo.admin.${a.key}@campus.demo`,
        passwordHash: PW,
        name: a.name,
        role: a.role,
        schoolId: a.schoolId,
        organizationName: a.org,
        isActive: true,
      },
    });
    A[a.key] = created.id;
  }

  const schoolOf = (key) => USERS.find((u) => u.key === key).school;

  // 评论生成器
  const makeComments = (authorKey, h, n) => {
    const pool = [...COMMENTS].sort(() => Math.random() - 0.5).slice(0, n);
    const commenters = USERS.map((x) => x.key).filter((k) => k !== authorKey).sort(() => Math.random() - 0.5);
    return pool.map((c, i) => ({
      userId: U[commenters[i % commenters.length]],
      content: c,
      createdAt: ago(Math.max(0, h - rnd(1, 3) * (i + 1))),
    }));
  };

  console.log('创建个人小卡（RECOMMEND）...');
  for (const p of RECOMMEND_POSTS) {
    const nc = rnd(2, 4);
    await prisma.squarePost.create({
      data: {
        board: 'RECOMMEND',
        authorType: 'USER',
        authorUserId: U[p.author],
        school: schoolOf(p.author),
        title: p.title || null,
        content: p.content,
        images: p.imgs,
        likeCount: p.likes,
        commentCount: nc,
        anonymous: p.anon,
        createdAt: ago(p.h),
        comments: { create: makeComments(p.author, p.h, nc) },
      },
    });
  }

  console.log('创建校园墙中卡（CAMPUS_WALL）...');
  for (const p of CAMPUS_WALL_POSTS) {
    const nc = rnd(1, 3);
    await prisma.squarePost.create({
      data: {
        board: 'CAMPUS_WALL',
        authorType: 'USER',
        authorUserId: U[p.author],
        school: schoolOf(p.author), // 同校可见由 school 写入源 + 列表硬过滤保证
        title: p.title || null,
        content: p.content,
        images: p.imgs,
        likeCount: p.likes,
        commentCount: nc,
        anonymous: p.anon,
        createdAt: ago(p.h),
        comments: { create: makeComments(p.author, p.h, nc) },
      },
    });
  }

  console.log('创建官方大卡（STUDENT_UNION / TEAM / SPONSOR）...');
  for (const p of OFFICIAL_POSTS) {
    const admin = ADMINS.find((a) => a.key === p.adminKey);
    await prisma.squarePost.create({
      data: {
        board: p.board,
        authorType: admin.role, // STUDENT_UNION / TEAM / SPONSOR
        adminId: A[p.adminKey],
        school: p.school,
        title: p.title,
        content: p.content,
        images: p.imgs,
        isSponsored: p.sponsored,
        likeCount: rnd(20, 200),
        metadata: { pinned: p.pinned, weight: p.weight },
        createdAt: ago(p.h),
      },
    });
  }

  const total = await prisma.squarePost.count();
  console.log(
    `完成。SquarePost 总数：${total}（本次新增 ${RECOMMEND_POSTS.length} 小卡 + ${CAMPUS_WALL_POSTS.length} 中卡 + ${OFFICIAL_POSTS.length} 官方大卡）`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
