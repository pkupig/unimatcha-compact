# 训练完全指南（训练数据是什么 + 怎么训）

这份文档只讲一件事：**每种训练，数据长什么样、从哪来、怎么生成、怎么训、产出什么、怎么用上。**
所有命令都在 `matching-ml/` 目录下跑。所有示例都是脚本真实产物，不是示意。

---

## 0. 先分清楚：这里有两套完全不同的训练

很多混乱来自把这两件事当成一件。它们**数据不同、工具不同、频率不同**：

| | **训练 A：微调大模型** | **训练 B：训练排序器 (LTR)** |
|---|---|---|
| 训练谁 | Profile Extractor + Pair Judge（两个 LLM） | ranker（LightGBM / 逻辑回归，不是大模型） |
| 学会做什么 | 把用户文本→结构化画像；把两人→兼容判断 | 从真实反馈学"各信号该占多重" |
| 训练数据 | JSONL，chat messages（system/user/assistant） | 特征向量 + 多任务标签 |
| 数据从哪来 | 合成画像/pair + 人工标注 | **真实**曝光 + 用户行为 |
| 何时训 | 冷启动一次，之后每月 | **每周** |
| 产出 | LoRA→合并→GGUF→ollama 模型 | `ranker.json` |
| 现在能训吗 | ✅ 能（合成数据现成） | ✅ 能（合成反馈测管线）／真数据待上线 |
| 生成脚本 | `data/gen_synthetic.py` + `data/build_*_dataset.py` | `feedback/gen_synthetic_feedback.py` |
| 训练脚本 | LLaMA-Factory（外部） | `feedback/train_ranker.py` |

**一句话**：训练 A 让大模型"看懂人"；训练 B 让系统"从真实反馈里学会排序"。A 先做（冷启动），B 上线后持续做（越用越准）。

---

## 训练 A：微调大模型

### A.1 训练两个模型，各自的输入 / 输出

| 模型 | 输入 | 输出 |
|---|---|---|
| **Profile Extractor** | 单个用户的资料 / 问卷 / 自由文本 | `UserSemanticProfile` JSON（结构化画像） |
| **Pair Judge** | 两个用户的画像 + 结构化差异 | `PairCompatibility` JSON（兼容分/冲突/理由） |

微调的本质：**给定 `user` 消息，学会产出 `assistant` 消息**（那段 JSON）。`system` 消息是固定的宪法 + 任务说明。

### A.2 训练数据长什么样（真实样本，一条 = 一个 JSONL 行）

每行是一个 `{"messages": [system, user, assistant]}`。以 **Profile Extractor** 为例：

```json
{"messages": [
  {"role": "system", "content": "【U-Spark 匹配宪法 match-constitution-v1】...(宪法6条 + 抽取任务5条规则)..."},
  {"role": "user", "content": "mode: romantic\n用户资料（JSON）:\n{\n  \"age\": 21,\n  \"gender\": \"male\",\n  \"school\": \"Manchester\",\n  \"interests\": [\"健身\"],\n  \"bio\": \"先聊聊看缘分\"\n}\n\n请输出 UserSemanticProfile JSON。"},
  {"role": "assistant", "content": "{\"version\":\"...\",\"relationshipIntent\":{\"mode\":\"romantic\",\"seriousness\":2,...},\"preferences\":[{\"topic\":\"健身\",\"topicGroup\":\"sport\",\"polarity\":\"like\",\"target\":\"self\",\"strength\":3,...}],\"dealbreakers\":[],...}"}
]}
```

- `system`：**训练和上线用的是同一段**（`app/llm/prompts.py`，里面已前置匹配宪法）。这样模型学到的行为和线上一致，不漂移。
- `user`：模型的输入（这个用户的原始资料）。
- `assistant`：**模型要学会输出的正确答案**——一段合法的 `UserSemanticProfile` JSON。

**Pair Judge** 同理，只是 `user` 换成"两个画像 + 差异"，`assistant` 是真实产物长这样：

```json
{"llmScore": 55.0, "confidence": 4,
 "dimensions": {"values": 20, "lifestyle": 70, "communication": 60, "interests": 40, "longTermPlan": 20, "complementarity": 45, "conflictRisk": 40},
 "hardConflicts": [{"topic": "关系目标", "severity": 4, "reason": "一方想认真长期，一方偏随意，关系目标差距较大"}],
 "softConflicts": [],
 "positiveReasons": ["都喜欢猫", "都喜欢运动"],
 "cautionReasons": ["一方想认真长期，一方偏随意，关系目标差距较大"]}
```

模型学的就是：看到两个画像，能不能稳定吐出这样一段——分数对、把"认真 vs 随便"识别成硬冲突、把"都喜欢猫/运动"识别成正向理由。

### A.3 这些 `assistant` 答案从哪来（关键！）

冷启动阶段没有真人标注，我们**先用规则弱标注**生成 `assistant`（`data/gen_synthetic.py` 用规则版 extractor/judge 跑出画像和判断）。但——

> ⚠️ **纪律（algorithm.md §4.1.C，务必遵守）**：合成弱标注**只是种子**，作用是①教模型稳定输出 schema、②覆盖稀有场景（强 dealbreaker、否定语义）。**它不是"什么是好匹配"的真值。**
> 上线前必须：**抽样人工修正**一批 `assistant` 答案，并尽快混入**真人标注**（运营/种子用户对 pair 打 1-5 分 + 写理由）。真人标注才是 Pair Judge 质量的主来源。

四类数据来源（按可靠度）：专家/运营人工标注 > 种子用户双向盲测 > 合成画像（本仓库） > 早期线上反馈。

### A.4 怎么生成训练数据（命令）

```bash
# 1) 生成合成画像 + pair（弱标注）
python data/gen_synthetic.py --n 800 --pairs 2500 --out data/out
#    -> data/out/profiles.jsonl  (每行: 一个用户的 raw + semantic 画像)
#    -> data/out/pairs.jsonl     (每行: 两个画像 + diff + label)

# 2) 转成微调用的 chat JSONL，并切 train/val/test = 8:1:1
python data/build_extractor_dataset.py --in data/out/profiles.jsonl --out data/out/extractor.sft.jsonl
python data/build_judge_dataset.py     --in data/out/pairs.jsonl    --out data/out/judge.sft.jsonl
#    -> data/out/extractor.sft.{train,val,test}.jsonl
#    -> data/out/judge.sft.{train,val,test}.jsonl
```

规模建议（algorithm.md §7.3 第一阶段）：Extractor 和 Judge 各 **1000–3000 条**，其中相当比例经人工修正。

### A.5 怎么训练（LLaMA-Factory，基座推荐 Qwen2.5-7B-Instruct）

两个模型分开各训一个 LoRA。`dataset_info.json`：

```json
{"uspark_extractor": {"file_name": "extractor.sft.train.jsonl", "formatting": "sharegpt",
  "columns": {"messages": "messages"},
  "tags": {"role_tag":"role","content_tag":"content","user_tag":"user","assistant_tag":"assistant","system_tag":"system"}},
 "uspark_pair_judge": {"file_name": "judge.sft.train.jsonl", "formatting": "sharegpt",
  "columns": {"messages": "messages"},
  "tags": {"role_tag":"role","content_tag":"content","user_tag":"user","assistant_tag":"assistant","system_tag":"system"}}}
```

```bash
llamafactory-cli train \
  --stage sft --do_train --model_name_or_path Qwen/Qwen2.5-7B-Instruct \
  --dataset uspark_extractor --template qwen --finetuning_type lora \
  --lora_target all --output_dir out/extractor-lora \
  --per_device_train_batch_size 2 --gradient_accumulation_steps 8 \
  --lr_scheduler_type cosine --learning_rate 1e-4 --num_train_epochs 3 --bf16 --cutoff_len 4096
# 换 --dataset uspark_pair_judge --output_dir out/judge-lora 再训一次
```

unsloth / axolotl 吃同样的 JSONL。

### A.6 产出 → 上线（服务器）

```bash
# 合并 LoRA 到基座、导出 GGUF 后：
printf 'FROM ./extractor.gguf\nPARAMETER temperature 0.2\n' > Modelfile.extractor
ollama create uspark-profile-extractor -f Modelfile.extractor
ollama create uspark-pair-judge        -f Modelfile.judge

LLM_BACKEND=ollama EXTRACTOR_MODEL=uspark-profile-extractor PAIR_JUDGE_MODEL=uspark-pair-judge \
python -m app.main
```

流水代码不改；LLM 出错自动回退规则版。

### A.7 上线前评估（用 `*.test.jsonl`，algorithm.md §4.6）

JSON schema 合法率、否定语义召回（"讨厌香菜"是否保持 `reject`）、dealbreaker 召回、硬冲突漏判率、pair 分与人工分相关性。过了再灰度 5→20→50→100%。

---

## 训练 B：训练排序器 (LTR)

### B.1 训什么

一个多任务排序器，预测**四个概率**，再合成最终排序分：

```
输入: 一个 pair 的特征向量(28维)
输出: P(双方确认), P(互聊), P(存活7天), P(被举报)
RankScore = 0.40·P(确认) + 0.35·P(互聊) + 0.20·P(存活) − 0.50·P(举报)
```

RankScore 替代 `fusion.py` 里手写的 `0.35×LLM + 0.25×问卷 + …`。

### B.2 训练数据长什么样（真实样本）

一条训练样本 = **一次曝光的冻结特征** + **归因出的多任务标签**。

**① 曝光记录**（匹配展示时落的，`MatchExposure`）——注意 `featureSnapshot` 是**当时冻结**的特征：

```json
{"exposureId": "r0-0-u000-u017", "mode": "friend", "userAId": "u000", "userBId": "u017",
 "algorithmVersion": "hybrid-llm-friend-v1", "constitutionVersion": "match-constitution-v1",
 "featureSnapshot": {
   "llmScore": 89.0, "confidence": 3.0,
   "dim_values": 80.0, "dim_lifestyle": 70.0, "dim_interests": 40.0, "dim_conflictRisk": 0.0,
   "fusedScore": 76.5, "f_questionnaire": 10.0, "f_semantic": 9.8, "riskPenalty": 0.0,
   "hardConflicts": 0.0, "softConflicts": 0.0,
   "ageDiff": 5.0, "sameSchool": 1.0, "sameCity": 1.0, "sharedInterests": 1.0,
   "desir_aToB": 76.5, "desir_bToA": 76.5, "desir_mutual": 76.5 },
 "finalScore": 76.5, "shownAt": "2026-01-01T12:00:00"}
```

**② 行为事件**（用户每个动作落一条，`BehaviorEvent`）：

```json
{"mode": "friend", "userAId": "u000", "userBId": "u017", "actorId": "u000", "type": "viewed", "at": "2026-01-01T12:01:00"}
{"mode": "friend", "userAId": "u000", "userBId": "u017", "actorId": "u017", "type": "message", "at": "2026-01-01T12:40:00"}
```

**③ 归因后的训练样本**（`attribution.build_samples` 把①②按 pair+时间窗口 join 出来）——真实产物：

```json
{"features": [89.0, 3.0, 80.0, 70.0, 60.0, 55.0, ... 共28维 ...],
 "label": {"viewed":1, "openedProfile":1, "userAConfirmed":1, "userBConfirmed":0, "mutualConfirmed":0,
           "firstMessageSent":1, "mutualConversation":0, "messageCountBucket":"1-2",
           "survived7d":0, "dissolvedQuickly":0, "reportedOrBlocked":0, "bothActive":1},
 "successScore": 0.55}
```

- `features`：28 维，就是曝光时冻结的 `featureSnapshot` 按固定顺序拉平（顺序见 `feedback/features.py::FEATURE_NAMES`）。
- `label`：**多任务**，不是一个 0/1。ranker 的四个头分别学 `mutualConfirmed / mutualConversation / survived7d / reportedOrBlocked`。
- `successScore`：一个加权汇总标量（举报=−1.0，双方确认=+0.70…），供分析/调权用。

### B.3 数据从哪来

**真实来源**：后端在匹配后落 `MatchExposure`，用户每个动作落 `MatchBehaviorEvent`（两张表 schema 见 `feedback/prisma_models.prisma`）。这才是有价值的数据。

**现在没真实用户**：用 `feedback/gen_synthetic_feedback.py` 造一批**测管线**。

> ⚠️ **纪律（README §1.2 循环蒸馏）**：合成反馈是"模型自己特征的函数 + 噪声"，ranker 只是把注入信号学回来，**不代表真实人类偏好**。它唯一作用是把"曝光→归因→训练→上线"跑通、看标签分布。**有真实用户立刻换真数据。**

三条防"越学越蠢"的纪律（已写进 `attribution.py`）：
1. **没曝光的 pair 不能当负样本**（用户根本没看到）。
2. **用当时的特征快照训练**，不能事后重算（资料/模型会变，否则因果污染）。
3. **反馈分强弱**：举报/拉黑=强负，"没眼缘"=弱负，划走≈不算；用 `bothActive` 区分"不喜欢"和"没上线"。

### B.4 + B.5 怎么准备 + 怎么训（命令）

```bash
# 准备数据（真实上线后这一步由后端埋点自动产生；现在用合成）
python feedback/gen_synthetic_feedback.py --users 200 --rounds 5
#   -> feedback/store/exposures.jsonl , feedback/store/events.jsonl

# 训练（LightGBM 装了就用，没装自动用 numpy 逻辑回归兜底）
python -m feedback.train_ranker --store feedback/store --out feedback/store/ranker.json
#   内部: 读曝光+行为 -> attribution 归因成样本 -> 每个任务训一个二分类头 -> 写 ranker.json
#   打印每个任务的 posRate(正样本率)，用来看标签是否均衡
```

### B.6 上线（热插，不改流水代码）

```bash
RANKER_MODEL_PATH=feedback/store/ranker.json python -m app.main
```

有模型就用 ranker 的 RankScore，没模型就回退 `fusion.py` 手写权重（`metadata.scoreSource` 会标 `ranker`/`fusion`）。

> ⚠️ **校准**：RankScore 量纲比 fusion 分更压缩，启用 ranker 后要**重新调 `SCORE_THRESHOLD`**（跟切 LLM backend 一样是 per-backend 校准）。

### B.7 频率 + 评估

- **每周**重训（`algorithm.md §9.8`：实时收集、每天生成样本、每周训、灰度 5→20→50→100%）。
- 评估看长期质量，不只点击率：mutual confirm rate、first message rate、7 天留存、快速解除率、举报率；并做分群（新老用户/性别/学校/资料完整度）。总指标涨但某群体明显变差，不全量上线。

---

## 数据流总图

```
                        ┌─────────────── 训练 A（大模型，冷启动/每月）───────────────┐
用户资料/问卷/文本 ──▶ gen_synthetic ──▶ build_*_dataset ──▶ *.sft.jsonl ──▶ LLaMA-Factory ──▶ GGUF ──▶ ollama
   (+人工修正/标注)                                                (chat messages)

                        ┌─────────────── 训练 B（排序器，上线后每周）───────────────┐
匹配展示 ──▶ MatchExposure(冻结特征) ┐
用户行为 ──▶ MatchBehaviorEvent ─────┴──▶ attribution 归因 ──▶ 样本(特征+多任务标签) ──▶ train_ranker ──▶ ranker.json
   (真实反馈 / 现在用合成测管线)                                                              ↑ 热插回 fusion 层
```

---

## 常见问题

**Q: 为什么不能直接拿合成数据当真值训到底？**
A: 合成的 `assistant`/反馈都是"已有规则/模型 + 噪声"的产物。模型最多把它蒸馏一遍，信息量不增反而继承偏见（循环蒸馏，README §1.2）。合成只用于教格式、覆盖稀有场景、测管线；真值必须来自**人工标注（训练A）**和**真实用户反馈（训练B）**。

**Q: 两套训练先后？**
A: 先训 A（没数据也能做，让系统能跑）。上线埋点 → 攒真实反馈 → 每周训 B（第1层，快、便宜、不碰大模型）。攒够高质量标注再回头每月微调 A 的 Pair Judge。

**Q: 现在最该做的一步？**
A: 后端埋点（落 `MatchExposure` + `MatchBehaviorEvent`）。没有它，训练 B 的数据无从谈起，而训练 B 是"越用越准"的唯一引擎。
```
