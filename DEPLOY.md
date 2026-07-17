# Unimatcha 生产部署手册

整套服务用根目录 `docker-compose.yml` 一键起，Caddy 负责 80/443 与自动 HTTPS（Let's Encrypt）。
域名假定为 **unimatcha.com**（官网/H5/chat 的 API 地址均按此硬编码或按子域自适应；换域名需全局替换）。

## 架构

| 域名 | 服务 | 容器 |
|---|---|---|
| unimatcha.com / www | 官网静态站（apps/website，nginx） | unimatcha_website |
| app.unimatcha.com | H5 应用（apps/h5） | unimatcha_h5 |
| admin.unimatcha.com | 管理后台（apps/admin-web） | unimatcha_admin |
| api.unimatcha.com | API（apps/api） | unimatcha_api |
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

TTL 默认即可。生效通常几分钟，可用 `nslookup api.unimatcha.com` 验证。
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
SEED_ADMIN_EMAIL=admin@unimatcha.com
SEED_ADMIN_PASSWORD=<强密码，登录后可改>

# ── 匹配模型 ──
MATCH_MODEL=ai
MATCH_API_KEY=<随机串——api 与 matching-ml 共用，空值会 fail-closed 拒绝启动>
LLM_BACKEND=mock            # 未接真实 LLM 前用 mock（规则打分照常工作）

# ── 前端构建期/运行时地址 ──
API_URL=https://api.unimatcha.com          # admin-web 构建期内联，改了必须 --build
NEXTAUTH_URL=https://admin.unimatcha.com

# ── CORS 白名单（官网 + H5 + 后台）──
ALLOWED_ORIGINS=https://unimatcha.com,https://www.unimatcha.com,https://app.unimatcha.com,https://admin.unimatcha.com

# ── 演示数据：生产必须 false ──
SEED_DEMO=false
```

## 4. 启动

```bash
cd /opt/unimatcha
docker compose up -d --build        # 首次构建 5-15 分钟
docker compose ps                   # 全部 Up / healthy
docker compose logs -f api          # 看 API 启动与 prisma 迁移日志
```

数据库结构：API 镜像启动时执行 `prisma db push`/迁移（见 apps/api/Dockerfile 入口）；
如未自动执行，手动跑一次：

```bash
docker compose exec api npx prisma db push
```

## 5. 验证清单

```bash
curl -I  https://unimatcha.com                       # 200，官网
curl -I  https://app.unimatcha.com                   # 200，H5
curl -I  https://admin.unimatcha.com/login           # 200，后台
curl -s  https://api.unimatcha.com/api/v1/public/site-stats   # JSON 真实统计
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

## 7. 每周匹配调度

上线后把公布 cron 配置到正式时间（见 SCHEDULING.md / scripts/set-weekly-schedule.sh，
注意脚本打的是 api 容器内的 3001 端口，服务器上执行：`docker compose exec api sh -c "..."` 或经 api.unimatcha.com 调管理接口）。

## 常见问题

- **Caddy 证书签发失败**：确认 DNS 已生效、80/443 未被占用、云防火墙放行。`docker compose logs caddy`。
- **admin 登录接口 404/跨域**：`API_URL` 是构建期内联，确认 `.env` 设置后带 `--build` 重建了 admin-web。
- **matching-ml 起不来**：`MATCH_API_KEY` 必须非空（fail-closed 设计）。临时回退规则打分：`MATCH_MODEL=scoring`。
- **官网表单 429**：公开端点每 IP 每分钟限 10 次，属预期。
