# H5 半成品清单（2026-06-12 代码审计）

> 由 69 个 agent 地毯式扫描 + 逐条对代码核实得出：64 条原始发现 → 51 条属实 → 去重合并为下列 31 项。
> **2026-06-12 全量补齐执行完毕**：构建全绿（API tsc / H5 vite / prisma validate），31/31 项闭合，状态见各条目。
> 遗留事项见文末。**此清单同时是 iOS 端一次性对齐的功课单。**

---

## P0 — 主流程断点 / 明显 Bug

### ✅ 1. metadata 下拉
- setup 与编辑页的学校/城市/专业/MBTI/国籍/年级全部接 `/metadata/*` 接口动态填充（带 S.metadataCache 缓存），美国高校硬编码已删除；`saveProfile()` / `saveEditProfile()` 提交全部字段。

### ✅ 2. 匹配倒计时
- 新增 cron 解析（支持 `m h * * dow` 与 `m h * * *`），倒计时按后端 `matchConfig.cronExpr` 计算，周五 17:00 仅作 fallback；"daily release 22:00" 矛盾文案已删除。

### ✅ 3. 匹配偏好
- 5 类偏好（性别/年龄/学段/同校/同城）完整保存与回读；University Stage 按钮已绑定；后端 `UpdateMatchPreferencesDto` 与 `UserMatchPreferences` 表新增 preferredGender/ageMin/ageMax/universityStage，并作为匹配硬约束生效。

### ✅ 4. 广场帖子 title
- 全链路打通：schema（`CouplePost.title`）+ DTO + service + 发帖提交 + 列表/详情渲染。

### ✅ 5. 广场列表点赞
- 列表卡片新增点赞按钮，点赞后局部更新计数与高亮。

### ✅ 6. Setup 兴趣标签
- `setup-tag-input` 已绑 Enter 键（onkeydown → addSetupTag）。

### ✅ 7. 编辑资料头像/学校/年级
- setup 与编辑页头像均有 file input → `/uploads/avatar` 上传链路；"Change Photo Portfolio" 死按钮已接通；school/grade 初始化与保存完整。

---

## P1 — 后端已现成、H5 没接

### ✅ 8. 聊天已读/增量/分页
- 改用 `/poll` 增量轮询 + chatLastId；打开与收到消息时调 markRead，自己的消息显示 Read 状态；滚动到顶游标分页加载更早消息；`sender_id` 死代码已清理。

### ✅ 9. 通知未读红点
- 铃铛 badge（99+ 封顶、0 隐藏），unread-count 接口接入，启动/轮询/已读后刷新；请求补 page=1；按 type 显示不同图标；轮询收紧至 15s。

### ✅ 10. 伙伴资料页
- "TA's Moments" realPhotos 图片网格 + PERSONALITY TAGS / INTERESTS 两层标签分区展示。

### ✅ 11. 排行榜初始化
- 打开时按 S.lbTab 同步 active 样式；label/metric/score 容错死代码已清理。

### ✅ 12. 问卷提交反馈
- 提交后读取响应展示 answeredCount 完成反馈。

### ✅ 13. 确认配对即时反馈
- 读取 confirm 响应：RELATIONSHIP_MODE 弹配对成功，WAITING 提示等待对方。

---

## P2 — 功能缺口（含产品决策）

### ✅ 14. 广场分类
- 后端 `?section=` 查询实现：recommended=最新 / campus-life=同校作者 / top-stories=按点赞数；前端 tab 切换真实生效。（决策：不加 DB 分类字段，纯查询实现）

### ✅ 15. 评论回复
- schema 加 `PostComment.parentCommentId` 自关联；DTO/service 支持回复并发通知；前端 Reply 按钮 + "Replying to X" + 一层嵌套渲染。

### ✅ 16. 聊天图片消息
- schema 加 `Message.imageUrl`；DTO content 可选（二者必其一）；前端 add 按钮 → 上传 → 图片气泡渲染。

### ✅ 17. 通知类型
- 后端在点赞/评论/回复时生成 like/comment 通知（不给自己发、回复双向通知去重）。

### ✅ 18. 帖子详情多图轮播
- 横向滑动轮播 + 指示器。

### ✅ 19. 广场 bento 布局
- 照设计稿实现不对称网格（大卡/双列/宽卡循环），无图帖纯文兜底。

### ✅ 20. 排行榜 8 类 + Podium
- 横向滚动 tab 接入全部 8 种榜单类型；Top3 领奖台 + 第 4 名起列表，不足 3 条降级。

### ✅ 21. 里程碑
- 后端新增 `GET /matching/milestones`（daysTogether/messageCount/postCount/sharedInterests/matchScore）；前端新建 milestone.js 渲染情侣空间，入口：profile 配对卡 + Love Mode；非 relationship 显示空态。

### ✅ 22. Push Notifications 开关
- `User.settings Json` + `GET/PUT /users/me/settings`；开关回填与保存生效。

### ✅ 23. 隐私开关
- Privacy 区三个 toggle（showProfile/showOnline/showMoments）接 settings API；localStorage 孤儿逻辑已移除。

### ✅ 24. 注册/登录
- 社交登录死按钮已删除（决策：不做 OAuth）；注册加 Confirm Password 校验。邮箱验证未做（无 SMTP，见遗留）。

### ✅ 25-31. 设置页 7 个死按钮
| 按钮 | 实现 |
|---|---|
| Love Mode | relationship 状态打开情侣空间（里程碑页），否则提示配对后解锁 |
| Contact Us | 支持邮箱 overlay + mailto 链接 |
| Help Center | 静态 FAQ 内容页 |
| Safety Tips | 静态安全建议内容页 |
| Report a Problem | 表单 → 新增 `POST /reports`（Report 表落库） |
| Terms of Service | 静态条款页（Last updated 2026-06） |
| Privacy Policy | 静态政策页（Last updated 2026-06） |

---

## 遗留事项

1. **数据库未推送**：schema 有 6 处变更（CouplePost.title、PostComment.parentCommentId、Message.imageUrl、UserMatchPreferences 4 字段、User.settings、Report 表），需在数据库运行时执行：
   `docker compose exec api npx prisma db push`（或本地 `npx prisma db push`）
2. **邮箱验证**：无 SMTP 基础设施，未实现。
3. **OAuth 社交登录**：按决策删除入口，未实现。
4. **运行时验证**：仅做了静态构建与代码复核，未起服务跑端到端流程，建议 db push 后人工过一遍主流程。
5. **iOS 对齐**：按本清单最终契约一次性实现；iOS 已知额外缺口：照片管理（realPhotos/封面）无 UI、实名认证申请无 UI、mbti/nationality/zodiac/major 有模型无 UI、筛选偏好只支持同城同校。
