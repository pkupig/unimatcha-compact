# Unimatcha — 业务与交互规格（PRD）

> 状态：已与产品确认（2026-06-09）。本文件是动代码前的定稿，开发以此为准。

面向大学生、主打**长期恋爱关系**的每周匹配平台。核心理念借鉴 Coffee Meets Bagel 的「每周限量 + 限时确认」（质量优先）、Hinge 的「按资料元素破冰」、青藤之恋的「校园认证建立信任」。

---

## 0. 决策清单

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 头像/照片存储 | **改走后端上传**，删除 localStorage 方案 |
| 2 | 登录路由 | ACTIVE 老用户**直接进首页**，仅新用户进引导 |
| 3 | 「我的」页 | **维持现状**，不改字段 |
| 4 | 匹配节奏 | **每周五 17:00** 揭晓（三处文案/cron 对齐） |
| 5 | 匹配确认入口 | **匹配页弹确认卡片** |
| 6 | 七天打卡任务 | **暂不做**（留作后续增强） |
| 7 | 确认限时 | **48 小时**，超时作废回池 |
| 8 | 修改密码 | **补后端接口** `/auth/change-password` |

---

## 1. 核心状态机

后端 `matchState` 有 6 态，前端必须全部正确渲染（现状只渲染了 3 态，proposed/no_match 缺失）。

```
 idle ──[用户点"加入匹配池"]──▶ searching
 searching ──[周五17:00 跑匹配, 配到对象]──▶ proposed
 searching ──[周五17:00, 没配到]──▶ no_match ──[继续等下周]──▶ searching
 proposed ──[双方都确认]──▶ relationship（在一起）──▶ 解锁聊天/广场
 proposed ──[任一方拒绝]──▶ idle（双方回到空闲，可重新入池）
 proposed ──[48h 内未双方确认]──▶ 作废, 回 idle/池子
 relationship ──[任一方解除]──▶ idle
```

`/matching/status` 返回示例（proposed）：

```json
{
  "state": "proposed",
  "match": { "proposalId": "...", "score": 87, "myConfirmed": false, "partnerConfirmed": false, "matchedAt": "2026-06-12T17:00:00Z" },
  "partner": { "nickname": "...", "school": "...", "avatarUrl": "...", "interests": [...], "bio": "..." }
}
```

---

## 2. 匹配页各状态交互

### 2.1 idle（空闲）
现有的几何框 + 「JOIN MATCHING POOL」按钮。保留。

### 2.2 searching（匹配中）
- **加雷达动画**（已实现 cl-spin/cl-ping/cl-pulse）。
- 倒计时 = **下一个周五 17:00**。删除现页面里矛盾的「daily release 22:00」文案。
- 按钮：修改偏好、退出匹配池。

### 2.3 proposed（收到对象 → 确认卡片）★ 本期最高优先
匹配页渲染一张确认卡片，数据全部来自 `status.match` + `status.partner`：

- 对方头像、昵称、学校/年级
- **校园认证标识**（`partner.verificationStatus === 'verified'` 时显示徽章）
- **契合度分数** `match.score`（大号展示，借鉴 Soul）
- **共鸣点**：取双方问卷一致的 3 条作为破冰话题（借鉴 Hinge）→ 需要后端在 partner 公开资料或 status 里附带「shared answers」；若一期来不及，先用 `partner.interests` 里的共同标签兜底
- **48h 限时倒计时**：`matchedAt + 48h`，到点提示作废
- 按钮：
  - **确认** → `POST /matching/proposals/{proposalId}/confirm`
  - **拒绝** → `POST /matching/proposals/{proposalId}/reject`
- **已确认、等待对方**：当 `match.myConfirmed === true && partnerConfirmed === false`，卡片切换为「你已确认 ♥ 等待对方回应」，按钮置灰，继续轮询。

### 2.4 relationship（在一起）
复用现有的情侣卡（头像、标签、bio、查看资料、解除连接）。

### 2.5 no_match（本周无缘）
展示后端给的文案 `本周暂无与你合适的缘分，下周五见 💫` + 「调整偏好」入口，状态保持在池中等下周。

---

## 3. 个人资料与照片（决策①）

- 头像 → `POST /uploads/avatar`，封面/帖子图 → `POST /uploads/image`，真实照片 → `POST /uploads/real-photo`。
- 返回的 URL 存进 `profile`（`avatarUrl` / `coverUrl` / `realPhotos`）。
- 自己和对方一律从 `profile.*` 读图（修复「对方头像永远空白」）。
- **移除** `cl_avatar_*` / `cl_cover_*` / `cl_photos_*` 等 localStorage 读写。
- 「我的」页布局**维持现状**（决策③），仅把图片来源换成后端 URL。

---

## 4. 登录路由（决策②）

- 后端 `/users/me` 增加两个布尔：`hasProfile`、`completedQuestionnaire`（后者按该用户 answers 是否存在计算）。登录接口已返回 `hasProfile`，对齐即可。
- 前端 `checkUserState` 改判：
  - 无 `hasProfile` → 资料引导页
  - 有资料但 `!completedQuestionnaire` → 问卷页
  - 否则 → **首页**
- 删除现有 `status !== 'active'`（大小写恒不等）这套错误判断。

---

## 5. 修改密码（决策⑧）

- 后端新增 `POST /auth/change-password`（校验旧密码或仅登录态，按现有安全级别）。
- 前端 `submitChangePassword` 维持调用即可。

---

## 6. 收尾项

- **已读**：聊天接 `PUT /chat/:matchId/messages/read`；通知接 `PUT /notifications/read` + `GET /notifications/unread-count`，清掉永不消失的红点/未读。
- **下拉选择**：学校/专业/城市/MBTI/国籍 接 `metadata/*` 接口，改手填为下拉。

---

## 7. 暂不做（本期不做，留档）

- 「七天默契任务/打卡」（一周CP 式每日任务）→ 后续增强，将与时长/积分排行榜联动。

---

## 8. 改动清单（开发参考）

**前端（apps/h5/src）**
- `modules/match.js`：`renderMatchTab` 增加 `proposed`、`no_match` 分支；新增确认卡片渲染 + 48h 倒计时；searching 文案改周五17:00。
- `modules/core.js`：`checkUserState` 路由改判。
- `modules/profile.js`：头像/封面/照片改后端上传，移除 localStorage。
- `modules/auth.js`：修改密码（接口补好后无需改）。
- `modules/chat.js` / `notifications.js`：接已读接口。

**后端（apps/api/src）**
- `users`：`/users/me` 增加 `hasProfile`、`completedQuestionnaire`。
- `auth`：新增 `POST /auth/change-password`。
- `matching`：增加 **48h 过期清理**（定时把超时未双确的 proposed 重置回 idle/池）；如做共鸣点，status 附带 shared answers。

---

## 9. 落地顺序

1. **匹配确认卡片 + proposed/no_match 状态**（主干，最高优先）
2. **登录路由修正**（后端加字段 + 前端判断）
3. **照片改后端上传**
4. **修改密码接口** + 48h 过期清理
5. 已读 / metadata 下拉（收尾）
