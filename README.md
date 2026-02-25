# Campus Love 💕

> 大学生长期恋爱匹配平台 · MVP v1.0

一个面向大学生、主打"长期恋爱关系"的完整系统，包含 iOS App、Web 管理后台和后端 API。

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
┌─────────────────────────────────────────────────────────────┐
│                          Client Layer                        │
│   iOS App (SwiftUI)          Admin Web (Next.js)            │
│   - 注册/登录                  - 管理员登录                   │
│   - 填写资料/问卷              - 问卷 CRUD                   │
│   - 查看匹配结果               - 用户管理                    │
│                               - 匹配任务管理                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API (JWT)
┌──────────────────────▼──────────────────────────────────────┐
│                      API Server (NestJS)                     │
│  AuthModule  UsersModule  ProfilesModule  QuestionnaireModule│
│  AnswersModule  MatchingModule  AdminModule                  │
│                                                             │
│  ┌─────────────────────┐    ┌──────────────────────────┐   │
│  │   BullMQ Queue      │    │   MatchModelProvider      │   │
│  │   (match-queue)     │    │   (Stub → 替换为 AI)     │   │
│  └──────────┬──────────┘    └──────────────────────────┘   │
│             │ Job Processing                                 │
│  ┌──────────▼──────────┐                                    │
│  │   MatchProcessor    │                                    │
│  └─────────────────────┘                                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
    ┌─────────────┴────────────┐
    │                          │
┌───▼────────┐         ┌───────▼──────┐
│ PostgreSQL │         │    Redis     │
│ (数据存储) │         │  (任务队列)  │
└────────────┘         └──────────────┘
```

**关键设计决策：**

1. **AI 匹配解耦**：通过 `MatchModelProvider` 接口隔离 AI 逻辑，MVP 用 Stub 实现，替换时只改一个文件
2. **问卷版本化**：问卷有版本号，用户提交时记录版本，旧答案永久保留
3. **双 JWT 体系**：用户 token 与管理员 token 使用不同 secret，互不干扰
4. **BullMQ 队列**：匹配任务异步执行，支持失败重试，不阻塞 API
5. **状态机**：用户 mode: `MATCH_MODE → RELATIONSHIP_MODE`，匹配 status: `MATCHED → RELATIONSHIP_MODE → DISSOLVED`

---

## 技术栈选型

| 层 | 技术 | 原因 |
|---|---|---|
| iOS | Swift + SwiftUI + MVVM | 苹果官方推荐，声明式 UI，易维护 |
| 后端 | NestJS + TypeScript | 模块化强，DI 容器，与 TS 全栈一致 |
| 数据库 | PostgreSQL + Prisma | 类型安全 ORM，迁移管理，关系型适合此业务 |
| 队列 | BullMQ + Redis | 生产级任务队列，支持重试、延迟、并发控制 |
| 管理后台 | Next.js 14 + Tailwind | App Router，SSR 友好，UI 高效 |
| 认证 | JWT (RS256 可升级) | 无状态，iOS/Web 通用 |

---

## 目录结构

```
campus-love/
├── apps/
│   ├── api/                          # NestJS 后端
│   │   ├── src/
│   │   │   ├── auth/                 # 用户 & 管理员认证
│   │   │   ├── users/                # 用户管理
│   │   │   ├── profiles/             # 用户资料
│   │   │   ├── questionnaire/        # 问卷版本管理
│   │   │   ├── answers/              # 用户答案
│   │   │   ├── matching/             # 匹配引擎
│   │   │   │   └── providers/        # AI 接入点（Stub + 接口定义）
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
│   └── ios/CampusLove/               # Swift iOS App
│       ├── App/                      # 入口 & 路由
│       ├── Models/                   # 数据模型
│       ├── Network/                  # API Client & Services
│       ├── ViewModels/               # MVVM ViewModels
│       └── Views/                    # SwiftUI Views
│           ├── Auth/                 # 登录/注册
│           ├── Onboarding/           # 引导流程
│           └── Matching/             # 匹配主页
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 数据库 ERD

```
users ──────────── profiles (1:1)
  │
  ├── answers[] ──── questionnaire_versions (N:1)
  │                    │
  │                    └── questions[] ──── question_options[]
  │
  ├── matchesAsUserA[] ──┐
  └── matchesAsUserB[] ──┼── matches ──── match_jobs (N:1)
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
| `profiles` | 用户资料，可扩展 extraData JSON 字段 |
| `questionnaire_versions` | 问卷版本，支持多版本共存 |
| `questions` | 题目（支持4种题型）|
| `question_options` | 单/多选题选项 |
| `answers` | 用户答案，unique(userId, versionId, questionId) |
| `match_jobs` | 匹配任务批次 |
| `matches` | 匹配结果，含 score 和 metadata |
| `match_configs` | 匹配 Cron 表达式配置 |
| `system_configs` | 公开字段配置等全局 KV |

---

## API 文档

所有 API 均以 `/api/v1` 为前缀。

### 用户认证

```
POST /auth/register       注册
POST /auth/login          登录

POST /admin/auth/login    管理员登录
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
    "token": "eyJ..."
  }
}
```

### 用户资料

```
GET  /profiles/me         获取我的资料
PUT  /profiles/me         创建/更新资料（需 Bearer Token）
```

**更新资料请求：**
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
  "bio": "喜欢发呆，在城市里找角落..."
}
```

### 问卷

```
GET  /questionnaire/active          获取当前激活问卷（含题目）
POST /answers                       提交问卷答案
GET  /answers/mine                  获取我的答案
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

### 匹配状态

```
GET /users/me/match-status    获取当前模式 & 下次匹配时间
GET /matching/result          获取匹配结果（含对方公开资料）
```

**匹配结果响应（已匹配）：**
```json
{
  "matched": true,
  "matchId": "clxxx",
  "status": "RELATIONSHIP_MODE",
  "matchedAt": "2025-03-01T20:00:00Z",
  "partner": {
    "nickname": "晨曦",
    "school": "清华大学",
    "grade": "大三",
    "age": 21,
    "city": "北京",
    "interests": ["读书", "旅行"]
  }
}
```

### 管理员 API（需 Admin Bearer Token）

```
# 仪表盘
GET  /admin/dashboard

# 用户管理
GET    /admin/users                 列表（支持 search/status/page/limit 参数）
GET    /admin/users/:id             详情（含答题记录）
PATCH  /admin/users/:id/status      封禁/解封 { "status": "BANNED" }
PATCH  /admin/users/:id/reset-mode  重置模式

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
POST /admin/matching/jobs/trigger     手动触发
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

# 4. 等待服务就绪后初始化数据库
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed

# 5. 验证服务
curl http://localhost:3001/api/v1/   # API
open http://localhost:3000           # 管理后台
open http://localhost:3001/api/docs  # Swagger 文档
```

**默认管理员账号：**
- 邮箱：`admin@campuslove.com`
- 密码：`Admin@123456`

---

## 开发模式

### 后端 API

```bash
cd apps/api
cp ../../.env.example .env  # 修改为本地数据库地址
npm install
npx prisma migrate dev       # 创建数据库表
npx prisma db seed           # 初始化数据
npm run start:dev            # 启动开发服务器
```

> Swagger 文档：http://localhost:3001/api/docs

### 管理后台

```bash
cd apps/admin-web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local
npm run dev
```

> 访问：http://localhost:3000

### iOS App

1. 打开 Xcode，按照 `apps/ios/CampusLove.xcodeproj/README_SETUP.md` 创建项目
2. 将 `apps/ios/CampusLove/` 下所有 Swift 文件添加到项目
3. 在 Info.plist 配置 `API_BASE_URL = http://localhost:3001/api/v1`
4. Command+R 运行

---

## 测试

### 后端单元测试

```bash
cd apps/api
npm test              # 运行所有测试
npm run test:cov      # 运行并生成覆盖率报告
npm run test:watch    # 监听模式
```

**测试覆盖：**
- `auth.service.spec.ts`：注册/登录/密码哈希验证/封禁用户拦截
- `questionnaire.service.spec.ts`：问卷创建/发布/版本号自增
- `matching.service.spec.ts`：任务触发/并发锁/AI 模型调用/匹配结果存储

### 手动 API 测试（Curl）

```bash
# 注册
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@univ.edu","password":"Test@12345"}'

# 登录获取 token
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@univ.edu","password":"Test@12345"}' | jq -r '.data.token')

# 获取问卷
curl http://localhost:3001/api/v1/questionnaire/active \
  -H "Authorization: Bearer $TOKEN"
```

---

## 部署

### 生产环境 Docker Compose

```bash
# 修改 .env 中所有 secret（务必！）
nano .env

# 构建并启动
docker compose -f docker-compose.yml up -d --build

# 检查日志
docker compose logs -f api
```

### 环境变量说明

| 变量 | 说明 | 生产要求 |
|---|---|---|
| `JWT_SECRET` | 用户 JWT 密钥 | ≥32位随机字符串 |
| `ADMIN_JWT_SECRET` | 管理员 JWT 密钥 | ≥32位随机字符串，与上方不同 |
| `POSTGRES_PASSWORD` | 数据库密码 | 强密码 |
| `SEED_ADMIN_PASSWORD` | 初始管理员密码 | 强密码，首次部署后建议在后台修改 |

### 数据库迁移

```bash
# 生产迁移（不丢数据）
docker compose exec api npx prisma migrate deploy

# 查看迁移状态
docker compose exec api npx prisma migrate status
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
    // 调用你的 AI 服务
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
  gender: string;          // male/female/non_binary
  genderPref: string;      // male/female/any
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

## 常见问题

**Q: Docker 启动后 API 报 "database not ready"**
```bash
docker compose restart api
# 或等待 postgres 健康检查通过（约 10-20s）
```

**Q: 如何修改匹配频率？**
在管理后台 → 匹配管理 → 编辑 Cron 表达式：
- 每周三晚 8 点：`0 20 * * 3`
- 每天晚 9 点：`0 21 * * *`
- 每周五晚 8 点：`0 20 * * 5`

**Q: iOS 连接本地 API 失败**
- macOS Monterey 以上：将 `localhost` 改为你电脑的局域网 IP（如 `192.168.1.10`）
- 或在 Info.plist 中允许 HTTP（见 iOS 设置说明）

**Q: 如何添加新的 Profile 字段？**
1. 修改 `prisma/schema.prisma` 的 `Profile` 模型
2. `npx prisma migrate dev --name add_profile_field`
3. 更新 `ProfilesService` 的 `calcCompleteness` 函数
4. 在管理后台 Configs 中更新 `public_profile_fields`
5. 更新 iOS `CreateProfileRequest` 和 `ProfileSetupView`

**Q: 匹配任务执行失败怎么办？**
在管理后台 → 匹配管理 → 找到失败任务 → 点击"重试"按钮。
任务默认失败后自动重试 3 次（指数退避）。

