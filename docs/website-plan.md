# Unimatcha 官网搭建方案（交接文档）

> 本文档记录官网（marketing landing page）的技术选型、架构与部署路线。
> 用途：在新对话/新会话中直接读此文件，即可无缝接手搭建工作。
> 页面设计与内容由项目负责人自行设计，本文档**只定技术路线**。

---

## 0. 背景与边界

- 项目 Unimatcha：面向大学生的长期恋爱匹配平台，已有：
  - `apps/api`（NestJS 后端，端口 3001）
  - `apps/admin-web`（Next.js 14 管理后台，端口 3000）
  - `apps/h5`（Vite H5 用户端，端口 3002）
  - `apps/ios`（SwiftUI 原生，**跑在用户手机，不进 docker**）
- **官网是新增的第 4 个网页**，独立门面页，引导路人了解产品 / 注册 / 下载。
- 已购：Spaceship 域名一个。已有：DigitalOcean 服务器一台。
- 部署方式已定：**并入现有 docker-compose 统一管理**。

### 客户端 / 服务端边界（重要心智模型）
```
跑在 docker 里（DO 服务器）： 后端API · 管理后台 · 官网 · H5
跑在用户手机（不进 docker）： iOS App / 安卓 App —— 隔着网络来连后端 API
```
- 手机原生 App 通过 App Store / Google Play 上架，装在用户手机里，只是来连 docker 里的 API。
- 官网/H5/后台是网页，文件托管在服务器，跑在用户浏览器里。
- 安卓策略：现阶段先用 H5 + PWA 顶上（零额外开发）；要正经上架再用 H5 套壳，
  追求极致体验再上 Kotlin 原生。后端无需为安卓改动。

---

## 1. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Next.js 14 (App Router) + TypeScript** | 与 admin-web 一致，团队已会，SEO 好，能长成带功能的站 |
| 样式 | **Tailwind CSS** | 与现有项目一致 |
| 视频 | 原生 `<video>` | 背景视频 / 演示视频 |
| 容器 | Dockerfile（Next standalone 多阶段）+ docker-compose | 与现有服务统一 |
| 反向代理 | **Caddy**（自动 HTTPS） | 自动申请/续期 Let's Encrypt 证书，配置极简 |

### 动画栈（满配 / 专业级）

按能力分层，各管一摊、可共存：

| 库 | 负责 | 何时用 |
|---|---|---|
| **Lenis** (`@studio-freight/lenis`) | 平滑惯性滚动底座 | 全站滚动手感，滚动动画的前提 |
| **GSAP + ScrollTrigger** | 复杂滚动时间线（主力） | 钉住 pin、横向滚、进度驱动、视差、逐步出现 |
| **Framer Motion** | React 组件动画 / 手势 / 转场 | 悬停、卡片入场、模态、路由切换 |
| **R3F**（`three` + `@react-three/fiber` + `@react-three/drei`） | 3D / WebGL | 3D 首屏、粒子、模型、shader |
| **Lottie** (`lottie-react`) | 矢量微动效 | AE 导出的精细动画、图标动效 |
| （可选）Spline | 无代码 3D embed | 不想手写 Three.js 时 |

**分工原则**：滚动叙事/复杂时间线 → GSAP；组件交互/手势 → Framer Motion；
3D/粒子 → R3F；精细插画动效 → Lottie。

**满配必须配套的性能护栏（不可省）**：
1. 重组件（3D/Three.js）用 `next/dynamic` 懒加载，`ssr:false`，不拖首屏。
2. 代码分割，进视口才加载重动画。
3. 只动 GPU 友好属性（`transform` / `opacity`），避免触发重排的属性。
4. 尊重 `prefers-reduced-motion`（无障碍 + 防晕）。
5. 资源压缩：背景视频转 webm/H.265，3D 模型用 draco 压缩。
6. 移动端降级：手机上关闭或简化 3D/粒子，保流畅。

> 注意：满配动画很吃**设计素材**（3D 模型、Lottie JSON、背景视频）。
> 库只是"动起来"的引擎，素材需另行产出。

---

## 2. 项目位置与端口

```
apps/web/        ← 新建官网，与 apps/admin-web 平级
端口 3003        ← 3000=admin, 3001=api, 3002=h5 已占用，官网用 3003
```

---

## 3. 搭建步骤（本地）

```bash
# 1. 在 apps/ 下建 Next 项目
npx create-next-app@14 web --ts --tailwind --app --no-src-dir

# 2. 装动画全家桶
cd apps/web
npm i gsap @studio-freight/lenis framer-motion
npm i three @react-three/fiber @react-three/drei   # 要 3D 才装
npm i lottie-react                                  # 要矢量动效才装

# 3. 本地跑（改 package.json dev 脚本为 next dev -p 3003）
npm run dev        # http://localhost:3003
```

- `next.config.js` 加 `output: 'standalone'`（镜像才小）。
- GSAP ScrollTrigger 为官方免费插件：`import { ScrollTrigger } from "gsap/ScrollTrigger"`。

---

## 4. 容器化

**`apps/web/Dockerfile`**（参照 `apps/admin-web/Dockerfile`，Next standalone 多阶段）：
- stage1：`npm ci && npm run build`
- stage2：只拷 `.next/standalone` + `.next/static` + `public`，跑 `node server.js`

**`docker-compose.yml` 新增两个服务：**
```yaml
services:
  web:                      # 官网
    build: ./apps/web
    expose: ["3003"]        # 只对内，不直接暴露公网
  caddy:                    # 反向代理（新增）
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data    # 证书持久化，务必保留
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
```

> 加 Caddy 后，api/admin/h5 原来直接 `ports` 暴露的端口建议改为 `expose`，
> 全部走 Caddy 进来，更安全。

---

## 5. 反向代理 + 域名（以 unimatcha.com 为例）

**`Caddyfile`**（项目根目录）：
```
unimatcha.com         { reverse_proxy web:3003 }
app.unimatcha.com     { reverse_proxy h5:80 }
admin.unimatcha.com   { reverse_proxy admin-web:3000 }
api.unimatcha.com     { reverse_proxy api:3001 }
```
Caddy 自动给这 4 个域名申请并续期 HTTPS 证书，零手动。

**Spaceship DNS 后台**加 A 记录（全部指向 DO 服务器 IP）：
| 类型 | 主机名 | 值 |
|---|---|---|
| A | @ | DO服务器IP（根域名 = 官网） |
| A | app | DO服务器IP |
| A | admin | DO服务器IP |
| A | api | DO服务器IP |

> 子域名容器名（web / h5 / admin-web / api）需与 docker-compose 中服务名一致。

---

## 6. 上线

```bash
# DO 服务器上
git pull
docker compose up -d --build
# Caddy 自动签证书，几十秒后 4 个域名全部可访问（HTTPS）
```

---

## 7. 一句话流程

```
本地建 apps/web (Next + 动画全家桶)
→ 写 Dockerfile + 改 docker-compose 加 web/caddy 两个服务
→ 写 Caddyfile + Spaceship 配 4 条 A 记录
→ 服务器 docker compose up -d --build
→ 完（Caddy 自动 HTTPS）
```

---

## 8. 反向代理（Caddy）补充

- 作用：单一 443 入口，按域名分流到各服务、统一 HTTPS、藏内部端口、集中加规则。
- 选 Caddy 而非 nginx：**自动 HTTPS** 是核心需求，Caddy 几行搞定；nginx 功能更强
  （复杂 URL 重写、高阶负载均衡、反代缓存、四层代理）但你当前用不上，且证书要手动
  Certbot。日后真需要 nginx 的高阶能力再平移——代理是独立一层，业务零改动，迁移很轻。

## 9. 数据库（与官网无关，备忘）

- 现阶段 PostgreSQL 放 docker 里即可，**前提：配好 volume + 定期 `pg_dump` 备份**。
- 数据变重要后迁 DO Managed Database（容器外，自动备份容灾），只改 `DATABASE_URL`，
  应用代码不动。

---

## 10. 待办清单（新窗口可直接照做）

- [ ] `apps/web` 脚手架（Next 14 + Tailwind + TS）
- [ ] 装动画全家桶 + 配性能护栏
- [ ] 页面骨架（结构与内容由负责人设计）
- [ ] `next.config.js` 加 `output: 'standalone'`
- [ ] `apps/web/Dockerfile`
- [ ] `docker-compose.yml` 加 web + caddy 服务
- [ ] 根目录 `Caddyfile`
- [ ] 收回 api/admin/h5 的公网端口（改 expose）
- [ ] Spaceship 配 4 条 A 记录
- [ ] 服务器 `docker compose up -d --build` 上线验证
