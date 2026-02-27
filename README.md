# Campus Love 💕

> 大学生长期恋爱匹配平台 · v1.1

面向大学生、主打"长期恋爱关系"的全栈匹配系统，包含 iOS App、H5 移动端、Web 管理后台和 NestJS 后端 API。

---

## 目录

- [总体架构](#总体架构)
- [技术栈选型](#技术栈选型)
- [目录结构](#目录结构)
- [数据库 ERD](#数据库-erd)
- [API 文档](#api-文档)
- [快速开始](#快速开始)
- [开发模式](#开发模式)
- [测试](#测试)
- [部署](#部署)
- [AI 匹配接入点](#ai-匹配接入点)
- [常见问题](#常见问题)

---

## 总体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                          Client Layer                            │
│                                                                  │
│  iOS App (SwiftUI)     H5 Mobile (SPA)     Admin Web (Next.js)  │
│  - 注册/登录           - 注册/登录          - 管理员登录          │
│  - 填写资料/问卷       - 填写资料/问卷      - 问卷 CRUD           │
│  - 开始匹配            - 开始匹配           - 用户管理            │
│  - 排行榜              - 排行榜             - 匹配任务管理         │
│  - 社交链接管理        - 社交链接管理       - 排行榜数据           │
│  - 对方公开主页        - 对方公开主页                             │
└───────────────────────────┬──────────────────────────────────────┘
                            │ REST API (JWT)
┌───────────────────────────▼──────────────────────────────────────┐
│                      API Server (NestJS)                         │
│                                                                  │
│  AuthModule   UsersModule   ProfilesModule   QuestionnaireModule │
│  AnswersModule   MatchingModule   LeaderboardModule   AdminModule│
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────────────┐        │
│  │   BullMQ Queue      │    │   MatchModelProvider      │        │
│  │   (match-queue)     │    │   (Stub → 替换为 AI)     │        │
│  └──────────┬──────────┘    └──────────────────────────┘        │
│             │ Job Processing                                     │
│  ┌──────────▼──────────┐                                        │
│  │   MatchProcessor    │                                        │
│  └─────────────────────┘                                        │
└─────────────────┬────────────────────────────────────────────────┘
                  │
    ┌─────────────┴────────────┐
    │                          │
┌───▼────────┐         ┌──────▼───────┐
│ PostgreSQL │         │    Redis     │
│ (数据存储) │         │  (任务队列)  │
└────────────┘         └──────────────┘
```

**关键设计决策：**

1. **AI 匹配解耦**：通过 `MatchModelProvider` 接口隔离 AI 逻辑，MVP 用 Stub 实现，替换时只改一个文件
2. **问卷版本化**：问卷有版本号，用户提交时记录版本，旧答案永久保留
3. **双 JWT 体系**：用户 token 与管理员 token 使用不同 secret，互不干扰
4. **BullMQ 队列**：匹配任务异步执行，支持失败重试，不阻塞 API
5. **匹配状态机**：`idle → searching → matched → relationship`，用户主动触发匹配
6. **社交链接**：JSON 字段存储（微信/QQ/小红书/微博/Instagram），灵活扩展
7. **排行榜系统**：恋爱时长排行 + 恋爱积分排行，双榜并行

---

## 技术栈选型

| 层 | 技术 | 原因 |
|---|---|---|
| iOS | Swift + SwiftUI + MVVM | 苹果官方推荐，声明式 UI，易维护 |
| H5 移动端 | 原生 HTML/CSS/JS (SPA) | 零依赖，nginx 静态托管，开箱即用 |
| 后端 | NestJS + TypeScript | 模块化强，DI 容器，与 TS 全栈一致 |
| 数据库 | PostgreSQL + Prisma | 类型安全 ORM，迁移管理，关系型适合此业务 |
| 队列 | BullMQ + Redis | 生产级任务队列，支持重试、延迟、并发控制 |
| 管理后台 | Next.js 14 + Tailwind | App Router，SSR 友好，UI 高效 |
| 认证 | JWT (RS256 可升级) | 无状态，iOS/Web/H5 通用 |
| 容器化 | Docker Compose | 一键启动全部 5 个服务 |

---

## 目录结构

```
campus-love/
├── apps/
│   ├── api/                          # NestJS 后端 API
│   │   ├── src/
│   │   │   ├── auth/                 # 用户 & 管理员认证
│   │   │   ├── users/                # 用户管理 (含 PUT /users/me)
│   │   │   ├── profiles/             # 用户资料 (含社交链接)
│   │   │   ├── questionnaire/        # 问卷版本管理
│   │   │   ├── answers/              # 用户答案
│   │   │   ├── matching/             # 匹配引擎 (含状态机)
│   │   │   │   └── providers/        # AI 接入点（Stub + 接口定义）
│   │   │   ├── leaderboard/          # 排行榜模块（时长 + 积分）
│   │   │   ├── admin/                # 管理后台 API
│   │   │   ├── prisma/               # DB 服务
│   │   │   └── common/               # 公共装饰器/过滤器/守卫
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # 数据库 Schema
│   │   │   └── seed.ts               # 初始数据
│   │   └── Dockerfile
│   │
│   ├── admin-web/                    # Next.js 管理后台
│   │   └── src/app/
│   │       ├── login/                # 登录页
│   │       ├── (dashboard)/
│   │       │   ├── dashboard/        # 数据概览
│   │       │   ├── users/            # 用户管理
│   │       │   ├── questionnaire/    # 问卷管理
│   │       │   ├── matching/         # 匹配管理
│   │       │   └── relationship/     # 恋爱模式（预留）
│   │       └── lib/                  # API Client
│   │
│   ├── h5/                           # H5 移动端 (单文件 SPA)
│   │   ├── index.html                # 完整 H5 应用
│   │   ├── Dockerfile                # nginx 托管
│   │   └── nginx.conf
│   │
│   └── ios/CampusLove/               # Swift iOS App
│       ├── App/                      # 入口 & 路由
│       │   └── RootView.swift        # 根视图 (含 Splash)
│       ├── Models/                   # 数据模型
│       │   └── User.swift            # User, Profile, Match, Leaderboard
│       ├── Network/                  # API Client & Services
│       │   ├── APIClient.swift       # 基础网络层
│       │   ├── AuthService.swift     # 认证
│       │   ├── MatchingService.swift  # 匹配 (start/status/confirm/reject)
│       │   ├── ProfileService.swift   # 资料 (含公开主页)
│       │   └── LeaderboardService.swift # 排行榜
│       ├── ViewModels/               # MVVM ViewModels
│       │   ├── MatchingViewModel.swift  # 匹配状态机
│       │   ├── ProfileViewModel.swift   # 资料编辑
│       │   └── LeaderboardViewModel.swift # 排行榜
│       └── Views/                    # SwiftUI Views
│           ├── Auth/                 # 登录/注册
│           ├── Onboarding/           # 引导流程
│           ├── Splash/               # 启动动画
│           │   └── SplashView.swift
│           ├── Main/                 # 主页框架
│           │   └── MainTabView.swift  # 3-Tab (匹配/排行/我的)
│           ├── Matching/             # 匹配相关
│           │   ├── MatchTabView.swift     # 匹配主页
│           │   └── PartnerProfileView.swift # 对方公开主页
│           ├── Leaderboard/          # 排行榜
│           │   └── LeaderboardTabView.swift
│           ├── Profile/              # 个人中心
│           │   ├── ProfileTabView.swift   # 我的主页
│           │   ├── ProfileEditView.swift  # 编辑资料
│           │   └── SettingsView.swift     # 设置
│           └── Placeholder/          # 预留页面
│               └── RelationshipModeView.swift
│
├── packages/shared/                  # 共享类型/工具
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 数据库 ERD

```
users ──────────── profiles (1:1)
  │                  ├── socialLinks (JSON)
  │                  └── relationshipScore (Float)
  │
  ├── answers[] ──── questionnaire_versions (N:1)
  │                    │
  │                    └── questions[] ──── question_options[]
  │
  ├── matchesAsUserA[] ──┐
  └── matchesAsUserB[] ──┼── matches
                         │     ├── score
                         │     ├── status
                         │     ├── relationshipStartedAt
                         │     └── match_jobs (N:1)
                         │
                         └── (userA + userB status → UserMode)

admin_users (独立)
match_configs (调度配置)
system_configs (key-value 全局配置)
```

**核心表说明：**

| 表 | 说明 |
|---|---|
| `users` | 普通用户，含 mode 字段（MATCH_MODE / RELATIONSHIP_MODE）|
| `admin_users` | 管理员，独立权限体系 |
| `profiles` | 用户资料，含 socialLinks (JSON) 和 relationshipScore |
| `questionnaire_versions` | 问卷版本，支持多版本共存 |
| `questions` | 题目（支持4种题型：单选/多选/量表/文本）|
| `question_options` | 单/多选题选项 |
| `answers` | 用户答案，unique(userId, versionId, questionId) |
| `match_jobs` | 匹配任务批次 |
| `matches` | 匹配结果，含 score、metadata、relationshipStartedAt |
| `match_configs` | 匹配 Cron 表达式配置 |
| `system_configs` | 公开字段配置等全局 KV |

---

## API 文档

所有 API 均以 `/api/v1` 为前缀。需要认证的接口须在 Header 中附带 `Authorization: Bearer <token>`。

### 用户认证

```
POST /auth/register              注册
POST /auth/login                 登录
POST /admin/auth/login           管理员登录
```

**注册请求：**
```json
{ "email": "user@univ.edu", "password": "Password@123" }
```
**响应：**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "mode": "MATCH_MODE" },
    "accessToken": "eyJ..."
  }
}
```

### 用户资料

```
GET  /profiles/me                获取我的资料
PUT  /profiles/me                创建/更新资料
GET  /users/me                   获取当前用户信息
PUT  /users/me                   更新个人资料（含社交链接）
GET  /users/:id/public-profile   获取他人公开主页
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

**公开主页响应：**
```json
{
  "userId": "clxxx",
  "nickname": "晓月",
  "school": "北京大学",
  "grade": "大三",
  "age": 21,
  "city": "北京",
  "interests": ["音乐", "摄影"],
  "bio": "喜欢发呆...",
  "socialLinks": { "wechat": "xiaoyue_wx", "qq": "1234567890" },
  "relationshipScore": 85.5
}
```

### 问卷

```
GET  /questionnaire/active       获取当前激活问卷（含题目）
POST /answers                    提交问卷答案
GET  /answers/mine               获取我的答案
```

**提交答案请求：**
```json
{
  "questionnaireVersionId": "clxxx",
  "answers": [
    { "questionId": "q1", "value": "introvert" },
    { "questionId": "q2", "value": 4 },
    { "questionId": "q3", "value": ["humor", "gentle"] },
    { "questionId": "q6", "value": "自由 真诚 温暖" }
  ]
}
```

### 匹配系统

```
POST /matching/start             开始匹配（用户主动触发）
GET  /matching/status            获取匹配状态（状态机）
GET  /matching/result            获取匹配结果（兼容旧版）
POST /matching/confirm           确认匹配
POST /matching/reject            拒绝匹配
POST /matching/dissolve          解除恋爱关系
```

**匹配状态响应（状态机）：**

```json
// idle 状态
{
  "state": "idle",
  "matchConfig": { "nextMatchTime": "2026-03-01T20:00:00Z" }
}

// searching 状态
{
  "state": "searching"
}

// matched 状态
{
  "state": "matched",
  "match": {
    "matchId": "clxxx",
    "score": 85,
    "myConfirmed": false,
    "partnerConfirmed": false
  },
  "partner": {
    "userId": "clyyy",
    "nickname": "晨曦",
    "school": "清华大学",
    "interests": ["读书", "旅行"]
  }
}

// relationship 状态
{
  "state": "relationship",
  "match": {
    "matchId": "clxxx",
    "score": 85,
    "relationshipStartedAt": "2026-02-20T12:00:00Z"
  },
  "partner": { "userId": "clyyy", "nickname": "晨曦" }
}
```

### 排行榜

```
GET /leaderboard/duration?limit=20    恋爱时长排行榜
GET /leaderboard/score?limit=20       恋爱积分排行榜
```

**时长排行响应：**
```json
[
  {
    "rank": 1,
    "coupleA": { "nickname": "Alice", "school": "北京大学" },
    "coupleB": { "nickname": "Bob", "school": "清华大学" },
    "durationDays": 120
  }
]
```

**积分排行响应：**
```json
[
  {
    "rank": 1,
    "coupleA": { "nickname": "Alice", "school": "北京大学" },
    "coupleB": { "nickname": "Bob", "school": "清华大学" },
    "avgScore": 92.5
  }
]
```

### 管理员 API（需 Admin Bearer Token）

```
# 仪表盘
GET  /admin/dashboard

# 用户管理
GET    /admin/users                          列表（支持 search/status/page/limit）
GET    /admin/users/:id                      详情（含答题、社交链接、恋爱积分）
PATCH  /admin/users/:id/status               封禁/解封
PATCH  /admin/users/:id/reset-mode           重置模式

# 问卷管理
GET    /admin/questionnaire/versions              版本列表
GET    /admin/questionnaire/versions/:id          版本详情
POST   /admin/questionnaire/versions              新建版本
POST   /admin/questionnaire/versions/:id/publish  发布版本
POST   /admin/questionnaire/versions/:vId/questions     添加题目
PUT    /admin/questionnaire/questions/:id               更新题目
DELETE /admin/questionnaire/questions/:id               删除题目
PATCH  /admin/questionnaire/questions/:id/toggle        启用/禁用
PATCH  /admin/questionnaire/versions/:vId/questions/reorder  排序

# 匹配管理
GET  /admin/matching/config           获取匹配配置
PUT  /admin/matching/config           更新 Cron 配置
POST /admin/matching/jobs/trigger     手动触发匹配
GET  /admin/matching/jobs             任务列表
GET  /admin/matching/jobs/:id         任务详情 & 结果
POST /admin/matching/jobs/:id/retry   重试失败任务
GET  /admin/matching/results          所有匹配结果
```

---

## 快速开始

### 前置要求

- Docker & Docker Compose
- Node.js >= 20 (本地开发)
- Xcode >= 15 (iOS 开发)

### 一键启动（Docker）

```bash
# 1. 克隆项目
git clone <repo-url> campus-love
cd campus-love

# 2. 复制环境配置
cp .env.example .env
# 根据需要修改 .env（生产环境务必修改所有 secret）

# 3. 启动所有服务
docker compose up -d

# 4. 等待服务就绪后同步数据库
docker compose exec api npx prisma db push --accept-data-loss
docker compose exec api npx prisma db seed

# 5. 验证服务
curl http://localhost:3001/api/v1/         # API 健康检查
open http://localhost:3000                 # 管理后台
open http://localhost:3002                 # H5 移动端
```

### 服务端口一览

| 服务 | 端口 | 说明 |
|---|---|---|
| API | `3001` | NestJS 后端 |
| Admin Web | `3000` | Next.js 管理后台 |
| H5 | `3002` | 移动端网页 |
| PostgreSQL | `5432` | 数据库 |
| Redis | `6379` | 任务队列 & 缓存 |

### 默认管理员账号

- 邮箱：`admin@campuslove.com`
- 密码：`Admin@123456`

---

## 开发模式

### 后端 API

```bash
cd apps/api
cp ../../.env.example .env    # 修改 DATABASE_URL 为本地数据库地址
npm install
npx prisma db push            # 同步数据库 Schema
npx prisma db seed            # 初始化数据
npm run start:dev             # 启动开发服务器 (http://localhost:3001)
```

### 管理后台

```bash
cd apps/admin-web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local
npm run dev                   # 启动开发服务器 (http://localhost:3000)
```

### H5 移动端

H5 是纯静态单文件 SPA，开发时可直接用浏览器打开 `apps/h5/index.html`，或用任意静态服务器：

```bash
cd apps/h5
npx serve .                   # 或 python3 -m http.server 8080
```

> H5 会自动连接 `http://{当前域名}:3001/api/v1`，确保 API 在同一主机上运行。

### iOS App

1. 用 Xcode 打开 `apps/ios/CampusLove.xcodeproj`
2. 修改 `APIClient.swift` 中的 `baseURL` 为你的局域网 IP（如 `http://192.168.1.10:3001/api/v1`）
3. 选择模拟器或真机，Command+R 运行

---

## 测试

### 手动 API 测试（Curl）

```bash
# 注册用户
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"Test@12345"}'

# 登录获取 token
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"Test@12345"}' | jq -r '.data.accessToken // .data.token')

# 完善资料（含社交链接）
curl -X PUT http://localhost:3001/api/v1/profiles/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nickname": "Alice",
    "school": "清华大学",
    "grade": "大二",
    "age": 20,
    "gender": "female",
    "genderPref": "male",
    "city": "北京",
    "interests": ["阅读", "音乐"],
    "bio": "热爱学习",
    "socialLinks": {"wechat": "alice_wx", "qq": "12345"}
  }'

# 获取问卷
curl http://localhost:3001/api/v1/questionnaire/active \
  -H "Authorization: Bearer $TOKEN"

# 开始匹配
curl -X POST http://localhost:3001/api/v1/matching/start \
  -H "Authorization: Bearer $TOKEN"

# 查看匹配状态
curl http://localhost:3001/api/v1/matching/status \
  -H "Authorization: Bearer $TOKEN"

# 查看排行榜
curl http://localhost:3001/api/v1/leaderboard/duration?limit=10 \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:3001/api/v1/leaderboard/score?limit=10 \
  -H "Authorization: Bearer $TOKEN"

# 查看他人主页
curl http://localhost:3001/api/v1/users/USER_ID/public-profile \
  -H "Authorization: Bearer $TOKEN"
```

### 完整匹配流程测试

要测试完整匹配流程，需要至少两个用户：

```bash
# 1. 注册两个用户（Alice & Bob）
# 2. 两人都完善资料 + 提交问卷
# 3. 两人分别调用 POST /matching/start
# 4. 管理后台手动触发匹配 或 等待 BullMQ 定时执行
# 5. 两人查看 GET /matching/status（应为 matched）
# 6. 两人分别 POST /matching/confirm
# 7. 双方确认后自动进入 relationship 状态
# 8. 排行榜出现该情侣
```

### 后端单元测试

```bash
cd apps/api
npm test                  # 运行所有测试
npm run test:cov          # 覆盖率报告
npm run test:watch        # 监听模式
```

---

## 部署

### 生产环境 Docker Compose

```bash
# 1. 修改 .env 中所有 secret（务必！）
nano .env

# 2. 构建并启动
docker compose up -d --build

# 3. 同步数据库
docker compose exec api npx prisma db push --accept-data-loss
docker compose exec api npx prisma db seed

# 4. 检查日志
docker compose logs -f api
```

### 重建单个服务

```bash
# 仅重建 API（代码修改后）
docker compose build --no-cache api && docker compose up -d api

# 仅重建 H5
docker compose build --no-cache h5 && docker compose up -d h5

# 仅重建管理后台
docker compose build --no-cache admin-web && docker compose up -d admin-web
```

### 环境变量说明

| 变量 | 说明 | 生产要求 |
|---|---|---|
| `JWT_SECRET` | 用户 JWT 密钥 | ≥32位随机字符串 |
| `ADMIN_JWT_SECRET` | 管理员 JWT 密钥 | ≥32位随机字符串，与上方不同 |
| `POSTGRES_PASSWORD` | 数据库密码 | 强密码 |
| `SEED_ADMIN_PASSWORD` | 初始管理员密码 | 强密码，首次部署后建议在后台修改 |
| `NEXTAUTH_SECRET` | NextAuth 密钥 | ≥32位随机字符串 |

### 数据库 Schema 同步

```bash
# 推送 Schema 变更到数据库（开发/MVP）
docker compose exec api npx prisma db push --accept-data-loss

# 查看当前数据库状态
docker compose exec api npx prisma studio
```

---

## AI 匹配接入点

### 替换步骤（仅需修改 2 个文件）

**Step 1**：实现接口 `apps/api/src/matching/providers/match-model.interface.ts`

```typescript
// 创建 apps/api/src/matching/providers/my-ai-model.provider.ts
import { Injectable } from '@nestjs/common';
import { MatchModelProvider, CandidateProfile, MatchConstraints, MatchResult } from './match-model.interface';

@Injectable()
export class MyAIModelProvider implements MatchModelProvider {
  async generateMatches(
    candidates: CandidateProfile[],
    constraints: MatchConstraints,
  ): Promise<MatchResult> {
    const response = await fetch('https://your-ai-service.com/match', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ candidates, constraints }),
    });
    return response.json();
  }
}
```

**Step 2**：在 `apps/api/src/matching/matching.module.ts` 中替换 Provider：

```typescript
// 将
{ provide: MATCH_MODEL_PROVIDER, useClass: StubMatchModelProvider }
// 改为
{ provide: MATCH_MODEL_PROVIDER, useClass: MyAIModelProvider }
```

### 输入输出格式

```typescript
// 输入：候选人列表
interface CandidateProfile {
  userId: string;
  gender: string;          // male / female / non_binary
  genderPref: string;      // male / female / any
  age: number;
  city: string;
  school: string;
  interests: string[];
  answers: { questionId: string; questionType: string; value: any }[];
}

// 输出：匹配对列表
interface MatchResult {
  pairs: { userAId: string; userBId: string; score: number; metadata?: any }[];
  unmatched: string[];     // 未能匹配的 userId 列表
  modelVersion?: string;
  processingTimeMs?: number;
}
```

---

## 功能总览

### iOS App 功能

| 功能 | 说明 |
|---|---|
| 启动动画 | 1.8秒粉色渐变 + 心形弹跳动画 |
| 注册/登录 | 邮箱密码注册登录 |
| 填写资料 | 昵称、学校、年级、年龄、城市、性别、匹配偏好、兴趣、简介 |
| 匹配问卷 | 支持单选/多选/量表/文本四种题型 |
| 匹配Tab | 开始匹配按钮 → 搜索中 → 匹配成功（确认/拒绝）→ 恋爱模式 |
| 排行榜Tab | 恋爱时长排行 + 恋爱积分排行，可切换 |
| 我的Tab | 个人信息、社交链接展示、编辑资料、设置、退出 |
| 编辑资料 | 全字段编辑 + 社交链接（微信/QQ/小红书/微博/Instagram）|
| 对方主页 | 查看匹配对象的公开资料（含社交链接、恋爱积分）|
| 恋爱模式入口 | 进入恋爱任务/日记/积分（预留）|
| 设置页 | 隐私/通知/账号安全/关于/反馈（预留）|

### H5 移动端功能

| 功能 | 说明 |
|---|---|
| 启动动画 | 1.5秒 Splash 过渡 |
| 注册/登录 | 与 iOS 相同 |
| 3-Tab导航 | 匹配 / 排行榜 / 我的 |
| 匹配状态机 | idle → searching → matched → relationship 四状态 |
| 排行榜 | 恋爱时长 / 恋爱积分 双榜切换 |
| 个人中心 | 资料展示、社交链接、编辑资料、设置入口、退出 |
| 编辑资料 | Overlay 编辑（含社交联系方式）|
| 对方主页 | Overlay 查看公开资料 |

### 管理后台功能

| 功能 | 说明 |
|---|---|
| 仪表盘 | 用户数、匹配数、活跃数等关键指标 |
| 用户管理 | 列表、搜索、详情、封禁/解封、重置模式 |
| 问卷管理 | 版本 CRUD、题目管理、发布/启用控制 |
| 匹配管理 | Cron 配置、手动触发、任务列表、失败重试 |

---

## 常见问题

**Q: Docker 启动后 API 报 "database not ready"**
```bash
docker compose restart api
# 或等待 postgres 健康检查通过（约 10-20s）
```

**Q: H5 显示 "fail to fetch"**
```bash
# API 容器可能未重建，重建后重启
docker compose build --no-cache api && docker compose up -d api
```

**Q: 提交问卷报 "property value should not exist"**
```bash
# 确保 answers/dto/answer.dto.ts 中 value 字段有 @Allow() 装饰器
# 重建 API 容器后生效
```

**Q: 如何修改匹配频率？**

在管理后台 → 匹配管理 → 编辑 Cron 表达式：
- 每周三晚 8 点：`0 20 * * 3`
- 每天晚 9 点：`0 21 * * *`
- 每周五晚 8 点：`0 20 * * 5`

**Q: iOS 连接本地 API 失败**
- 将 `localhost` 改为你电脑的局域网 IP（如 `192.168.1.10`）
- 或在 Info.plist 中添加 App Transport Security 例外允许 HTTP

**Q: 排行榜为空**

需要有进入 RELATIONSHIP_MODE 的情侣对。完整测试流程：注册两个用户 → 都完善资料和问卷 → 都开始匹配 → 管理后台手动触发匹配任务 → 双方确认 → 排行榜出现数据。

**Q: 如何添加新的 Profile 字段？**
1. 修改 `prisma/schema.prisma` 的 `Profile` 模型
2. `docker compose exec api npx prisma db push --accept-data-loss`
3. 更新 `profiles.service.ts` 和 DTO
4. 更新 iOS `User.swift` 和 `CreateProfileRequest`
5. 更新 H5 `index.html` 对应表单

**Q: 匹配任务执行失败怎么办？**

在管理后台 → 匹配管理 → 找到失败任务 → 点击"重试"按钮。任务默认失败后自动重试 3 次（指数退避）。
