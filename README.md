# Unimatcha

> 大学生长期恋爱匹配平台 · v2.0

面向大学生、主打"长期恋爱关系"的全栈匹配系统。每周五 17:00 公布一轮匹配结果，包含 H5 移动端、Web 管理后台和 NestJS 后端 API。

---

## 目录

- [总体架构](#总体架构)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [匹配机制](#匹配机制)
- [数据库 ERD](#数据库-erd)
- [API 文档](#api-文档)
- [快速开始](#快速开始)
- [开发模式](#开发模式)
- [部署](#部署)
- [AI 匹配接入点](#ai-匹配接入点)
- [常见问题](#常见问题)

---

## 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                         │
│                                                             │
│       H5 Mobile (SPA)              Admin Web (Next.js)     │
│       - 注册 / 登录                - 管理员登录             │
│       - 资料 & 问卷填写            - 用户管理               │
│       - 每周匹配池 & 结果          - 问卷 CRUD              │
│       - 情侣广场（帖子 + 评论）    - 匹配任务管理           │
│       - 实时聊天                   - 排行榜数据             │
│       - 通知中心                                            │
│       - 排行榜                                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API (JWT)
┌──────────────────────────▼──────────────────────────────────┐
│                   API Server (NestJS)                       │
│                                                             │
│  Auth  Users  Profiles  Questionnaire  Answers  Matching   │
│  Square  Discovery  Chat  Notifications  Uploads  Admin    │
│                                                             │
│  ┌──────────────────┐    ┌─────────────────────────┐       │
│  │   BullMQ Queue   │    │   MatchModelProvider    │       │
│  │  (match-queue)   │    │   (Stub → 替换为 AI)    │       │
│  └────────┬─────────┘    └─────────────────────────┘       │
│           │ Job Processing                                  │
│  ┌────────▼─────────┐                                       │
│  │  MatchProcessor  │                                       │
│  └──────────────────┘                                       │
└──────────────────┬──────────────────────────────────────────┘
                   │
       ┌───────────┴────────────┐
       │                        │
┌──────▼─────────┐      ┌──────▼───────┐
│   PostgreSQL   │      │    Redis     │
│   (数据存储)   │      │  (任务队列)  │
└────────────────┘      └──────────────┘
```

**关键设计决策：**

1. **周期匹配制**：每轮匹配持续整整一周（周五 17:00 → 下周五 17:00），结果统一公布，营造仪式感
2. **AI 匹配解耦**：通过 `MatchModelProvider` 接口隔离 AI 逻辑，MVP 用 Stub 实现，替换时只改一个文件
3. **问卷版本化**：问卷有版本号，用户提交时记录版本，旧答案永久保留
4. **双 JWT 体系**：用户 token 与管理员 token 使用不同 secret，互不干扰
5. **BullMQ 队列**：匹配任务异步执行，支持失败重试，不阻塞 API
6. **持久化图片存储**：Docker named volume 挂载 `/app/uploads`，容器重建后图片不丢失
7. **情侣广场**：配对成功的情侣可发布图文帖子，支持点赞、评论（含排序）

---

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| H5 移动端 | 原生 HTML/CSS/JS (SPA) | 零依赖单文件，nginx 静态托管 |
| 后端 | NestJS + TypeScript | 模块化，DI 容器，全栈类型安全 |
| 数据库 | PostgreSQL + Prisma | 类型安全 ORM，关系型适合此业务 |
| 队列 | BullMQ + Redis | 生产级任务队列，支持重试、延迟、并发控制 |
| 管理后台 | Next.js 14 + Tailwind | App Router，SSR 友好 |
| 认证 | JWT | 无状态，Web / H5 通用 |
| 文件上传 | Multer + 本地 Volume | 头像、帖子图片、实名照片持久存储 |
| 容器化 | Docker Compose | 一键启动全部 5 个服务 |

---

## 目录结构

```
unimatcha/
├── apps/
│   ├── api/                          # NestJS 后端 API
│   │   ├── src/
│   │   │   ├── auth/                 # 用户 & 管理员认证
│   │   │   ├── users/                # 用户管理
│   │   │   ├── profiles/             # 用户资料（含社交链接、头像、封面）
│   │   │   ├── questionnaire/        # 问卷版本管理
│   │   │   ├── answers/              # 用户答案
│   │   │   ├── matching/             # 匹配引擎 & 状态机
│   │   │   │   └── providers/        # AI 接入点（Stub + 接口定义）
│   │   │   ├── square/               # 广场 v2（双流 + 帖子搜索 + 个性化重排）
│   │   │   ├── discovery/            # 找人 + 猜你认识（含隐私开关口径）
│   │   │   ├── chat/                 # 情侣实时聊天（轮询）
│   │   │   ├── notifications/        # 系统通知中心
│   │   │   ├── uploads/              # 图片上传（头像 / 封面 / 帖子图）
│   │   │   ├── leaderboard/          # 排行榜（时长 + 积分）
│   │   │   ├── admin/                # 管理后台 API
│   │   │   ├── prisma/               # DB 服务
│   │   │   └── common/               # 公共装饰器 / 过滤器 / 守卫
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # 数据库 Schema
│   │   │   ├── ensure-search-indexes.ts  # pg_trgm 扩展 + 搜索 GIN 索引（幂等）
│   │   │   └── seed.ts               # 初始数据
│   │   └── Dockerfile
│   │
│   ├── admin-web/                    # Next.js 管理后台
│   │   └── src/app/
│   │       ├── login/
│   │       ├── (dashboard)/
│   │       │   ├── dashboard/        # 数据概览
│   │       │   ├── users/            # 用户管理
│   │       │   ├── questionnaire/    # 问卷管理
│   │       │   └── matching/         # 匹配管理
│   │       └── lib/                  # API Client
│   │
│   ├── h5/                           # H5 移动端（Vite + ES Modules）
│   │   ├── index.html                # HTML 外壳（标签 + Tailwind CDN 配置）
│   │   ├── src/
│   │   │   ├── main.js               # 入口：导入样式 + 各模块 + 启动
│   │   │   ├── state.js              # 共享状态对象 S（28 个全局状态）
│   │   │   ├── styles/main.css       # 全局样式（由原内联 <style> 抽离）
│   │   │   └── modules/              # 按领域拆分的功能模块（共 122 个函数）
│   │   │       ├── core.js           # API / 页面导航 / 通用工具
│   │   │       ├── auth.js           # 登录 / 注册 / 验证
│   │   │       ├── profile.js        # 资料设置 / 编辑 / 标签 / 照片
│   │   │       ├── questionnaire.js  # 问卷渲染 / 作答 / 提交
│   │   │       ├── match.js          # 匹配池 / 状态机 / 筛选
│   │   │       ├── chat.js           # 情侣聊天（轮询）
│   │   │       ├── square.js         # 情侣广场（帖子 / 评论 / 发帖）
│   │   │       ├── notifications.js  # 通知中心
│   │   │       ├── leaderboard.js    # 排行榜
│   │   │       └── settings.js       # 设置 / 隐私开关
│   │   ├── public/                   # 静态资源（splash_bg / login_bg）
│   │   ├── vite.config.js
│   │   ├── package.json
│   │   └── Dockerfile                # 多阶段：node 构建 → nginx 托管
│   │
│   └── ios/                          # iOS 原生客户端（SwiftUI · MVVM）
│       └── Unimatcha/               # App / Models / Network / ViewModels / Views
│
├── packages/shared/                  # 共享 seed 数据（英国院校 / 专业 / 城市）
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 匹配机制

Unimatcha 采用**周期制匹配**，核心规则如下：

**周期结构**

每一轮匹配从周五 17:00 开始，到下周五 17:00 结束，整整一周。周五 17:00 是唯一的结果公布时刻。

**用户流程**

1. 用户随时可以加入匹配池（点击"加入匹配池"）
2. 加入后界面始终显示"匹配中"动画 + 倒计时到下个周五 17:00
3. 周五 17:00，系统运行匹配算法，结果通过通知推送

**结果处理**

- **配对成功（relationship）**：弹窗告知，对象信息永久展示，直到用户自行解除
- **本轮未配（no_match）**：弹窗告知本轮无缘，用户自动进入下一轮匹配池，界面继续显示"匹配中"，等待下周五结果

**状态机**

```
idle ──[加入匹配池]──▶ searching / no_match（统一显示"匹配中"）
                              │
                        [周五 17:00]
                         ┌────┴────┐
                         ▼         ▼
                    relationship  no_match（弹窗后继续 searching）
                         │
                   [用户解除匹配]
                         │
                         ▼
                        idle
```

---

## 数据库 ERD

```
users ──────────── profiles (1:1)
  │                  ├── socialLinks (JSON)
  │                  ├── avatarUrl
  │                  ├── coverUrl
  │                  └── relationshipScore (Float)
  │
  ├── answers[] ──── questionnaire_versions (N:1)
  │                    └── questions[] ──── question_options[]
  │
  ├── matchesAsUserA[] ──┐
  ├── matchesAsUserB[] ──┼── matches
  │                      │     ├── score
  │                      │     ├── status
  │                      │     ├── relationshipStartedAt
  │                      │     ├── squarePosts[]     # 情侣广场帖子
  │                      │     └── chatMessages[]    # 情侣聊天记录
  │                      │
  │                      └── match_jobs (N:1)
  │
  ├── notifications[]              # 系统通知
  └── squarePosts[] (author)       # 发布的帖子

admin_users (独立)
match_configs (调度配置)
system_configs (key-value 全局配置)
```

**核心表说明：**

| 表 | 说明 |
|---|---|
| `users` | 普通用户，含 mode 字段（MATCH_MODE / RELATIONSHIP_MODE）|
| `admin_users` | 管理员，独立权限体系 |
| `profiles` | 用户资料，含 socialLinks (JSON)、头像、封面、relationshipScore |
| `questionnaire_versions` | 问卷版本，支持多版本共存 |
| `questions` | 题目（单选 / 多选 / 量表 / 文本四种题型）|
| `answers` | 用户答案，unique(userId, versionId, questionId) |
| `matches` | 匹配结果，含 score、metadata、relationshipStartedAt |
| `square_posts` | 情侣广场帖子，含图片数组、点赞数、评论 |
| `comments` | 帖子评论，含点赞数 |
| `chat_messages` | 情侣私信记录 |
| `notifications` | 系统通知（匹配结果、点赞、评论等）|
| `match_jobs` | 匹配任务批次 |
| `match_configs` | 匹配 Cron 表达式配置 |

---

## API 文档

所有 API 均以 `/api/v1` 为前缀。需要认证的接口须在 Header 中附带 `Authorization: Bearer <token>`。

### 认证

```
POST /auth/register              注册
POST /auth/login                 登录
POST /admin/auth/login           管理员登录
```

### 用户资料

```
GET  /users/me                   获取当前用户信息
PUT  /users/me                   更新用户信息
GET  /users/:id/public-profile   获取他人公开主页
GET  /profiles/me                获取我的详细资料
PUT  /profiles/me                创建 / 更新资料
```

**更新资料请求（含社交链接）：**
```json
{
  "nickname": "晓月",
  "school": "北京大学",
  "grade": "大三",
  "gender": "female",
  "genderPref": "male",
  "age": 21,
  "city": "北京",
  "interests": ["音乐", "摄影"],
  "bio": "喜欢发呆，在城市里找角落...",
  "socialLinks": {
    "wechat": "xiaoyue_wx",
    "qq": "1234567890",
    "xiaohongshu": "xiaoyue_xhs",
    "weibo": "@晓月",
    "instagram": "xiaoyue_ig"
  }
}
```

### 图片上传

```
POST /uploads/image              上传通用图片（帖子配图）
POST /uploads/avatar             上传头像
POST /uploads/real-photo         上传实名认证照片
```

所有接口接受 `multipart/form-data`，返回图片完整 URL。图片存储在 Docker volume `uploads_data`，重建容器后持久保留。

### 问卷

```
GET  /questionnaire/active       获取当前激活问卷（含题目）
POST /answers                    提交问卷答案
GET  /answers/mine               获取我的答案
```

### 匹配

```
POST /matching/start             加入本周匹配池
GET  /matching/status            获取匹配状态
POST /matching/dissolve          解除恋爱关系
```

**匹配状态响应：**

```json
// 等待结果中（searching / no_match 前端统一显示"匹配中"）
{ "state": "searching" }

// 配对成功（周五 17:00 后可见，永久保持）
{
  "state": "relationship",
  "match": {
    "id": "clxxx",
    "score": 85,
    "relationshipStartedAt": "2026-03-21T09:00:00Z"
  },
  "partner": {
    "userId": "clyyy",
    "nickname": "晨曦",
    "school": "清华大学",
    "interests": ["读书", "旅行"],
    "avatarUrl": "http://...",
    "coverUrl": "http://..."
  }
}
```

### 广场 v2

> 旧的 `/square/posts`（情侣广场 CouplePost 体系）已废弃且**不再挂载**，全部用户侧端点在 `/square/v2/*`。

```
POST /square/v2/posts                发帖（board=recommend|campus_wall，支持匿名 / 投票帖）
GET  /square/v2/recommend            推荐流（加权混排 + 个性化重排），支持 ?search=
GET  /square/v2/campus-wall          校园墙流（同校硬过滤），支持 ?search=
GET  /square/v2/search               统一搜索：帖子 + 用户
GET  /square/v2/posts/:id            帖子详情（含评论、myLiked）
POST /square/v2/posts/:id/like       点赞 / 取消点赞
POST /square/v2/posts/:id/comments   发表评论（支持楼中楼）
POST /square/v2/comments/:id/like    评论点赞
POST /square/v2/posts/:id/vote       投票 / 改票
POST /square/v2/posts/:id/report     举报帖子
DELETE /square/v2/posts/:id          删除自己的帖子
```

**搜索参数：**

| 参数 | 说明 |
|---|---|
| `q` | 关键词（`/search`）；两个信息流端点上叫 `search` |
| `board` | `recommend` / `campus_wall`，不传则跨两个板块搜 |
| `page` / `limit` | 分页，limit 夹在 [1,50] |

检索基于 **pg_trgm** 子串匹配（中英混排内容不能用 Postgres 内置全文检索——它对中文不分词）。
相关性：标题命中 > 标签精确命中 > 正文命中，另有 `similarity()` 模糊兜底；
终排 `rel × (1+0.12·热度) × (1+0.1·新鲜度)`，保证标题精确命中的冷帖排在正文擦边的热帖之前。
可见性与信息流完全同口径：校园墙的同校硬过滤在跨板搜索时仍然生效。

**发布帖子：**
```json
{
  "board": "recommend",
  "title": "期末复习互助",
  "content": "找人一起复习高等数学",
  "images": ["http://.../uploads/xxx.jpg"],
  "anonymous": false
}
```

### 搜索与发现

```
GET  /discovery/users                       找人（昵称/学校/专业/城市/标签/兴趣，也支持连接码精确命中）
GET  /discovery/suggestions                 猜你认识
POST /discovery/suggestions/:userId/dismiss 忽略某个推荐（单向、永久）
GET  /users/search                          兼容壳，等价于 /discovery/users（出参仅 { users }）
```

**隐私模型（改动前务必先读）：**

这是恋爱匹配平台，把「谁在用这个 app」暴露给熟人是真实伤害，因此发现能力由两个**相互独立**的开关控制，
均存于 `User.settings.privacy`：

| 开关 | 默认 | 含义 |
|---|---|---|
| `searchable` | **开** | 别人按昵称/学校搜索时能否搜到我 |
| `discoverable` | **关** | 能否把我推荐进他人的「猜你认识」 |

- 两者刻意分离：愿意被知道名字的人找到 ≠ 愿意被系统主动推给同校同学。
- `discoverable` 是**双向要求**：调用方自己没打开则整个功能不可用（返回 `enabled:false`，前端引导开启
  而不是给空列表），被推荐方没打开则不会被推出去——**单侧打开产生零曝光**。
- 连接码精确命中**刻意绕过 `searchable`**：对方把码给了你，就是明确同意被你找到。
- 推荐候选排除**所有已建立过关系的人，包括已解除的**（故意不带 `dissolvedAt` 过滤）——
  把分手/绝交的两人再推到对方面前是明确伤害。

**猜你认识响应：**
```json
{
  "enabled": true,
  "items": [{
    "id": "clxxx", "nickname": "晨曦", "school": "University of Warwick",
    "relationship": "none", "score": 4.2,
    "reasons": [
      { "code": "mutualFriends", "count": 3 },
      { "code": "sameMajor", "value": "Computer Science" }
    ]
  }]
}
```

原因码（`mutualFriends` / `sameMajor` / `sameGrade` / `sameSchool` / `sharedInterests` / `coEngagement`）
由后端下发，**文案在前端生成**——这样中英切换不需要后端参与。

### 聊天

```
GET  /chat/:matchId/messages     获取聊天记录
GET  /chat/:matchId/messages/poll  长轮询拉取新消息
POST /chat/:matchId/messages     发送消息
PUT  /chat/:matchId/messages/read  标记已读
GET  /chat/:matchId/unread       获取未读数
```

### 通知

```
GET  /notifications              获取通知列表
GET  /notifications/unread-count 获取未读数
PUT  /notifications/read         全部标记已读
PUT  /notifications/:id/read     单条标记已读
```

### 排行榜

```
GET /leaderboard?type=duration&limit=20   恋爱时长排行
GET /leaderboard?type=score&limit=20      恋爱积分排行
```

### 管理员 API（需 Admin Token）

```
# 仪表盘
GET  /admin/dashboard

# 用户管理
GET    /admin/users                         列表（支持 search/status/page/limit）
GET    /admin/users/:id                     详情
PATCH  /admin/users/:id/status              封禁 / 解封
PATCH  /admin/users/:id/reset-mode          重置匹配模式

# 问卷管理
GET    /admin/questionnaire/versions              版本列表
POST   /admin/questionnaire/versions              新建版本
POST   /admin/questionnaire/versions/:id/publish  发布版本
POST   /admin/questionnaire/versions/:vId/questions      添加题目
PUT    /admin/questionnaire/questions/:id                更新题目
DELETE /admin/questionnaire/questions/:id                删除题目
PATCH  /admin/questionnaire/questions/:id/toggle         启用 / 禁用
PATCH  /admin/questionnaire/versions/:vId/questions/reorder  排序

# 匹配管理
GET  /admin/matching/config           获取匹配配置
PUT  /admin/matching/config           更新 Cron 配置
POST /admin/matching/jobs/trigger     手动触发匹配
GET  /admin/matching/jobs             任务列表
POST /admin/matching/jobs/:id/retry   重试失败任务
GET  /admin/matching/results          所有匹配结果
```

---

## 快速开始

### 前置要求

- Docker & Docker Compose
- Node.js >= 20（本地开发）

### 一键启动

```bash
# 1. 克隆项目
git clone <repo-url> unimatcha
cd unimatcha

# 2. 复制环境配置
cp .env.example .env
# 生产环境务必修改所有 secret

# 3. 启动所有服务
docker compose up -d --build

# 4. 初始化数据库
docker compose exec api npx prisma db push --accept-data-loss
docker compose exec api npx prisma db seed

# 5. 验证
curl http://localhost:3001/api/v1/    # API 健康检查
open http://localhost:3000            # 管理后台
open http://localhost:3002            # H5 移动端
```

### 服务端口

| 服务 | 端口 | 说明 |
|---|---|---|
| API | `3001` | NestJS 后端 |
| Admin Web | `3000` | Next.js 管理后台 |
| H5 | `3002` | 移动端网页 |
| PostgreSQL | `5432` | 数据库 |
| Redis | `6379` | 任务队列 |

### 默认管理员账号

- 邮箱：`admin@campuslove.com`（seed 默认值，沿用旧品牌；由 `SEED_ADMIN_EMAIL` 覆盖）
- 密码：`Admin@123456`（由 `SEED_ADMIN_PASSWORD` 覆盖）

> 生产环境两项均通过环境变量设置（线上实际为 `admin@unimatcha.ai`），
> 切勿使用上述默认值部署。

---

## 开发模式

### 后端 API

```bash
cd apps/api
cp ../../.env.example .env    # 修改 DATABASE_URL 为本地数据库
npm install
npx prisma db push
npx prisma db seed
npm run start:dev             # http://localhost:3001
```

### 管理后台

```bash
cd apps/admin-web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local
npm run dev                   # http://localhost:3000
```

### H5 移动端

H5 现已迁移为 **Vite + ES Modules** 工程（不再是单文件）。开发与构建：

```bash
cd apps/h5
npm install
npm run dev                   # 开发服务器 http://localhost:3002（热更新）
npm run build                 # 产物输出到 dist/
npm run preview               # 本地预览生产构建
```

源码结构：`index.html` 仅为外壳，逻辑位于 `src/`：`state.js`（共享状态 `S`）、
`modules/*.js`（按领域拆分的 122 个函数，统一挂载到 `window` 以兼容内联 `onclick`）、
`styles/main.css`（全局样式）。Tailwind 仍通过 CDN 加载，无需额外构建。

H5 会自动连接 `http://{当前域名}:3001/api/v1`，确保 API 在同一主机运行。

---

## 部署

### 生产部署

```bash
# 修改 .env 中所有 secret（务必！）
nano .env

# 构建并启动
docker compose up -d --build

# 初始化数据库
docker compose exec api npx prisma db push --accept-data-loss
docker compose exec api npx prisma db seed

# 查看日志
docker compose logs -f api
```

### 重建单个服务

```bash
docker compose build --no-cache api && docker compose up -d api
docker compose build --no-cache h5 && docker compose up -d h5
docker compose build --no-cache admin-web && docker compose up -d admin-web
```

### 环境变量说明

| 变量 | 说明 | 生产要求 |
|---|---|---|
| `JWT_SECRET` | 用户 JWT 密钥 | ≥ 32 位随机字符串 |
| `ADMIN_JWT_SECRET` | 管理员 JWT 密钥 | ≥ 32 位，与上方不同 |
| `POSTGRES_PASSWORD` | 数据库密码 | 强密码 |
| `SEED_ADMIN_PASSWORD` | 初始管理员密码 | 强密码，首次部署后建议修改 |
| `NEXTAUTH_SECRET` | NextAuth 密钥 | ≥ 32 位随机字符串 |

### 图片持久化

图片通过 Docker named volume `uploads_data` 持久存储，重建容器后不丢失：

```yaml
# docker-compose.yml（已配置）
volumes:
  uploads_data:

services:
  api:
    volumes:
      - uploads_data:/app/uploads
```

### Schema 变更

```bash
# 推送 Schema 变更（开发 / MVP）
docker compose exec api npx prisma db push --accept-data-loss

# 查看数据库
docker compose exec api npx prisma studio
```

### 搜索索引（pg_trgm）

搜索依赖 `pg_trgm` 扩展与一组 GIN 索引。这些**无法用 Prisma schema 声明**（本项目走 `db push` 而非
migrate），因此由幂等脚本 `apps/api/prisma/ensure-search-indexes.ts` 补齐，已接入容器启动链，
正常部署无需手动操作：

```bash
# 启动链：db push → ensure-search-indexes → seed → 启动
# 需要时也可单独重跑（幂等，可重复执行）
docker compose exec api node dist/prisma/ensure-search-indexes.js
```

**权限要求**：建扩展需要 DB 用户具备 `CREATE EXTENSION` 权限（自建 Postgres 的 superuser 默认有；
部分托管数据库需要先在控制台启用 pg_trgm）。

**没有权限也不会挂**：脚本吞异常不阻断启动，运行时 `PrismaService.hasTrgm()` 探测一次并缓存，
缺扩展时自动去掉 SQL 里的 `similarity()` 模糊分量、降级为无索引的纯 `ILIKE`——
搜索功能仍可用（少了错别字容错），只是大数据量下会变慢。日志会打印
`pg_trgm not installed — search falls back to unranked ILIKE`。

验证扩展与索引是否就位：

```bash
docker compose exec postgres psql -U unimatcha -d unimatcha \
  -c "SELECT extname FROM pg_extension WHERE extname='pg_trgm';" \
  -c "SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_%' ORDER BY 1;"
```

---

## AI 匹配接入点

### 替换步骤（仅改 2 个文件）

**Step 1**：实现 `apps/api/src/matching/providers/match-model.interface.ts`

```typescript
// apps/api/src/matching/providers/my-ai-model.provider.ts
import { Injectable } from '@nestjs/common';
import { MatchModelProvider, CandidateProfile, MatchResult } from './match-model.interface';

@Injectable()
export class MyAIModelProvider implements MatchModelProvider {
  async generateMatches(candidates: CandidateProfile[]): Promise<MatchResult> {
    const response = await fetch('https://your-ai-service.com/match', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ candidates }),
    });
    return response.json();
  }
}
```

**Step 2**：在 `apps/api/src/matching/matching.module.ts` 替换 Provider：

```typescript
// 将
{ provide: MATCH_MODEL_PROVIDER, useClass: StubMatchModelProvider }
// 改为
{ provide: MATCH_MODEL_PROVIDER, useClass: MyAIModelProvider }
```

### 接口格式

```typescript
interface CandidateProfile {
  userId: string;
  gender: string;
  genderPref: string;
  age: number;
  city: string;
  school: string;
  interests: string[];
  answers: { questionId: string; questionType: string; value: any }[];
}

interface MatchResult {
  pairs: { userAId: string; userBId: string; score: number; metadata?: any }[];
  unmatched: string[];
  modelVersion?: string;
  processingTimeMs?: number;
}
```

---

## H5 功能总览

| 模块 | 功能 |
|---|---|
| 启动 | Splash 动画过渡 |
| 注册 / 登录 | 邮箱密码认证 |
| **匹配**（3-Tab 导航之一：匹配 / 广场 / 我的） | 加入匹配池 → 匹配中动画（含周五倒计时）→ 周五 17:00 弹窗公布结果 → 永久展示配对信息 |
| **广场** | 双列瀑布流（推荐 + 校园墙双页横滑）；帖子详情、翻页图片、楼中楼评论；发布图文 / 匿名 / 投票帖 |
| **广场搜索** | 按标题 / 正文 / 标签检索（中英文均可），结果顶部并列展示搜到的同学 |
| **猜你喜欢** | 推荐流按点赞与评论历史个性化重排（行为不足 3 次不介入，避免冷启动劣化） |
| **搜索与发现** | 搜会话 / 找同学（昵称·学校·专业·城市·标签·连接码）/ 可能认识的人（带推荐理由、可忽略、可一键加好友） |
| **聊天** | 配对后专属聊天室，微信风格气泡 |
| **我的** | 小红书风格个人主页；编辑资料、头像、封面；恋爱积分展示；社交链接；退出 |
| 通知中心 | 全局右上角通知铃；匹配结果、点赞、评论通知 |
| 排行榜 | 恋爱时长 / 恋爱积分双榜 |
| 他人主页 | 查看对象完整公开资料（含标签、简介、社交链接）|

---

## 常见问题

**Q: Docker 启动后 API 报 "database not ready"**
```bash
docker compose restart api
# 等待 postgres 健康检查通过（约 10-20s）
```

**Q: H5 显示 "fail to fetch"**
```bash
docker compose build --no-cache api && docker compose up -d api
```

**Q: 图片上传后重建容器图片消失**

确认 `docker-compose.yml` 中 `uploads_data` named volume 已配置，且 API 服务的 volumes 中挂载了 `/app/uploads`。

**Q: 广场帖子只有在 relationship 状态下才能发布**

这是设计约束，只有配对成功的情侣才能在广场发布动态。

**Q: 如何手动触发本周匹配？**

管理后台 → 匹配管理 → 点击"手动触发匹配"。或通过 API：
```bash
curl -X POST http://localhost:3001/api/v1/admin/matching/jobs/trigger \
  -H "Authorization: Bearer <admin_token>"
```

**Q: 如何修改匹配执行时间（Cron）？**

管理后台 → 匹配管理 → 编辑 Cron 表达式。例如每周五 17:00 执行：`0 17 * * 5`

**Q: 排行榜为空**

需要有 relationship 状态的情侣对。完整测试流程：注册两用户 → 完善资料和问卷 → 都加入匹配池 → 管理后台手动触发匹配 → 双方确认 → 排行榜出现数据。

**Q: 如何添加新的 Profile 字段？**

1. 修改 `apps/api/prisma/schema.prisma` 的 `Profile` 模型
2. `docker compose exec api npx prisma db push --accept-data-loss`
3. 更新 `profiles.service.ts` 和对应 DTO
4. 更新 H5：`apps/h5/index.html` 的表单标记 + `apps/h5/src/modules/profile.js` 的渲染逻辑

**Q: 匹配任务失败怎么办？**

管理后台 → 匹配管理 → 找到失败任务 → 点击"重试"。任务默认失败后自动重试 3 次（指数退避）。
