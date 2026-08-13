# Unimatcha 待办与缺口总表（备份文档）

> 这份文档记录**已经做了什么、还差什么、之后要做什么**，是整个项目的"记忆备份"，避免遗忘。
> 更新日期：2026-08-13（新增 P1-9/P1-10 搜索与发现跟进项；P0-1/P0-2/P0-5 已于 2026-07-13 完成，见下表）。
> 按优先级分 P0（上线前必做）/ P1（上线后迭代）/ P2（规模化远期）。
> 匹配算法细节见 `matching-ml/README.md`；训练见 `matching-ml/TRAINING.md`；调度见 `SCHEDULING.md`。

---

## 一、已经做了什么（✅ 现状）

### 匹配算法（`matching-ml/`，独立 Python 服务，现在 mock 可跑）
- ✅ 完整流水：硬门 → 语义画像(Extractor) → 召回 → 兼容判断(Pair Judge) → 融合 → 全局匹配 → 结果
- ✅ **匹配宪法**：硬条款代码强制 + 软条款进 prompt（`app/constitution.py`）
- ✅ **稳定匹配 Gale-Shapley**：零阻塞对，有测试证明打败贪心（对标 Hinge）
- ✅ **方向性欲望度 + 调和平均** mutual score
- ✅ **会员保障**：给最优可行对象、不降硬约束、真空退款
- ✅ **交友/恋爱一套算法两份配置**：`app/mode_profile.py`（问卷权重/融合权重/匹配拓扑/花费全在这）
- ✅ **反馈闭环地基**：曝光/行为 schema + 归因 + 多任务 LTR + ranker 热插（`feedback/`）
- ✅ 问卷科学设计（双模式，`questionnaire/`，带校验器）
- ✅ 微调数据管线 + 训练手册（`data/`, `TRAINING.md`）
- ✅ 与 NestJS 契约一致（`POST /match`），接入是改配置不是改代码

### 后端已有（NestJS，`api/`）
- ✅ 匹配调度器 `MatchScheduler` + 配置表 `MatchConfig`（cron 可改）
- ✅ 管理端接口：看/改配置、手动触发、看任务与结果、重试
- ✅ 匹配任务队列（Bull/Redis）、48h 未确认自动过期
- ✅ Match/MatchJob 表、恋爱/朋友双模式状态机

---

## 二、P0 —— 上线前必做

| # | 事项 | 为什么 | 在哪做 | 依赖 |
|---|---|---|---|---|
| P0-1 | ✅ 2026-07-13 **接入 matching-ml**：`AIMatchModelProvider`（`ai-match-model.provider.ts`）+ env 开关（`MATCH_MODEL=ai\|scoring`，缺省设了 `AI_PROVIDER_URL` 即 ai）；带超时/结构校验。本地 E2E 双模式各配出 2 对已验证。**服务器部署 matching-ml 仍待做** | 让新算法真正接管匹配 | 后端 `matching.module.ts`（✅）+ 部署（待） | matching-ml（已就绪） |
| P0-2 | ✅ 2026-07-13 **埋点两张表**：`MatchExposure`（含补充列 matchJobId 作重试幂等键）+ `MatchBehaviorEvent` 已进 schema；曝光在匹配公布处落库（`executeMatchJob`），confirmed/rejected/dissolved/firstMessage/message 在服务端权威动作处落库，viewed/openedProfile 走 `POST /matching/feedback/events`（白名单防伪造）。全部事件类型 E2E 已验证 | **反馈学习的地基** | 后端 ✅（H5 上报接入=P1-6） | 无 |
| P0-3 | **调度 A 方案**：把 cron 设成每周日公布 + 发一条开场公告 | 实现"每周一轮、周日出结果" | 见 `SCHEDULING.md`（文档+脚本已备；正式切换用管理端改 cron，属运营操作） | 无 |
| P0-4 | **阈值校准**：切真模型/开 ranker 后重新调 `SCORE_THRESHOLD` | 混合分/ranker 分量纲不同，不校准会误杀 | matching-ml 配置（mock 档当前 60 分阈值 E2E 表现正常：明显相容对 70.1 分通过） | P0-1 ✅ |
| P0-5 | ✅ 2026-07-13 `/match` 加鉴权：`require_api_key` 依赖校验 `Bearer <MATCH_API_KEY>`（constant-time 比较；空 key=关闭并打启动警告，仅限本地）。401/401/200 矩阵已验证 | 安全 | matching-ml `app/main.py` ✅ | 无 |
| P0-6 | 决定上线用哪档：纯规则(mock) / prompt 版 / 微调版 | 没微调好也能先用规则或通用模型上线 | 决策（当前默认 `LLM_BACKEND=mock` 可直接上线，切 ollama 只改 env） | — |

> **注**：ollama + 微调模型可以晚点上；先用 `LLM_BACKEND=mock`（规则版）或 prompt 版通用模型上线，产品能跑、数据先跑起来。

---

## 三、P1 —— 上线后迭代（有真实数据才有意义）

| # | 事项 | 为什么 | 备注 |
|---|---|---|---|
| P1-1 | **人工标注工具**：运营/种子用户给 pair 打 1-5 分 + 写理由 | Pair Judge 微调的**主要真数据来源**（合成弱标注只是种子） | 需要一个简单后台页 |
| P1-2 | **每周训 ranker (LTR)**：真实反馈进来后跑 `feedback/train_ranker.py`，替换手写融合权重 | "越用越准"的第一层，快、便宜、不碰大模型 | 依赖 P0-2 埋点 |
| P1-3 | **微调 Pair Judge / Extractor（V2）**：攒够标注后在服务器微调，`LLM_BACKEND=ollama` | 让模型真正"懂人" | 依赖 P1-1 + ollama |
| P1-4 | **活动/公告系统**：Announcement 表 + 管理端发布/下架 + 前端展示位 | 目前**完全没有**；"控制活动发布"靠它 | 见 `SCHEDULING.md` §活动发布 |
| P1-5 | **调度 B 方案**：`MatchRound` 两阶段（周五开池 / 周日计算 / 周日公布分离） | A 方案是"算=公布同刻"；B 才有"开始 vs 公布"的仪式感 | 见 `SCHEDULING.md` §方案B |
| P1-6 | **前端反馈收集 UI**：合适/不合适/原因、聊后反馈、解除原因 | 这些是训练标签的来源，但展示要克制 | 依赖 P0-2 |
| P1-7 | **探索流量（反马太效应）**：后端把 `waitingRounds`/`exposureCount` 填进候选，给长等待用户加权 | 防止受欢迎的人越推越多、普通用户没曝光 | 字段已在 schema 预留 |
| P1-8 | **门票加入 Apple Wallet**：签发 `.pkpass` | 用户要求；前端入口与下载逻辑已就绪（`addTicketToWallet`），仅缺签发 | **阻塞在证书**：需 ①Apple Developer Program（$99/年）②Pass Type ID 证书(.p12) ③WWDR 中间证书。到位后：实现 `GET /events/tickets/:id/pkpass`（证书走 env，未配置返回 501），并把 `profile.js` 的 `ENABLE_APPLE_WALLET` 改 true |
| P1-9 | ✅ 2026-08-14 **广场搜索纳入评论内容**：`square_post_comments.content` 已建 trgm 索引；LEFT JOIN LATERAL 每帖取一条最早命中评论（天然按帖去重），命中权重 1.2（弱于正文 1.8）。产品口径按用户拍板取「返回主帖 + 标注命中片段」（非定位楼层）；帖子本身已命中时不挂片段 | 用户找的往往是某句讨论而不是主帖 | 片段仅下发正文不带评论作者（匿名帖不得因此被反推）；可见性沿用主帖 scope，实测他校/已删帖不会经评论穿透 |
| P1-10 | **「猜你认识」用真实反馈调权**：现在各路召回权重是手写常数（共同好友 3.0 / 同专业 1.4 / 兴趣 0.5·n 等） | 与匹配算法同理，手写权重只是起点 | 可复用 P0-2 埋点范式：记录推荐曝光与「加好友/忽略」结果，攒够数据后按 P1-2 的 LTR 思路学权重。**注意**：`UserSuggestionDismiss` 是强负样本，加好友是强正样本 |

---

## 四、P2 —— 规模化 / 远期

| # | 事项 | 何时需要 |
|---|---|---|
| P2-1 | **Embedding 召回（双塔）**：大池子先用向量近邻召回，再交 Pair Judge | 用户量上万后，规则 O(n²) 扛不住 |
| P2-2 | **更强全局匹配**：Blossom 最大权匹配 / 朋友模式稳定 b-matching | 追求全局最优 + 稳定性 |
| P2-3 | **V4 端到端 / cross-encoder 精排** | **只在有大量真实反馈后**（现在做=循环蒸馏，自欺，见 README §1.2） |
| P2-4 | **分群指标监控 + A/B test 框架**：新老/性别/学校/资料完整度分群，规则版 vs 模型版对比 | 灰度上线、防止某群体变差 |
| P2-5 | **数据回流仪表盘**：每次匹配可回放（当时特征+模型输出+结果） | 可解释、可审计 |

---

## 五、关键决策 / 待确认（需要你拍板）

- [ ] **基座模型**：Qwen2.5（推荐，中文强）还是别的？（影响微调，数据格式已通用不绑定）
- [ ] **时区**：用户主要在英国还是国内？决定 cron 时区（`Europe/London` vs `Asia/Shanghai`）
- [ ] **匹配周期**：确认"每周日公布"，还是别的节奏？（A 方案改 cron 即可）
- [ ] **上线首版档位**：规则版 / prompt 版 / 微调版（P0-6）
- [ ] **一次匹配花费**：恋爱 3 能量 / 交友 1 能量（当前 `ModeProfile` 默认值），是否调整？

---

## 六、重要纪律（别踩的坑，已写进代码/文档）

1. **合成数据不能当真值**：只用于教格式、覆盖稀有场景、测管线；真值来自人工标注 + 真实反馈（否则循环蒸馏，越学越蠢）。
2. **会员保障不降硬约束**：靠"给最优可行对象 + 优先权 + 真空退款"，不靠降阈值。
3. **反馈学习三纪律**：没曝光≠负样本、存当时特征快照、反馈分强弱（举报=强负）。
4. **必须存特征快照**：训练用匹配当时冻结的特征，不能事后重算。
