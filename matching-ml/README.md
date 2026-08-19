# U-Spark 匹配系统（matching-ml）

混合「规则 + 微调大模型」的匹配服务，落地 `../algorithm.md` 的设计。

**一句话**：现在**不用 ollama、不用任何模型**也能端到端跑通（规则版 mock 输出与真模型完全相同的 JSON schema）；等服务器上微调好模型后，**只改一个环境变量 `LLM_BACKEND=ollama`** 就切到真模型，流水代码一行不动。数据准备、微调、推理都在这一个 Python 项目里，一起部署上服务器。

> 本文档是这个项目的**唯一说明书**：怎么跑、怎么设计、为什么这么设计、怎么接后端，全在这里。
> **训练怎么做、训练数据长什么样 → 看 [`TRAINING.md`](TRAINING.md)**（两套训练的数据示例 + 命令 + 产出，照着能做）。

---

## 目录

1. [最终标准模式（先读这个）](#1-最终标准模式)——回答"咱们前面的写法是否合理"和"端到端能不能做"
2. [匹配宪法 Constitution](#2-匹配宪法)——回答"要不要写一个宪法 prompt"
3. [问卷科学设计](#3-问卷科学设计)——回答"希望 vs 不能容忍怎么办"
4. [架构与代码地图](#4-架构与代码地图)
5. [怎么跑](#5-怎么跑)
6. [数据与微调](#6-数据与微调)
7. [接入 NestJS 后端](#7-接入-nestjs-后端)
8. [反馈学习闭环（越用越准）](#8-反馈学习闭环)
9. [现状与路线图](#9-现状与路线图)

---

## 1. 最终标准模式

这一节是核心，先把设计判断讲清楚，代码只是它的实现。

### 1.1 你的直觉哪里对、哪里要修正

你的原始想法：
> 每个用户 → 一个 latent vector；两个用户的 vector 输入大模型 → 输出一个正实数 mutual score，越大越匹配；最好端到端训练；冷启动就人工模拟一堆问卷+对部分 pair 打分。

**对的部分（保留）：**
- ✅ 用一个**对称标量 mutual score** 作为匹配层的统一接口——完全正确，这正是最大权匹配 / Gale-Shapley 需要的边权。
- ✅ 意识到"距离不能只算近，有的要相似有的要互补"——这是整个设计的灵魂，我们用**结构化维度 + 相似/互补标签**显式实现了它。
- ✅ 想要"越用越准"、想端到端——方向是对的，这是 V3/V4 的北极星。

**要修正的部分：**
- ⚠️ **不要现在就用"不透明 latent vector"当画像。** `dialogue.txt` 里那句"latent vector 是盲盒、别强行规定每段含义"是对的：256 维浮点数不可解释、不可审计、无法保证硬约束（性别/年龄/底线）、冷启动没数据训不动。**你真正想要的"有意义的向量"，就是可读的结构化语义画像**（`UserSemanticProfile`）——它是一个人能看懂、能审计、能缓存、能训练的"向量"，而不是黑盒浮点。
- ⚠️ **现在就端到端训练 mutual score 是错的**，原因是可证明的，见下。

### 1.2 为什么"现在做端到端"是错的（循环蒸馏）

你自己也说"这个问题太 practical 了，其实挺难办"。它难，不是工程难，是**逻辑上不成立**：

> 要端到端训练打分函数 `f(z_a, z_b) → score`，必须有 pair 的标签 `y`。
> 冷启动没有真实反馈，所以 `y` 只能来自：(i) 规则，(ii) 一个 LLM judge，或 (iii) 合成用户再用 (i)/(ii) 打分。
> 但**无论哪个函数 `g` 生产了 `y`，`f` 最多只能逼近 `g`**。你花一整套训练管线，只是把一个你**已经拥有**的函数 `g` 蒸馏进神经网络里，信息量没有增加，还引入了泛化噪声和 `g` 的偏见。
> 更糟：如果合成用户本身也是大模型生成的，`f` 学到的是**生成器的先验**，不是真实人类的相容性 → 自信地错。

**结论**：端到端只有在标签 `y` 携带了"输入算不出来的信息"时才有价值——也就是**真实人类反馈**（双方互相想认识、聊起来了、没秒解除、没举报）。所以端到端是 **V3/V4**，由数据量触发，**不是一种冷启动方法**。

**那合成数据还有用吗？有，但只用于三件事**（`algorithm.md §4.1.C` 也这么说）：
1. 教模型**稳定输出 schema**（格式纪律），不是教它"什么是好匹配"。
2. **覆盖稀有场景**（强 dealbreaker、否定语义），让模型鲁棒。
3. **给流水做单元测试**（本项目 `tests/` 就是这么用的）。

绝不能拿合成弱标注当"什么是好匹配"的真值去训 mutual score。

### 1.3 "咱们前面的写法是否合理" —— 判定

**合理 ✅。** `algorithm.md` 的六层（规则硬门 → 结构化抽画像 → pairwise judge → 融合 → 全局匹配 → 反馈回流）是**工业标准骨架**，也是**唯一能在没数据时冷启动**的方案。规则版 mock 冷启动是对的。

**唯一要改的一句话**：把你新提的"端到端 latent 打分器"从**最前面**挪到**最后面**（V4 北极星），只用真实反馈训练。**现在的"打分器"就是可解释的规则 + LLM judge，它已经输出你要的 mutual score 了。** 你不需要先训一个网络才能开始。

### 1.4 五层标准模式（最终推荐）

```
第0层  宪法 Constitution ── 硬条款(代码强制) + 软条款(进prompt)     app/constitution.py
第1层  特征编码 ──┬─ 白盒：结构化字段 → 分桶/one-hot（确定的"意义向量"）  app/pipeline/rules.py
                └─ 灰盒：自由文本+问卷 → 微调LLM → 结构化语义画像       app/pipeline/extractor.py
                   （可选，仅召回用：文本→sentence embedding 的黑盒向量）
第2层  Pair 打分 = mutual score 函数 s(a,b)                          app/pipeline/pair_judge.py + fusion.py
第3层  全局匹配（阈值 + 会员保障）                                    app/pipeline/global_match.py
第4层  反馈闭环 → LTR → (最终)端到端                                  路线图 V3/V4
```

关键原则一句话：**必须成立的东西写进代码（第0层硬条款、第1层白盒、硬门），需要判断的东西交给 LLM（灰盒抽取、软性 judge）。** 大模型越狱或幻觉都无法突破硬门，因为代码门永远先跑。

### 1.5 mutual score 的正式定义

保留你的"对称标量"直觉，但从**两个方向的欲望度**构造，以正确处理不对称和底线：

```
feasible(a,b) = hardGate(a→b) ∧ hardGate(b→a)      # 底线是有方向的：A的dealbreaker查B，B的查A
if not feasible:            s(a,b) = 0              # 一票否决（宪法 H1/H2）
d(a→b) = b 满足 a 的软偏好 + 相似维 + 互补维 的程度   # 0..100
s(a,b) = HarmonicMean(d(a→b), d(b→a))              # 调和平均惩罚"剃头挑子一头热"
```

为什么用**调和平均**而不是普通平均：一段一方热一方冷的关系大概率失败，调和平均会把这种 pair 压低，比算术平均更符合真实成功率。

> 现状：`fusion.fuse()` + 硬门已经实现了"硬/软分离"和对称打分（问卷相似度天然对称，judge 吃 A、B 双方，冲突判断是有方向的）。"方向性 d + 调和平均"是下一步精修（标在路线图），不影响当前可用性。

### 1.6 会员保障：为什么不能降阈值

你的要求：会员**尽量都要匹配成功**，成功 = `s(a,b) ≥ τ`。

**错误做法**：对会员降低 `τ`。后果是把本该被**硬约束淘汰**的人塞给会员 → 触发底线 → 举报 / 秒解除，比不匹配更伤。

**正确做法**（本项目已实现，宪法 H5）：把"必须满足的可行性"和"尽量满足的期望"分开——

| 手段 | 说明 | 代码 |
|---|---|---|
| 1. 永不放宽硬门 | 会员也不给触发底线的对象 | `rules.passes_hard_gate` + `fusion` 淘汰 |
| 2. 扩大候选池 | 会员放宽**软性**召回、跨轮保留 | `recall_top_k`（可给会员调大） |
| 3. 全局匹配优先权 | 会员先选 | `global_match(priority=members)` |
| 4. 低于阈值也给最优可行对象 | 只要 feasible，会员即使 `s<τ` 也匹配，元数据标 `guaranteedForMember=true` | `orchestrator` 保留会员 sub-threshold pair |
| 5. 真·空池才退款 | 池中确实无任何可行对象时退款，不伪造 | `emptyPoolUserIds` |

一句话：**"会员一定能匹配" = "会员一定拿到池中对他最好的可行对象，除非池中没有任何可行对象（此时退款）"**。`τ` 仍是**质量信号**（用于报表、灰度、分群指标），不是一个为会员作弊放松的门。

### 1.7 演进路线（algorithm.md §11）

| 版本 | 打分器是谁 | 触发条件 |
|---|---|---|
| **V1（现在）** | 规则硬门 + 规则/prompt 版抽取与 judge | 无数据即可上线 |
| **V2** | 微调 Pair Judge（本项目 `LLM_BACKEND=ollama`） | 有 1-3k 人工/修正标注 |
| **V3** | Learning-to-Rank（LightGBM）融合，替代手写权重 | 有稳定线上反馈 |
| **V4** | 双塔召回 + cross-encoder / 端到端 mutual score | 用户量大 + 大量真实反馈 |

**你的端到端梦想 = V4，用真实反馈训练，不是起点。**

### 1.8 对标大厂：我们不能输在哪、赢在哪

逐条对照 Tinder / Hinge / 抖音级推荐系统的核心武器：

| 大厂武器 | 我们 | 状态 |
|---|---|---|
| 召回 → 精排两阶段 | 规则召回 `recall.py` + Pair Judge 精排 | ✅ 架构对齐 |
| 混合可解释打分 | 硬门 + 结构化画像 + 融合 | ✅ 比纯 embedding 更可审计 |
| **稳定匹配 Gale-Shapley**（Hinge 官方主打） | `stable_one_to_one`：二部图→GS 保证**零阻塞对**，非二部图→阻塞对消除 | ✅ **已实现并有测试证明打败贪心** |
| **方向性欲望度**（A 对 B ≠ B 对 A） | `pairscore.directional` + 调和平均 mutual score | ✅ 已实现 |
| 反馈闭环 / 学习权重 | LTR 设计就绪 | 🔜 需真实反馈（§1.2 循环蒸馏，现在建=自欺） |
| 双塔 + ANN 大规模召回 | 规则召回（万级够用） | 🔜 需规模，接 embedding |
| Elo / 受欢迎度建模 | 方向性欲望度已含"谁更想要谁" | ◐ 部分 |
| 探索 / 反马太效应 | 长等待用户优先 `fairness_wait_rounds` + 曝光字段 | ◐ 骨架就绪 |
| 安全 / 公平约束 | 匹配宪法（代码强制） | ✅ **领先**（大厂也常被诟病这块） |

**为什么稳定匹配是硬通货**：贪心最大权匹配会留下**阻塞对**——两个人都更想要对方，却各自被配给了别人。这样的用户很快就会对匹配结果不满、流失。Gale-Shapley 的延迟接受（deferred acceptance）在二部图上**数学保证零阻塞对**（诺贝尔经济学奖成果）。我们的 `tests/test_pipeline.py::test_stable_beats_greedy_on_blocking_pairs` 用经典反例证明：**同一批人，贪心留 1 个阻塞对，我们留 0 个**。每次匹配的 `matchStats.blocking_pairs` 会上报，可持续监控稳定性。

诚实的话：**真正还需要"规模 + 真实数据"才能补的是 LTR 和双塔**——但那两样现在建是自欺（§1.2）。在"用现有信息能做到最好"这个意义上，匹配层我们不输。

---

## 2. 匹配宪法

回答你的"是不是应该写一个宪法 prompt"——**是，而且我已经写好并接进代码了**：`app/constitution.py`。

它的精髓不是"一段更长的 prompt"，而是**分成两半、用不同机制保证**：

```
硬条款 HARD_ARTICLES   →  代码强制（rules.py / fusion.py），不信任模型
软条款 SOFT_ARTICLES   →  进每个 LLM 系统提示词，塑造判断
```

这样即使模型被越狱或幻觉，也**永远无法违反硬条款**，因为代码门先跑、与模型输出无关。软条款只影响"分数里连续、需要判断的那部分"。

- **硬条款**（H1 双向底线一票否决、H2 硬性偏好、H3 安全优先、H4 不重复、H5 会员保障不牺牲安全）
- **软条款**（S1 期待与底线分离、S2 相似与互补分清、S3 近义不是冲突、S4 公平不歧视、S5 隐私与善意、S6 格式纪律）

`CONSTITUTION_VERSION` 会盖进每条匹配的 `metadata.constitutionVersion`，任何一次匹配都能**回放到当时生效的宪法版本**（可审计）。改宪法就 bump 版本号。

查看全文与措辞：`app/constitution.py`。它已被 `app/llm/prompts.py` 里的 extractor / pair-judge 系统提示词自动前置。

---

## 3. 问卷科学设计

回答你的"用户希望什么不一定实现，但不能容忍的一定要满足"——这正是问卷设计的第一原则。

设计契约在 `questionnaire/uspark_questionnaire.json`，跑 `python questionnaire/validate.py` 校验。

### 3.1 每道题都带两个标签

| 标签 | 取值 | 含义 |
|---|---|---|
| `matchSemantics` | `filter` / `similar` / `complement` / `freeform` | 这题**怎么用**于匹配 |
| `hardness` | `hard` / `soft` | 这题是**底线**还是**期望** |

- **`hard`（不能容忍）** → 抽成 dealbreaker（`reject`, `flexibility=1`）→ 进硬门，**必须满足**。
- **`soft`（希望）** → 软偏好（`target=partner`）→ 只影响分数，**尽力满足不保证**。

这就是你说的"希望 vs 不能容忍"的正式落地：问卷用**两个对称的 section** 分别收集——
- `S1_dealbreakers`：「你**绝对不能接受**对方…」（全 hard）
- `S7_aspiration`：「你**希望**对方是怎样…」（全 soft）

### 3.2 四类语义（对应第1、2层）

| matchSemantics | 匹配逻辑 | 例题 |
|---|---|---|
| `filter` | 硬/软门，不做相似度打分 | 性别偏好、年龄范围、是否必须同城、能否接受吸烟 |
| `similar` | 越接近分越高（物以类聚） | 关系认真度、价值观、作息、金钱观、沟通频率 |
| `complement` | 适度差异反而更高（互补） | 社交能量(内向/外向)、表达欲(倾听/健谈) |
| `freeform` | 自由文本 → Profile Extractor | 个性签名、"我讨厌他吃香菜"、"喜欢猫" |

### 3.3 心理测量学要点（题目本身要科学）

- **区分"描述自己"和"要求对方"**（`target: self/partner`）——同一个话题两个方向意义完全不同。
- **相似 ≠ 全都要相似**：`关系认真度` 必须相似（认真 vs 随便是冲突不是互补，权重 1.5）；`社交能量` 适度互补更好。别把所有维度都当相似算。
- **Likert 5 点**做量表题，**强制选择**做价值观题；避免一题问两件事（double-barreled）；控制题量（完成率影响资料完整度，见 `algorithm.md §7` 的完整度偏差）。
- 分组 `group` 和 `orderRange` 与 `app/pipeline/rules.py` 的权重表对齐，问卷分 `questionnaire_score()` 才算得对。

`validate.py` 会强制这些不变量（例：`hard` 题不能是 `similar`，否则等于拿一个量表当一票否决门）。

---

## 4. 架构与代码地图

```
硬门 → 语义画像 → 召回top-K → Pair Judge → 融合 → 全局匹配 → MatchResult
rules   extractor   recall     pair_judge   fusion  global_match  orchestrator
```

| 文件 | 职责 |
|---|---|
| `app/constitution.py` | **匹配宪法**：硬条款(代码强制)+软条款(进prompt) |
| `app/mode_profile.py` | **交友/恋爱的全部差异**：问卷权重、融合权重、匹配拓扑、花费、硬约束（见 §4.1） |
| `app/schemas.py` | 线上契约（镜像 NestJS `match-model.interface.ts`）+ 语义类型 |
| `app/config.py` | 环境配置（backend、阈值、召回 K） |
| `app/llm/client.py` | ollama 客户端（`format:json`），仅 `LLM_BACKEND=ollama` 时用 |
| `app/llm/prompts.py` | extractor / judge 的系统提示词（前置宪法）+ user 消息构造 |
| `app/pipeline/rules.py` | **硬门** + 问卷/人口学打分（从现有 ScoringProvider 逐行移植） |
| `app/pipeline/lexicon.py` | 小词典：topic→topicGroup、否定/对象识别（撑起 mock 与弱标注） |
| `app/pipeline/extractor.py` | Profile Extractor：规则版 + LLM 版，同一 schema |
| `app/pipeline/pair_judge.py` | Pair Judge：香菜硬冲突 / 猫狗非冲突 / 认真度冲突 都在这 |
| `app/pipeline/recall.py` | 便宜规则召回 top-K，控成本（不让 LLM 跑全 O(n²)） |
| `app/pipeline/fusion.py` | 融合打分（§5 模式权重）+ severity-5 硬冲突淘汰（对称核） |
| `app/pipeline/pairscore.py` | **方向性欲望度** d(a→b) + 调和平均 mutual score（§1.5） |
| `app/pipeline/global_match.py` | **Gale-Shapley 稳定匹配** + 阻塞对审计(恋爱) / 带容量 b-matching(朋友)，会员+公平优先 |
| `app/pipeline/orchestrator.py` | 串起整条流水 → MatchResult（含会员保障、退款、可审计 metadata） |
| `app/main.py` | FastAPI 服务，`POST /match` |
| `questionnaire/` | 问卷设计契约 + 校验器 |
| `data/` | 合成数据生成 + 微调 JSONL 导出 |
| `feedback/` | **反馈闭环**：曝光/行为 schema + 归因 + LTR 训练 + ranker（见 §8） |
| `tests/` | 端到端冒烟测试（dialogue 两案例 + job + 会员保障 + 稳定匹配 + 反馈闭环） |

**为什么做成独立服务**：NestJS 后端已经有 `ai-match-model.provider.example.ts`，它就是 `POST {candidates, constraints} → MatchResult`。本服务实现**完全相同的契约**，所以接入是改配置不是改代码。

### 4.1 交友 vs 恋爱：一套算法，两份配置

结论：**用同一套算法，不写两套。** 整条流水（硬门 → 语义画像 → 召回 → judge → 融合 → 全局匹配 → 反馈）是**一条代码路径**，`mode` 是一等参数。所有真正的差异集中在**一个配置对象** `app/mode_profile.py::ModeProfile`，而不是散落在各文件的 `if mode=='friend'`。加第三种业务（比如"搭子/组队"）= 加一份 profile。

| 差异点 | 恋爱 romantic | 交友 friend | 配在哪 |
|---|---|---|---|
| 硬约束 | 性别偏好必须双向满足 | 只在用户填了才生效 | `gender_pref_required` |
| 问卷题组+权重 | 生活习惯/价值观/恋爱观/沟通/财务观 | 社交风格/兴趣活动/人格节奏/价值观/生活规划 | `category_weights` |
| 融合权重 | LLM.35/问卷.25/画像.15/语义.15/互补.10 | LLM.30/兴趣活动.25/问卷.20/语义.15/校园.10 | `fusion_weights` |
| **匹配拓扑** | **独占，一人一个**(稳定匹配 GS) | **一人可多个朋友**(带容量 b-matching) | `exclusive` / `default_capacity` |
| **一次匹配花费** | 3 能量 | 1 能量 | `match_cost` / `empty_pool_refund` |
| 质量阈值 | 全局默认 | 可单独覆盖 | `score_threshold` |

**关于你提的两点**：
- **问卷不一样** → `questionnaire/uspark_questionnaire.json` 每个 section 标了 `mode`（romantic/friend/both），两个前端各渲染各的题；`questionnaire/validate.py` 会强制校验**每个模式的题组和它的 ModeProfile 权重一一对应**（跑一下就知道对不对）。共有的题（基础事实、底线、价值观、期待、自由备注）只写一次，标 `both`。
- **花费不一样** → 就是 `match_cost`（恋爱 3 / 交友 1），空池退款也按各自的 `empty_pool_refund`，metadata 里带出来给后端扣费。

共享的部分（不因模式改变）：匹配宪法、Extractor/Judge 的 prompt 与 schema、稳定匹配算法本身、方向性欲望度、整个反馈闭环。

---

## 5. 怎么跑

```bash
cd matching-ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # 默认 LLM_BACKEND=mock，无需 ollama

# 1) 冒烟测试：直接看 dialogue.txt 两个案例 + 完整 job + 会员保障
python tests/test_pipeline.py

# 2) 校验问卷设计
python questionnaire/validate.py

# 3) 起服务
python -m app.main              # 监听 :8100
curl -s localhost:8100/health   # {"status":"ok","llm_backend":"mock"}

# 4) 跑通反馈闭环（合成反馈，测管线；详见 §8）
python feedback/gen_synthetic_feedback.py --users 80 --rounds 3
python -m feedback.train_ranker --store feedback/store --out feedback/store/ranker.json
```

调 `/match`（契约与 NestJS 侧一致）：

```bash
curl -s localhost:8100/match -H 'Content-Type: application/json' -d '{
  "candidates":[
    {"userId":"u1","gender":"female","genderPref":"male","age":22,"city":"London","school":"UCL","interests":["猫","摄影"],"bio":"认真恋爱","answers":[]},
    {"userId":"u2","gender":"male","genderPref":"female","age":23,"city":"London","school":"UCL","interests":["猫","摄影"],"bio":"想找认真的","answers":[]}
  ],
  "constraints":{"mode":"romantic","maxMatchesPerUser":1}
}'
```

返回的每个 pair 的 `metadata` 带 `scoreBreakdown / reasons / risks / modelVersions / constitutionVersion`，可直接写进 `Match.metadata` 供审计与回放。

---

## 6. 数据与微调

> 📖 **完整训练手册（含真实训练数据示例、每步命令、产出）在 [`TRAINING.md`](TRAINING.md)。** 本节只是速览。

> 现在**不 pull ollama**：本地只生成数据；微调 + 部署在服务器上一起做。在那之前服务跑 `mock`（规则版），输出同样的 schema。

### 6.1 生成数据

```bash
python data/gen_synthetic.py --n 800 --pairs 2500 --out data/out
python data/build_extractor_dataset.py --in data/out/profiles.jsonl --out data/out/extractor.sft.jsonl
python data/build_judge_dataset.py     --in data/out/pairs.jsonl    --out data/out/judge.sft.jsonl
```

输出 OpenAI 风格 `{"messages":[system,user,assistant]}` 的 JSONL（train/val/test 8:1:1），system/user 用的是**和线上服务同一套 prompt**（`app/llm/prompts.py`），训练与推理不会漂移。

> ⚠️ 合成的是**规则弱标注**，只做冷启动种子。按 §1.2 和 `algorithm.md §4.1.C`：**抽样人工修正**后再训练，并尽快混入真实人工标注 pair。别拿弱标注当"好匹配"的真值。

### 6.2 微调（LLaMA-Factory 示例，基座推荐 Qwen2.5-7B-Instruct）

两个独立 LoRA：`uspark-profile-extractor`（画像抽取）、`uspark-pair-judge`（兼容判断）。

```bash
llamafactory-cli train \
  --stage sft --do_train --model_name_or_path Qwen/Qwen2.5-7B-Instruct \
  --dataset uspark_extractor --template qwen --finetuning_type lora \
  --lora_target all --output_dir out/extractor-lora \
  --per_device_train_batch_size 2 --gradient_accumulation_steps 8 \
  --lr_scheduler_type cosine --learning_rate 1e-4 --num_train_epochs 3 --bf16 --cutoff_len 4096
```

`dataset_info.json` 用 `formatting: sharegpt`、`columns.messages: messages`。judge 同理换数据集。unsloth / axolotl 吃同样的 JSONL。

### 6.3 用 ollama 上线（服务器）

```bash
# 合并 LoRA、导出 GGUF 后：
printf 'FROM ./extractor.gguf\nPARAMETER temperature 0.2\n' > Modelfile.extractor
ollama create uspark-profile-extractor -f Modelfile.extractor
ollama create uspark-pair-judge        -f Modelfile.judge

LLM_BACKEND=ollama OLLAMA_BASE_URL=http://localhost:11434 \
EXTRACTOR_MODEL=uspark-profile-extractor PAIR_JUDGE_MODEL=uspark-pair-judge \
python -m app.main
```

流水代码不变——`build_extractor`/`build_judge` 把规则路换成 LLM 路；**LLM 出错会自动降级回规则路**，匹配任务永不硬失败。

### 6.4 上线前评估（algorithm.md §4.6）

留出 `*.test.jsonl`，看：JSON schema 合法率、否定语义召回（"讨厌香菜"是否保持 `reject`）、dealbreaker 召回、硬冲突漏判率、pair 分与人工分相关性。过了再灰度 5→20→50→100%。

---

## 7. 接入 NestJS 后端

**（P0-1 已完成）** 后端 `apps/api/src/matching/providers/ai-match-model.provider.ts` POST `{candidates,constraints}` 到 `AI_PROVIDER_URL` 拿 `MatchResult`，本服务就是这个契约。接入只剩环境变量：

**① 环境变量**（backend 侧）
```bash
AI_PROVIDER_URL=http://<matching-ml-host>:8100/match   # 注意带 /match 路径
AI_PROVIDER_API_KEY=<shared-secret>                    # = 本服务 MATCH_API_KEY
# AI_PROVIDER_TIMEOUT_MS=300000                        # 可选，请求超时
```

**② provider 绑定已做成 env 开关**（`apps/api/src/matching/matching.module.ts`）：缺省配置了 `AI_PROVIDER_URL` 即用 `AIMatchModelProvider`；`MATCH_MODEL=scoring` 一行回退到本地打分（`MATCH_MODEL=ai` 强制 AI）。

**③ 契约对齐**：候选人字段与 `match-model.interface.ts` 1:1（含 `_prefs` 和带 `questionGroup/questionOrder` 的 `answers[]`）。响应填 `pairs/unmatched/emptyPoolUserIds/modelVersion/processingTimeMs`，每个 pair 的 `metadata` 已带打分拆解、理由、模型版本、宪法版本，直接落 `Match.metadata`。

**注意事项**
- **鉴权（P0-5 已实现，fail-closed）**：`/match` 校验 `Authorization: Bearer <MATCH_API_KEY>`（`app/main.py` 的 `require_api_key` 依赖）。`MATCH_API_KEY` 须与后端 `AI_PROVIDER_API_KEY` 一致；留空仅允许回环地址（启动时打警告），**非回环绑定 + 空 key 直接拒绝启动**。`/health` 不鉴权。
- **降级**：ollama 挂了，服务自动逐 pair 回退规则路，`/match` 仍返回合法结果。
- **成本**：召回把 LLM 调用限制在每人 `RECALL_TOP_K`；超大池再加 embedding 召回（algorithm.md §10.3）。

---

## 8. 反馈学习闭环

这是整个系统里**唯一让它"越用越准"**的机制。前面所有东西（宪法、稳定匹配、融合打分）都是**没数据时的最优起点**，但它们不会自己变聪明——让它变聪明的只有用户反馈。代码在 `feedback/`。

> 📖 **排序器训练的数据长什么样、怎么训、真实样本 → 见 [`TRAINING.md`](TRAINING.md) 训练 B。** 本节讲原理与纪律。

### 8.1 闭环全貌

```
匹配曝光 → 用户行为采集 → 归因(join+窗口) → 训练 LTR → 灰度上线 → 新一轮反馈
exposures  events         attribution      train_ranker   ranker.json
```

三个层次，反馈改的东西完全不同（改良主要发生在**第1层**，不碰大模型、快、可解释）：

| 层次 | 改什么 | 频率 | 代码 |
|---|---|---|---|
| 第1层 | 学习融合权重（替代 `fusion.py` 手写的 0.35×LLM+…） | **每周** | `feedback/train_ranker.py` |
| 第2层 | 微调 Pair Judge（哪些冲突真严重、哪些互补是真互补） | 每月 | §6 |
| 第3层 | 微调 Profile Extractor（老抽错画像才修） | 很少 | §6 |

### 8.2 三条不做就"越学越蠢"的纪律（已写进代码）

1. **没曝光 ≠ 拒绝**：只有被展示过的 pair 才进训练；没曝光的不能当负样本。→ `MatchExposure` 是地基。
2. **存当时的特征快照**：用户资料/模型会变，训练必须用**匹配当时**冻结的 `featureSnapshot`，不能事后重算，否则因果污染（§9.4）。→ `features.build_snapshot` 在流水里冻结，写进 metadata。
3. **反馈分强弱**：举报/拉黑=强负，"没眼缘"=弱负，划走≈不算；区分"不喜欢"和"没上线"（`bothActive`）。→ 多任务标签 `OutcomeLabel`，非二分类。

### 8.3 LTR 学什么

多任务预测四个概率（`RANKER_TASKS`），再合成 RankScore（§9.5.1）：

```
RankScore = 0.40·P(mutualConfirm) + 0.35·P(conversation) + 0.20·P(survive7d) − 0.50·P(report)
```

**手写的融合分本身也成了 ranker 的一个输入特征**（`fusedScore`）——这正是 learning-to-rank 的正解（§3.3）：不是丢弃规则，而是让模型从真实反馈里学各信号该占多重。

### 8.4 现在就能跑（合成反馈测通管线）

```bash
python feedback/gen_synthetic_feedback.py --users 80 --rounds 3   # 造曝光+行为 -> feedback/store/
python -m feedback.train_ranker --store feedback/store --out feedback/store/ranker.json
RANKER_MODEL_PATH=feedback/store/ranker.json python -m app.main    # 流水自动改用学到的权重
```

> ⚠️ **合成反馈只测管线，不代表真实偏好**（README §1.2 循环蒸馏）：模拟的结果是模型自己特征的函数，ranker 只是把注入信号学回来。它唯一的作用是把"曝光→归因→训练→上线"跑通、看标签分布。**有真实用户后立刻换真数据。** LightGBM 装了就自动用，没装用 numpy 逻辑回归兜底。

**校准提醒**：RankScore 的量纲比 fusion 分更压缩，启用 ranker 后要**重新调 `SCORE_THRESHOLD`**（和切 LLM backend 一样，是 per-backend 校准）。

### 8.5 后端落库

`feedback/prisma_models.prisma` 是 `MatchExposure` / `MatchBehaviorEvent` 两张表，粘进 `api/app/prisma/schema.prisma` 跑 migrate。后端匹配任务后调 `feedback/emit.exposures_from_result` 落曝光，用户行为落 event；每天归因成训练样本。`JsonlSink` 是本地文件版，换 DB 只改 sink。

---

## 9. 现状与路线图

- [x] **V1 骨架**：宪法 + 硬门 + 抽取 + judge + 融合 + 全局匹配 + 会员保障，mock 下端到端可跑、可测
- [x] 匹配宪法（硬条款代码强制 + 软条款进 prompt），版本盖进 metadata
- [x] 问卷设计契约 + 校验器（hard/soft × filter/similar/complement/freeform）
- [x] 合成数据 + 微调 JSONL 导出（与线上同 prompt）
- [x] **mutual score 精修**：方向性 `d(a→b)` + 调和平均（§1.5）
- [x] **Gale-Shapley 稳定匹配** + 阻塞对审计（§1.8，有测试证明打败贪心）
- [x] 反马太效应骨架：长等待用户优先 + 曝光字段
- [x] **反馈闭环地基（V3 前置）**：曝光/行为 schema + 归因 + 多任务 LTR + ranker 热插融合层（§8，有测试）
- [ ] **V2**：微调 Pair Judge，`LLM_BACKEND=ollama`（服务器上）
- [ ] **V3 上线**：后端埋 `MatchExposure`/`MatchBehaviorEvent` → 收真实反馈 → 每周训 ranker（地基已就绪）
- [ ] 真实人工标注工具（运营给 pair 打 1-5 分）——V2 训练数据的主来源
- [ ] `/match` 鉴权、embedding 召回（双塔）、朋友模式稳定 b-matching
- [ ] **V4**：双塔 + cross-encoder / 端到端——**只在有大量真实反馈后**
```
