# Unimatcha 生产部署手册

整套服务用根目录 `docker-compose.yml` 一键起，Caddy 负责 80/443 与自动 HTTPS（Let's Encrypt）。
域名假定为 **unimatcha.ai**（官网/H5/chat 的 API 地址均按此硬编码或按子域自适应；换域名需全局替换）。

## 架构

| 域名 | 服务 | 容器 |
|---|---|---|
| unimatcha.ai / www | 官网静态站（apps/website，nginx） | unimatcha_website |
| app.unimatcha.ai | H5 应用（apps/h5） | unimatcha_h5 |
| admin.unimatcha.ai | 管理后台（apps/admin-web） | unimatcha_admin |
| api.unimatcha.ai | API（apps/api） | unimatcha_api |
| —（仅内网） | matching-ml 匹配模型 | unimatcha_matching_ml |
| —（仅内网+回环） | PostgreSQL 16 / Redis 7 | unimatcha_postgres / unimatcha_redis |

## 1. Spaceship DNS（一次性）

在 Spaceship 的 DNS 管理里为域名添加 **5 条 A 记录**，全部指向服务器公网 IP：

```
A   @      <服务器IP>
A   www    <服务器IP>
A   app    <服务器IP>
A   admin  <服务器IP>
A   api    <服务器IP>
```

TTL 默认即可。生效通常几分钟，可用 `nslookup api.unimatcha.ai` 验证。
（Caddy 首次启动时会自动为这 5 个域名签发证书，签发要求 DNS 已生效。）

## 2. 服务器准备（一次性）

Ubuntu 22.04+，2GB 内存起步（matching-ml + 三个 Node 构建建议 4GB，或加 swap）：

```bash
# Docker
curl -fsSL https://get.docker.com | sh
# 防火墙只开 22/80/443
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
# 拉代码
git clone https://github.com/pkupig/unipia.git /opt/unimatcha
cd /opt/unimatcha
```

## 3. 生产环境变量

`/opt/unimatcha/.env`（compose 自动读取；**不要提交进 git**）：

```dotenv
# ── 数据库 ──
POSTGRES_USER=campuslove
POSTGRES_PASSWORD=<强随机密码>
POSTGRES_DB=campuslove

# ── 密钥（各自独立的强随机串，openssl rand -hex 32 生成）──
JWT_SECRET=<随机串>
ADMIN_JWT_SECRET=<随机串>
NEXTAUTH_SECRET=<随机串>

# ── 管理员种子账号（首次启动创建 SUPER）──
SEED_ADMIN_EMAIL=admin@unimatcha.ai
SEED_ADMIN_PASSWORD=<强密码，登录后可改>

# ── 匹配模型 ──
MATCH_MODEL=ai
MATCH_API_KEY=<随机串——api 与 matching-ml 共用，空值会 fail-closed 拒绝启动>
LLM_BACKEND=mock            # 未接真实 LLM 前用 mock（规则打分照常工作）

# ── 前端构建期/运行时地址 ──
API_URL=https://api.unimatcha.ai          # admin-web 构建期内联，改了必须 --build
NEXTAUTH_URL=https://admin.unimatcha.ai

# ── CORS 白名单（官网 + H5 + 后台）──
ALLOWED_ORIGINS=https://unimatcha.ai,https://www.unimatcha.ai,https://app.unimatcha.ai,https://admin.unimatcha.ai

# ── 演示数据：生产必须 false ──
SEED_DEMO=false

# ── SMTP 邮件（注册验证码 + 学生认证验证码）──
# 三项必填不齐 → 开发回退：验证码不发邮件、随 API 响应返回 devCode（生产必须配齐）。
# 域名邮箱托管在 Spacemail（Spaceship），MX 已指 spacemail.com。
MAIL_HOST=mail.spacemail.com
MAIL_PORT=465
MAIL_USER=donotreply@unimatcha.ai   # Spacemail 发信邮箱（2026-08-31 已在服务器 .env 配好）
MAIL_PASS=<该邮箱的登录密码>
# MAIL_SECURE 留空按端口推导（465→TLS）；MAIL_FROM 缺省 "Unimatcha <MAIL_USER>"
```

## 4. 启动

```bash
cd /opt/unimatcha
docker compose up -d --build        # 首次构建 5-15 分钟
docker compose ps                   # 全部 Up / healthy
docker compose logs -f api          # 看 API 启动与 prisma 迁移日志
```

数据库结构：API 镜像启动时执行 `prisma migrate deploy`（见 apps/api/Dockerfile 入口与下方 6.5 节）；
如未自动执行，手动跑一次（用 `run` 而不是 `exec`——迁移失败时容器在 crash-loop，exec 进不去）：

```bash
docker compose run --rm --no-deps api npx prisma migrate deploy
```

## 5. 验证清单

```bash
curl -I  https://unimatcha.ai                       # 200，官网
curl -I  https://app.unimatcha.ai                   # 200，H5
curl -I  https://admin.unimatcha.ai/login           # 200，后台
curl -s  https://api.unimatcha.ai/api/v1/public/site-stats   # JSON 真实统计
```

浏览器过一遍：官网首页统计数字/倒计时来自 API；候补名单+学生会联系表单能提交（后台「官网提交」页可见）；
H5 注册登录；admin 用 SEED_ADMIN 登录。

## 6. 日常更新

```bash
cd /opt/unimatcha
git pull unipia main 2>/dev/null || git pull origin main
docker compose up -d --build       # 只重建有改动的镜像
```

改了 `API_URL` 这类构建期变量时：`docker compose up -d --build admin-web`。

## 6.5 数据库迁移（2026-08-31 起：migrate deploy，不再 db push）

api 容器启动时跑 `prisma migrate deploy`：只应用 `prisma/migrations/` 里未执行过的迁移，
执行记录写入 `_prisma_migrations` 表，有版本、有历史、失败即启动失败（fail-closed）。
存量生产库已用基线 `20260831120000_init` 打点（`migrate resolve --applied`，不真跑 SQL）。

**改 schema 的流程（必须遵守）**：

1. 改 `apps/api/prisma/schema.prisma`。
2. 生成迁移文件。有本地库时用 `npx prisma migrate dev --name 描述`；
   本机没库时用纯离线 diff（旧 schema 取自 git，不需要任何数据库）：

   ```bash
   cd apps/api
   git show HEAD:apps/api/prisma/schema.prisma > /tmp/schema.old.prisma
   DIR=prisma/migrations/$(date +%Y%m%d%H%M%S)_描述 && mkdir -p "$DIR"
   npx prisma migrate diff \
     --from-schema-datamodel /tmp/schema.old.prisma \
     --to-schema-datamodel prisma/schema.prisma --script > "$DIR/migration.sql"
   ```

   （注意：离线 diff 的「旧基准」是上次提交的 schema——前提是每次改 schema 都配了迁移、
   两者始终同步提交，这正是第 4 步要求的。）
3. **人工读一遍生成的 SQL**——出现 `DROP TABLE` / `DROP COLUMN` / 类型收窄时想清楚是不是本意，
   需要保数据的走 expand-contract（先加新列迁数据、下个版本再删旧列）。
4. 迁移文件连同 schema 一起提交。只改 schema 不建迁移 = deploy 无事可做，生产结构不会变。
5. 部署照常 `docker compose up -d --build api`，migrate deploy 在启动时自动应用。

**带迁移的部署建议先预检**（旧容器持续服务，迁移验证通过才换容器）：

```bash
docker compose build api
docker compose run --rm --no-deps api npx prisma migrate deploy   # 预检：失败则旧容器照常服务
docker compose up -d api
docker compose ps api && docker compose logs api | grep -i migrate
```

**回滚**：迁移没有自动回滚；schema 层回滚只有「写反向迁移再部署」一条路。镜像回滚仅在
「该镜像与当前库结构一致」时可用；**永远不要对已进迁移管理的库跑 `db push`**（尤其
`--accept-data-loss`——会绕过迁移历史造成漂移甚至删数据）。

**Runbook：忘了打基线直接 up -d（或某次迁移失败）**：deploy 试图真跑迁移 SQL → 撞已有
对象报错（DDL 单事务原子回滚，库结构零半应用）→ 失败记录写进 `_prisma_migrations` →
容器 crash-loop、API 502，此后每次重启秒报 P3009。恢复：确认库结构实际正确后
`docker compose run --rm --no-deps api npx prisma migrate resolve --applied <迁移名>`，
下一次自动重启即自愈；排障看日志要从**第一次**尝试找根因（`docker logs unimatcha_api | head`，
后续全是重复的 P3009）。

**开发库**（本机 Docker 恢复后）：先对 dev 库跑一次
`npx prisma migrate resolve --applied 20260831120000_init` 再用 `migrate dev`——
跳过这步 migrate dev 会检测到「库非空但无迁移历史」而要求 **reset 整个开发库**。

**注意**：pg_trgm 扩展与搜索 GIN 索引有意留在 schema 之外，由 `ensure-search-indexes` 启动脚本幂等维护，别写进迁移。

## 7. 每周匹配调度

上线后把公布 cron 配置到正式时间（见 SCHEDULING.md / scripts/set-weekly-schedule.sh，
注意脚本打的是 api 容器内的 3001 端口，服务器上执行：`docker compose exec api sh -c "..."` 或经 api.unimatcha.ai 调管理接口）。

## 常见问题

- **Caddy 证书签发失败**：确认 DNS 已生效、80/443 未被占用、云防火墙放行。`docker compose logs caddy`。
- **admin 登录接口 404/跨域**：`API_URL` 是构建期内联，确认 `.env` 设置后带 `--build` 重建了 admin-web。
- **matching-ml 起不来**：`MATCH_API_KEY` 必须非空（fail-closed 设计）。临时回退规则打分：`MATCH_MODEL=scoring`。
- **官网表单 429**：公开端点每 IP 每分钟限 10 次，属预期。
