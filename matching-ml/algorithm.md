# U-Spark 最终版匹配算法设计草稿

## 结论

我们应该使用微调大模型，但不能只靠微调大模型。

规则打分适合处理硬约束和基础可解释字段，例如性别偏好、年龄范围、同城同校、问卷量表、兴趣交集。但它很难处理 `dialogue.txt` 里真正关键的问题：

- “我讨厌他吃香菜”里的否定、对象和强度
- “喜欢猫”和“喜欢狗”这种同类但不同项的兼容关系
- 有些维度需要相似，有些维度需要互补
- 用户自由文本里隐含的底线、期待、情绪模式和关系观
- 两个人放在一起时是否真的有互动潜力

所以最终方案应是：

```text
硬规则过滤
  -> 微调大模型生成用户语义画像
  -> 微调大模型做 pairwise 兼容判断
  -> 规则/排序模型融合分数
  -> 全局最优匹配
  -> 反馈数据回流继续微调
```

大模型负责“理解人”，规则和优化算法负责“保证系统稳定、公平、可控”。

## 一、算法总架构

整体分为 6 层。

### 1. 数据层

数据来自当前系统已有字段：

- `Profile`: 年龄、性别、学校、城市、专业、年级、兴趣、bio、signature、tags、mbti、zodiac
- `UserMatchPreferences`: 性别偏好、年龄范围、同城/同校/同专业要求、朋友活动偏好、额外匹配说明
- `Answer`: 恋爱问卷和朋友问卷答案
- `Match`: 历史匹配、确认、过期、解除、分数、metadata
- `Message`: 匹配后的聊天行为，只用于训练反馈，不直接泄露给前端解释
- `Report` / block 信息：作为强负反馈和安全过滤

### 2. 硬约束层

硬约束不交给大模型判断，必须由代码确定执行。

恋爱模式硬约束：

- 双方性别偏好互相满足
- 双方年龄范围互相满足
- 如果任一方要求同城，则必须同城
- 如果任一方要求同校，则必须同校
- 如果任一方要求同专业，则必须同专业
- 双方不能已有 active romantic match
- 双方不能互相拉黑、举报高风险、被封禁
- 任一方明确 dealbreaker 被触发，则淘汰

朋友模式硬约束：

- 如果设置 preferredGender，则必须满足
- 如果任一方要求同城/同校/同专业，则必须满足
- 已有 active friend match 不重复推荐
- 拉黑、举报、封禁直接过滤
- 强 dealbreaker 直接过滤

### 3. 用户语义画像层

这是微调大模型的第一项核心任务：把用户资料和问卷转成结构化语义画像。

输入：

```json
{
  "mode": "romantic",
  "profile": {
    "age": 22,
    "gender": "female",
    "school": "xxx",
    "city": "London",
    "major": "CS",
    "interests": ["摄影", "猫", "咖啡"],
    "bio": "喜欢猫，讨厌对方抽烟，希望认真恋爱"
  },
  "preferences": {
    "ageMin": 20,
    "ageMax": 25,
    "requireSameCity": false,
    "extraMatchInfo": "不想异地太久"
  },
  "questionnaireAnswers": []
}
```

输出：

```ts
type UserSemanticProfile = {
  version: string;

  relationshipIntent: {
    mode: 'romantic' | 'friend';
    seriousness: 1 | 2 | 3 | 4 | 5;
    longTermOrientation: 1 | 2 | 3 | 4 | 5;
    opennessToDifferentBackground: 1 | 2 | 3 | 4 | 5;
  };

  traits: {
    socialEnergy: 1 | 2 | 3 | 4 | 5;
    emotionalExpression: 1 | 2 | 3 | 4 | 5;
    conflictStyle: 'direct' | 'avoidant' | 'cooldown_then_talk' | 'mixed';
    planningStyle: 'structured' | 'flexible' | 'spontaneous' | 'mixed';
    attachmentSignal?: 'secure' | 'anxious' | 'avoidant' | 'mixed' | 'unknown';
  };

  preferences: Preference[];
  dealbreakers: Preference[];
  flexibleAreas: string[];
  summaryForMatching: string;
  riskFlags: RiskFlag[];
};

type Preference = {
  topic: string;
  topicGroup: string;
  polarity: 'like' | 'dislike' | 'accept' | 'reject' | 'neutral';
  target: 'self' | 'partner' | 'both';
  strength: 1 | 2 | 3 | 4 | 5;
  flexibility: 1 | 2 | 3 | 4 | 5;
  evidence: string;
};

type RiskFlag = {
  type: 'hard_boundary' | 'possible_conflict' | 'safety' | 'low_information';
  severity: 1 | 2 | 3 | 4 | 5;
  evidence: string;
};
```

这个结构是关键。我们不是让大模型输出一句“他们很配”，而是让它输出可计算、可审计、可缓存的结构化画像。

### 4. Pairwise 兼容判断层

这是微调大模型的第二项核心任务：判断 A 和 B 放在一起时的兼容、互补、冲突。

输入：

```json
{
  "mode": "romantic",
  "userA": "UserSemanticProfile A",
  "userB": "UserSemanticProfile B",
  "structuredDiff": {
    "ageDiff": 2,
    "sameSchool": true,
    "sameCity": false,
    "sharedInterests": ["摄影"]
  }
}
```

输出：

```ts
type PairCompatibility = {
  llmScore: number; // 0-100
  confidence: 0 | 1 | 2 | 3 | 4 | 5;

  dimensions: {
    values: number;
    lifestyle: number;
    communication: number;
    emotionalNeeds: number;
    interests: number;
    longTermPlan: number;
    complementarity: number;
    conflictRisk: number;
  };

  hardConflicts: Conflict[];
  softConflicts: Conflict[];
  positiveReasons: string[];
  cautionReasons: string[];
};

type Conflict = {
  topic: string;
  severity: 1 | 2 | 3 | 4 | 5;
  reason: string;
};
```

如果 `hardConflicts` 中有 severity 5 的冲突，系统可以直接淘汰，即使 `llmScore` 不低。

### 5. 融合排序层

最终分数不直接等于 `llmScore`。大模型分数需要和规则分数融合。

恋爱模式：

```text
FinalScore =
  0.35 * LLMCompatibilityScore
  + 0.25 * QuestionnaireScore
  + 0.15 * ProfileScore
  + 0.15 * SemanticPreferenceScore
  + 0.10 * ComplementarityScore
  - RiskPenalty
```

朋友模式：

```text
FinalScore =
  0.30 * LLMCompatibilityScore
  + 0.25 * InterestActivityScore
  + 0.20 * QuestionnaireScore
  + 0.15 * SemanticPreferenceScore
  + 0.10 * CampusAndScheduleScore
  - RiskPenalty
```

为什么不能只用 `llmScore`：

- 大模型可能被表达能力强的用户影响，对资料少的人不公平
- 大模型输出有随机性，需要规则校准
- 硬约束、增强模式退款、全局容量这些是工程问题，不适合交给模型
- 产品需要可解释、可回放、可监控

### 6. 全局匹配层

每个 pair 有分数后，还需要全局优化。

恋爱模式：

- 每人最多一个匹配
- 构造加权图：用户是点，候选 pair 是边，`FinalScore` 是边权重
- 使用最大权重匹配，目标是全局总分最大
- 小规模可先用 greedy，高分 pair 优先
- 用户量上来后改成 Blossom / maximum weight matching

朋友模式：

- 每人可以有多个朋友匹配
- 普通用户容量为 1-2
- 增强模式容量等于 `friendEnhancedCells`
- 使用带容量的 b-matching
- 避免给同一个人推一批高度重复的人

## 二、为什么必须微调，而不是直接调用通用大模型

通用大模型可以做原型，但最终需要微调，原因有四个。

### 1. 输出格式必须稳定

匹配系统不能接受模型今天输出 `likes`，明天输出 `positive_preferences`。微调可以让模型稳定输出固定 schema。

### 2. 领域语义要贴近校园匹配

校园恋爱/朋友匹配有自己的语境：

- 同校、同城、异地、年级阶段
- 恋爱认真程度
- 朋友活动偏好
- 社交节奏
- 情绪表达方式
- 对未来规划的接受度

通用模型能理解，但不一定按我们的产品目标排序。

### 3. 模型需要学会“相似”和“互补”的边界

不是所有相反都叫互补。

适合互补：

- 一个主动组织，一个愿意参与
- 一个表达欲强，一个愿意倾听
- 一个计划性强，一个弹性较高

不适合互补：

- 一个强烈想长期关系，一个只想随便聊
- 一个极度需要安全感，一个强回避沟通
- 一个非常重视忠诚边界，一个觉得暧昧无所谓
- 一个明确讨厌对方抽烟，一个经常抽烟

这些边界需要通过标注数据和真实反馈微调。

### 4. 需要学习我们的成功定义

U-Spark 的成功不是“看起来相似”，而是：

- 双方愿意确认
- 愿意聊天
- 48 小时不过期
- 后续不快速解除
- 少举报、少拉黑
- 朋友模式能持续互动
- 恋爱模式能进入关系

这些目标必须用我们自己的数据训练。

## 三、模型分工

建议不要训练一个“万能匹配大模型”。更稳的是拆成三个模型或三个任务。

### 1. Profile Extractor

任务：从用户资料中抽取结构化语义画像。

输入：

- profile
- preferences
- questionnaire answers
- text answers

输出：

- `UserSemanticProfile`

训练数据：

- 人工标注的用户资料
- 规则生成的弱标注
- 运营审核后的修正样本

### 2. Pair Judge

任务：判断两个人的匹配质量、冲突和互补点。

输入：

- A 的 semantic profile
- B 的 semantic profile
- 结构化差异

输出：

- `PairCompatibility`

训练数据：

- 人工标注 pair：1-5 分
- 历史匹配结果
- 双方确认/过期/解除/举报
- 聊天启动和聊天持续情况

### 3. Learning-to-Rank Model

任务：把大模型输出、问卷分、profile 分和反馈特征融合成最终排序。

初期可以不是大模型，用 LightGBM / XGBoost 更合适。

输入：

- `llmScore`
- 各维度分
- 问卷差异
- profile 特征
- 语义冲突数量
- 用户等待时间
- 历史匹配成功率

输出：

- `P(success | A, B, mode)`

长期数据足够后，再考虑更复杂的双塔召回 + cross encoder 精排。

## 四、训练数据设计

### 1. 初始训练数据从哪里来

冷启动阶段不能等真实匹配自然发生。初始数据建议来自四类来源。

#### A. 专家/运营人工标注

这是第一批最可靠的数据。做法是先构造或收集一批匿名用户画像，然后让标注员判断两个人是否适合。

来源：

- 团队成员和种子用户自愿填写的测试 profile
- 问卷答案组合生成的匿名画像
- 运营手写的典型用户画像
- 真实用户资料脱敏后进入标注池，必须经过授权和隐私处理

标注内容：

- 两人整体匹配分 1-5
- 价值观是否合适
- 生活方式是否合适
- 沟通方式是否合适
- 兴趣是否合适
- 是否存在互补
- 是否存在硬冲突
- 推荐理由
- 风险理由

这类数据最适合训练 `Pair Judge`，也适合验证 `Profile Extractor` 的抽取是否正确。

#### B. 种子用户双向评分

上线早期可以组织一批种子用户参与“盲测匹配”。

流程：

```text
种子用户填写 profile 和问卷
  -> 系统生成若干候选卡
  -> 用户只看到脱敏/有限信息
  -> 用户标记：想认识 / 可聊聊 / 不合适
  -> 用户选择不合适原因
  -> 双向都想认识的 pair 作为强正样本
```

这类数据比人工专家更接近真实用户偏好，适合训练 ranker 和 pair judge。

注意：不要只收“喜欢谁”，还要收“为什么不喜欢”。原因标签对模型学习非常关键。

#### C. 合成用户画像和合成 pair

在真实数据不足时，可以用大模型生成合成用户画像，再让人工或强模型标注。

合成画像应覆盖：

- 不同学校、城市、年级、专业
- 恋爱认真程度不同
- 社交能量不同
- 作息不同
- 消费观不同
- 对异地、宠物、抽烟、运动、游戏等偏好不同
- 明确 dealbreaker
- 高相似 pair、高互补 pair、高冲突 pair、边界模糊 pair

合成数据的作用：

- 训练模型稳定输出 schema
- 覆盖稀有场景，例如强 dealbreaker
- 让模型学习否定语义和 target 区分

限制：

- 合成数据不能替代真实反馈
- 合成数据不能直接决定最终排序权重
- 合成样本需要抽样人工检查，否则模型会学到生成模型自己的偏见

#### D. 早期线上反馈

产品上线后，最有价值的数据来自真实反馈：

- 双方确认
- 发消息
- 互聊
- 过期
- 拒绝
- 解除
- 举报/拉黑

早期线上反馈不一定适合直接微调 LLM，因为噪声很大。更适合先训练 ranker，等样本稳定后再筛选高质量样本微调 pair judge。

### 2. 哪些数据用于微调，哪些用于排序

不同模型吃的数据不一样。

`Profile Extractor` 微调数据：

- 输入：单个用户 profile、问卷、文本回答
- 输出：结构化 `UserSemanticProfile`
- 数据来源：人工标注、人工修正的合成画像、线上错误抽取样本
- 不建议直接用“匹配成功/失败”训练 extractor

`Pair Judge` 微调数据：

- 输入：两个人的 semantic profile + 结构化差异
- 输出：`PairCompatibility`
- 数据来源：人工 pair 标注、种子用户双向评分、高质量线上反馈样本
- 适合学习相似、互补、冲突、风险解释

`Learning-to-Rank` 排序数据：

- 输入：pair judge 输出、问卷差异、profile 差异、历史行为特征
- 输出：成功概率或排序分
- 数据来源：线上曝光后的真实反馈
- 这是最应该频繁更新的模型

### 3. 冷启动人工标注

前期没有真实反馈时，需要人工标注种子数据。

建议标注 1000-3000 对 pair，字段包括：

```json
{
  "mode": "romantic",
  "userAProfile": {},
  "userBProfile": {},
  "label": {
    "overall": 1,
    "values": 1,
    "lifestyle": 1,
    "communication": 1,
    "interests": 1,
    "complementarity": 1,
    "risk": 1
  },
  "hardConflicts": [],
  "positiveReasons": [],
  "cautionReasons": []
}
```

`overall` 使用 1-5 分：

- 1：明显不该匹配
- 2：勉强，有明显冲突
- 3：可以认识，但不强
- 4：比较合适
- 5：强匹配

### 4. 标注规范

标注员不能只凭“像不像”打分，必须按维度判断。

强匹配例子：

- 长期目标一致
- 沟通频率期待一致
- 对关键生活习惯接受度高
- 有共同兴趣或合理互补
- 无强 dealbreaker

弱匹配例子：

- 有共同兴趣，但关系目标不同
- 聊天可能能聊，但长期规划冲突
- 表面相似，但一方的底线会被另一方触发

强负样本例子：

- 一方明确拒绝抽烟，另一方经常抽烟且不愿改变
- 一方强烈想长期恋爱，另一方明确只想随便认识
- 一方需要高频沟通，另一方讨厌被频繁联系
- 一方明确不接受异地，另一方未来长期异地

标注时必须输出理由，因为理由是训练 pair judge 的关键。

### 5. 微调数据格式

Profile Extractor 样本：

```json
{
  "input": {
    "profile": {},
    "preferences": {},
    "answers": []
  },
  "output": {
    "relationshipIntent": {},
    "traits": {},
    "preferences": [],
    "dealbreakers": [],
    "riskFlags": []
  }
}
```

Pair Judge 样本：

```json
{
  "input": {
    "mode": "romantic",
    "userA": {},
    "userB": {},
    "structuredDiff": {}
  },
  "output": {
    "llmScore": 82,
    "confidence": 4,
    "dimensions": {},
    "hardConflicts": [],
    "softConflicts": [],
    "positiveReasons": [],
    "cautionReasons": []
  }
}
```

Ranker 样本：

```json
{
  "features": {
    "llmScore": 82,
    "questionnaireScore": 76,
    "profileScore": 70,
    "riskPenalty": 4,
    "sameSchool": true,
    "ageDiff": 2,
    "userAActivity": 0.8,
    "userBActivity": 0.6
  },
  "label": {
    "mutualConfirmed": 1,
    "mutualConversation": 1,
    "reportedOrBlocked": 0,
    "successScore": 0.86
  }
}
```

### 6. 微调具体流程

微调不是把所有数据一股脑丢进去。推荐流程：

```text
收集原始 profile / pair
  -> 脱敏
  -> 标注
  -> 审核标注一致性
  -> 转成 JSONL 训练格式
  -> 划分 train / validation / test
  -> 微调 Profile Extractor 或 Pair Judge
  -> 离线评估
  -> 小流量灰度
  -> 观察线上指标
```

数据划分建议：

- train: 80%
- validation: 10%
- test: 10%

评估指标：

- JSON schema 合法率
- 否定语义识别准确率
- dealbreaker 召回率
- pair 分数与人工分数相关性
- hard conflict 漏判率
- 线上 mutual confirm rate
- report/block rate

Profile Extractor 最重要的是抽取准确，不要乱推断。

Pair Judge 最重要的是不要漏掉硬冲突，其次才是分数高低。

### 7. 线上反馈标签

正样本：

- 双方确认
- 匹配后 24 小时内互发消息
- 聊天超过 N 轮
- 朋友关系保持超过 7 天
- 恋爱关系进入 confirmed / relationship

弱正样本：

- 打开匹配卡
- 主动发第一条消息
- 查看对方主页

负样本：

- 48 小时未确认
- 一方拒绝
- 很快解除
- 拉黑
- 举报
- 匹配后完全无互动

训练时要区分“没互动是因为不喜欢”还是“用户不活跃”。需要记录 exposure 和活跃状态。

### 8. 数据回流

每次匹配保存：

```json
{
  "matchId": "...",
  "algorithmVersion": "hybrid-llm-v1",
  "userAId": "...",
  "userBId": "...",
  "mode": "romantic",
  "featuresSnapshot": {},
  "llmOutput": {},
  "scoreBreakdown": {},
  "finalScore": 83.5,
  "outcome": {
    "confirmedA": true,
    "confirmedB": false,
    "expired": true,
    "messageCount": 0,
    "dissolved": false,
    "reported": false
  }
}
```

这样后续可以回放任意一轮匹配，知道模型当时为什么做这个决定。

## 五、处理 dialogue 里的关键例子

### 1. “我讨厌他吃香菜”

模型抽取：

```json
{
  "topic": "香菜",
  "topicGroup": "food",
  "polarity": "reject",
  "target": "partner",
  "strength": 4,
  "flexibility": 2,
  "evidence": "我讨厌他吃香菜"
}
```

如果对方：

```json
{
  "topic": "香菜",
  "polarity": "like",
  "target": "self",
  "strength": 5
}
```

则 pair judge 输出：

```json
{
  "topic": "香菜",
  "severity": 4,
  "reason": "A 对伴侣吃香菜有较强排斥，B 明确强烈喜欢香菜"
}
```

是否淘汰取决于强度：

- strength 5 + flexibility 1：硬淘汰
- strength 4 + flexibility 2：大幅扣分
- strength 2-3：软冲突

### 2. “喜欢猫”和“喜欢狗”

模型不应该判为冲突。

```json
猫 -> topicGroup: pet
狗 -> topicGroup: pet
```

匹配逻辑：

- 喜欢猫 + 喜欢猫：高加分
- 喜欢猫 + 喜欢狗：中等加分，因为都喜欢宠物
- 喜欢猫 + 接受狗：不扣分，小加分
- 喜欢猫 + 讨厌宠物：冲突

### 3. “前 128 维相似，后 128 维互补”

不建议这样设计。

原因：

- embedding 维度没有稳定人工含义
- 微调也不能可靠保证某一段永远代表“互补”
- 工程上不可解释，出了错无法定位

更好的做法：

- 大模型抽取结构化语义画像
- 每个维度显式标注匹配方向
- pair judge 判断相似、互补、冲突
- 最终由排序层融合

## 六、线上推理 Pipeline

### Step 1. 资料更新后生成语义画像

触发时机：

- 用户首次完成 profile
- 用户更新 bio/signature/tags/interests
- 用户提交问卷
- 用户更新匹配偏好

执行：

```text
Profile + Preferences + Answers
  -> fine-tuned Profile Extractor
  -> UserSemanticProfile
  -> cache in Profile.extraData 或 UserSemanticProfile 表
```

### Step 2. 匹配任务开始

当前系统已有：

```text
MatchingService.executeMatchJob
  -> buildCandidates
  -> matchModelProvider.generateMatches
```

新版 provider 做：

```text
buildCandidates
  -> load semantic profiles
  -> hard gate filter
  -> generate candidate pairs
  -> Pair Judge for high-potential pairs
  -> score fusion
  -> global matching
  -> return MatchResult
```

### Step 3. 候选 pair 召回

为了控制成本，不要让大模型判断所有 O(n²) pair。

先用便宜规则召回 top candidates：

- 性别/年龄/城市/学校过滤
- 问卷粗分过滤
- 兴趣和语义 topicGroup 粗匹配
- embedding 近邻召回

每个用户召回 50-200 个候选，再交给 pair judge。

### Step 4. 大模型 pair judge

只对召回后的候选 pair 调用微调模型。

输出：

- `llmScore`
- 维度分
- 硬冲突
- 软冲突
- 正向理由
- 注意事项

### Step 5. 分数融合

融合后输出：

```json
{
  "userAId": "...",
  "userBId": "...",
  "score": 84.2,
  "metadata": {
    "algorithm": "hybrid-llm-v1",
    "modelVersions": {
      "profileExtractor": "profile-extractor-ft-001",
      "pairJudge": "pair-judge-ft-001",
      "ranker": "ranker-v1"
    },
    "scoreBreakdown": {
      "llm": 31.5,
      "questionnaire": 19.8,
      "profile": 10.5,
      "semantic": 12.4,
      "complementarity": 7.0,
      "riskPenalty": 3.0
    },
    "reasons": [
      "都倾向认真长期关系",
      "沟通方式相近",
      "都喜欢摄影和线下探索"
    ],
    "risks": [
      "作息节奏略有差异"
    ]
  }
}
```

### Step 6. 全局匹配并写入 Match

沿用当前 `Match` 表：

- `score = finalScore`
- `compatibilityScore = finalScore`
- `metadata = scoreBreakdown + reasons + model versions`

## 七、微调方案

### 1. Profile Extractor 微调

训练样本格式：

```json
{
  "messages": [
    {
      "role": "system",
      "content": "你是 U-Spark 的用户语义画像抽取模型。只输出符合 schema 的 JSON。"
    },
    {
      "role": "user",
      "content": "用户资料和问卷..."
    },
    {
      "role": "assistant",
      "content": "{...UserSemanticProfile...}"
    }
  ]
}
```

核心要求：

- 保留否定语义
- 区分 self 和 partner
- 区分 like、accept、reject
- 输出 evidence
- 不臆测敏感属性
- 不根据学校、国籍、性别做歧视性推断

### 2. Pair Judge 微调

训练样本格式：

```json
{
  "messages": [
    {
      "role": "system",
      "content": "你是 U-Spark 的匹配兼容性判断模型。根据两名用户画像输出 JSON，不做闲聊。"
    },
    {
      "role": "user",
      "content": "用户A语义画像 + 用户B语义画像 + 结构化差异"
    },
    {
      "role": "assistant",
      "content": "{...PairCompatibility...}"
    }
  ]
}
```

核心要求：

- 学会判断“相似”和“互补”
- 学会识别硬冲突和软冲突
- 输出 0-100 分和 confidence
- 给出短理由，但不输出敏感或冒犯性解释

### 3. 训练节奏

第一阶段：

- 1000-3000 条人工标注 profile extractor 样本
- 1000-3000 条人工标注 pair judge 样本
- 上线灰度，不直接全量替换

第二阶段：

- 加入线上反馈
- 每周或每两周重新训练 ranker
- 每月评估是否微调 LLM

第三阶段：

- 建立 A/B test
- 比较规则版、通用模型版、微调模型版
- 指标稳定后再全量切换

## 八、安全和公平

大模型不能做以下事情：

- 根据国籍、种族、宗教、家庭背景做贬低性判断
- 输出“这个人不值得匹配”这类人格评价
- 向用户展示敏感推断
- 把用户隐私文本原文暴露给对方
- 因为资料写得少就直接低质量匹配

前端可展示的解释应是温和、可接受的：

```text
你们都偏好稳定长期关系
你们都喜欢线下探索新活动
你们在作息上有一点差异，但双方接受度较高
```

不展示：

```text
模型判断你有焦虑型依恋
你们原生家庭可能相似
对方讨厌你喜欢的某个习惯
```

## 九、反馈学习闭环

这部分是整个匹配工程最重要的闭环。模型上线后不能停留在“算一次分”，而要把每一次推荐、查看、确认、聊天、过期、解除、举报都变成训练信号，让系统逐步学会 U-Spark 用户真实喜欢什么样的匹配。

完整流水如下：

```text
匹配曝光
  -> 用户行为采集
  -> 结果标签生成
  -> 样本清洗和归因
  -> 训练 ranker / 微调 pair judge
  -> 离线评估
  -> 灰度上线
  -> A/B test
  -> 新一轮反馈回流
```

### 1. 要收集哪些用户反馈

用户反馈分为显式反馈和隐式反馈。

显式反馈：

- 用户点击喜欢 / 不喜欢
- 双方确认匹配
- 一方拒绝匹配
- 用户选择“不合适”的原因
- 解除关系时选择原因
- 举报、拉黑
- 用户主动修改偏好，例如把同城从非强制改成强制

隐式反馈：

- 是否打开匹配卡
- 打开后停留多久
- 是否查看对方主页
- 是否主动发第一条消息
- 对方是否回复
- 24 小时内是否互发消息
- 聊天轮数、聊天持续天数
- 是否交换联系方式，如果产品能合规记录
- 是否进入确认关系
- 朋友模式是否持续互动
- 匹配后是否很快沉默、过期或解除

这些行为都不是同等重要。系统要把它们转成不同强度的训练标签。

### 2. 标签体系

不要只用二分类的成功/失败。建议使用多任务标签。

```ts
type MatchOutcomeLabel = {
  viewed: 0 | 1;
  openedProfile: 0 | 1;
  userAConfirmed: 0 | 1;
  userBConfirmed: 0 | 1;
  mutualConfirmed: 0 | 1;
  firstMessageSent: 0 | 1;
  mutualConversation: 0 | 1;
  messageCountBucket: '0' | '1-2' | '3-10' | '10+';
  survived48h: 0 | 1;
  survived7d: 0 | 1;
  dissolvedQuickly: 0 | 1;
  reportedOrBlocked: 0 | 1;
  explicitRating?: 1 | 2 | 3 | 4 | 5;
  explicitReason?: string[];
};
```

最终可以构造一个训练目标 `successScore`：

```text
successScore =
  + 0.10 * viewed
  + 0.15 * openedProfile
  + 0.30 * firstMessageSent
  + 0.45 * mutualConversation
  + 0.70 * mutualConfirmed
  + 0.30 * survived7d
  - 0.60 * dissolvedQuickly
  - 1.00 * reportedOrBlocked
```

这个公式只是初始版本，后续由数据团队根据真实指标调权。核心是：举报/拉黑必须是强负样本，双方确认和持续聊天是强正样本，单纯打开卡片只能算弱正样本。

### 3. 训练样本如何生成

每次系统把一个 pair 展示给用户，都要记录一次 exposure。没有 exposure 的 pair 不能直接当负样本，因为用户根本没看到。

推荐新增概念：

```text
MatchExposure
```

字段建议：

```ts
type MatchExposure = {
  exposureId: string;
  matchId?: string;
  mode: 'romantic' | 'friend';
  userAId: string;
  userBId: string;
  shownToUserId: string;
  position?: number;
  algorithmVersion: string;
  modelVersions: {
    profileExtractor: string;
    pairJudge: string;
    ranker: string;
  };
  featureSnapshot: object;
  modelOutput: object;
  finalScore: number;
  shownAt: string;
};
```

之后把 exposure 和用户行为 join 起来，生成训练样本：

```text
features_at_exposure + model_output + user_context -> outcome_after_window
```

窗口可以分为：

- 24 小时：是否打开、是否发消息
- 48 小时：是否确认、是否过期
- 7 天：是否持续聊天、是否解除
- 30 天：是否长期稳定、是否举报

### 4. 为什么要保存 feature snapshot

训练样本必须保存当时的特征快照，而不是训练时再读取用户当前资料。

原因：

- 用户资料会改
- 问卷答案会改
- 模型版本会变
- 同一个 pair 在不同时间可能语境不同

如果不保存快照，训练数据会被污染，模型会学习到错误因果。

每条样本至少保存：

- A/B 当时的 profile 摘要
- A/B 当时的 semantic profile
- 当时的问卷 group score
- hard gate 结果
- pair judge 输出
- final score breakdown
- 展示位置和时间
- 是否增强模式
- 用户当时活跃度

### 5. 反馈如何更新模型权重

模型更新分三层。

#### 第一层：更新融合权重

初期最实用。先不用频繁微调大模型，而是训练一个 learning-to-rank 模型替代手写权重。

输入：

- `llmScore`
- pair judge 各维度分
- 问卷各组差异
- 结构化 profile 差异
- 语义冲突数量
- positive reason 数量
- risk penalty
- 用户活跃度
- 等待时间
- 历史曝光次数

输出：

```text
P(mutual_confirm)
P(mutual_conversation)
P(survive_7d)
P(report_or_block)
```

最终排序分：

```text
RankScore =
  0.40 * P(mutual_confirm)
  + 0.35 * P(mutual_conversation)
  + 0.20 * P(survive_7d)
  - 0.50 * P(report_or_block)
```

这一步更新的是排序模型权重，速度快、成本低、可解释性强。可以每周训练一次。

#### 第二层：更新 Pair Judge

当积累足够多人工标注和线上反馈后，再微调 pair judge。

适合用于微调 pair judge 的样本：

- 规则分高但用户反馈差的 pair
- 规则分一般但用户反馈很好的 pair
- 大模型理由明显错的 pair
- 用户明确选择“不合适原因”的 pair
- 举报/拉黑样本

pair judge 微调目标不是直接记住“某两个人成功”，而是学习：

- 哪些冲突真的严重
- 哪些互补是真的互补
- 哪些相似只是表面相似
- 哪些文本表达代表强 dealbreaker

微调频率不需要太高，建议每月或每两月一次。

#### 第三层：更新 Profile Extractor

当发现模型经常抽错用户语义画像时，才更新 extractor。

典型错误：

- 把“讨厌对方抽烟”抽成“关注抽烟”
- 把“可以接受狗”抽成“喜欢狗”
- 把玩笑话当成强偏好
- 把用户对自己的描述误判为对伴侣的要求

extractor 的更新依赖人工审核样本，不能只靠线上结果自动训练。

### 6. 用户视图如何收集

“用户视图”可以理解为用户对一次匹配的主观反馈。建议在产品里用轻量方式收集，不要打扰用户。

匹配卡反馈：

- 合适
- 不合适
- 先聊聊
- 不想匹配这个类型

不合适原因：

- 没眼缘
- 兴趣不合
- 价值观不合
- 距离/学校不合适
- 年龄不合适
- 资料太少
- 对方表达让我不舒服
- 其他

聊天后反馈：

- 聊得来
- 还可以
- 不太合适
- 不想继续

解除关系反馈：

- 沟通频率不合
- 生活习惯不合
- 目标不一致
- 现实距离问题
- 对方不活跃
- 不舒服/冒犯
- 其他

这些反馈要进入训练系统，但前端展示要克制，避免让用户觉得在做问卷。

### 7. 防止模型学偏

反馈学习有几个坑，必须提前设计。

**曝光偏差**

高分 pair 更容易被展示，所以模型会更容易收集到高分 pair 的反馈。解决方式：

- 保留少量探索流量
- 对部分边界 pair 做随机曝光
- 训练时加入 exposure position 和 algorithmVersion

**活跃度偏差**

用户不回复不一定是不喜欢，可能只是最近不活跃。解决方式：

- 记录双方近期活跃度
- 训练时区分“不喜欢”和“不在线”
- 不把低活跃用户造成的沉默简单当作强负样本

**外貌/资料完整度偏差**

资料完整的人更容易被确认，不代表匹配逻辑更好。解决方式：

- 记录 profileCompleteness
- 对资料少但后续反馈好的样本提高权重
- 不让模型简单学成“资料越多越好”

**马太效应**

受欢迎用户会越来越多曝光，普通用户越来越少。解决方式：

- 全局匹配时加入公平约束
- 给等待时间长、历史曝光少的用户加探索权重
- 限制单个用户在一轮中被过度推荐

**错误负反馈**

用户拒绝可能因为当时心情、时间、已经认识别人。解决方式：

- 显式拒绝是中等负样本，不一定是强负
- 举报、拉黑、快速解除才是强负
- 多轮行为累积后再更新长期偏好

### 8. 在线更新还是离线更新

不建议一开始做实时在线学习。匹配是高风险推荐场景，在线实时改权重容易不稳定。

推荐节奏：

- 实时收集反馈
- 每天生成训练样本
- 每周训练 ranker
- 每周离线评估
- 通过后灰度 5% / 20% / 50% / 100%
- 大模型微调按月进行

只有非常轻量的用户偏好可以实时更新，例如：

- 用户刚选择“不想异地”，立即提高异地惩罚
- 用户多次拒绝某类标签，短期降低该类召回
- 用户最近更想找朋友而非恋爱，调整 mode 权重

### 9. 评估指标

模型不能只看点击率。匹配系统更应看长期质量。

核心指标：

- mutual confirm rate
- first message rate
- mutual conversation rate
- 48h expiration rate
- 7d retention of match/friend
- quick dissolve rate
- report/block rate
- no-match rate
- enhanced refund rate

分群指标：

- 新用户 vs 老用户
- 男/女/其他性别
- 不同学校
- 不同城市
- 资料完整 vs 资料较少
- 普通模式 vs 增强模式
- 恋爱模式 vs 朋友模式

如果总指标提升但某个群体明显变差，不能全量上线。

### 10. 闭环后的最终匹配流水

完整工程流水应是：

```text
用户填写资料和问卷
  -> Profile Extractor 生成语义画像
  -> 用户进入匹配池
  -> Hard Gate 过滤绝对不合适的人
  -> 召回候选 pair
  -> Pair Judge 判断语义兼容
  -> Ranker 融合规则分、大模型分和历史反馈权重
  -> 全局匹配优化生成结果
  -> 展示匹配卡并记录 exposure
  -> 收集确认、聊天、拒绝、解除、举报等反馈
  -> 生成训练样本
  -> 更新 ranker / 周期性微调 LLM
  -> 灰度发布新模型
  -> 下一轮匹配更准
```

这才是完整的“越用越准”的匹配系统。

## 十、工程落地

### 1. 数据库

短期可用 `Profile.extraData` 存缓存：

```json
{
  "semanticProfile": {
    "version": "profile-extractor-ft-001",
    "updatedAt": "2026-06-27T00:00:00.000Z",
    "data": {}
  }
}
```

中期建议新增表：

```prisma
model UserSemanticProfile {
  id        String   @id @default(cuid())
  userId    String
  mode      String
  version   String
  data      Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, mode, version])
  @@index([userId, mode])
}
```

再新增匹配训练日志表：

```prisma
model MatchTrainingEvent {
  id          String   @id @default(cuid())
  matchId     String?
  mode        String
  userAId     String
  userBId     String
  algorithm   String
  features    Json
  modelOutput Json
  finalScore  Float
  outcome     Json?
  createdAt   DateTime @default(now())

  @@index([mode, createdAt])
  @@index([userAId])
  @@index([userBId])
}
```

### 2. Provider

新增 provider：

```text
HybridLlmMatchModelProvider
```

职责：

- 读取候选人
- 加载或生成 semantic profile
- 规则召回候选 pair
- 调用微调 pair judge
- 融合分数
- 全局匹配
- 返回 `MatchResult`

当前 `ai-match-model.provider.example.js` 只是远程调用示例，可以改造成实际 LLM provider。

### 3. 成本控制

必须避免全量 O(n²) 调大模型。

策略：

- semantic profile 异步缓存，不在匹配任务里临时生成
- pair judge 只判断召回后的 top pairs
- 对相同 pair 的模型输出设置 TTL 缓存
- 小池子直接跑，大池子先 embedding 召回
- 资料未变化则不重新生成画像

## 十一、版本路线

### V1：Hybrid Rule + LLM Extractor

- 微调或 prompt 版 profile extractor
- 规则 pair scoring
- 结构化偏好进入打分
- 记录 metadata

### V2：Fine-tuned Pair Judge

- 微调 pair judge
- 输出 pair compatibility
- 与规则分融合
- 灰度到部分用户

### V3：Learning-to-Rank

- 用线上反馈训练 ranker
- 优化确认率、聊天率、低举报率
- 模型分数替代手写权重

### V4：Two-Tower Recall + Cross-Encoder Rerank

- 用户量大后使用双塔模型召回
- pair judge / cross encoder 精排
- 全局匹配保持不变

## 十二、最终推荐

最终算法应采用：

```text
Rule Gate
  + Fine-tuned Profile Extractor
  + Fine-tuned Pair Judge
  + Learning-to-Rank Fusion
  + Global Matching Optimization
  + Feedback Training Loop
```

其中：

- 规则负责底线
- 微调大模型负责理解自由文本和复杂关系
- 排序模型负责从真实反馈里学习权重
- 全局匹配负责让整池用户结果最优
- metadata 负责可解释、可回放、可审计

这比纯规则打分更能解决真实匹配问题，也比纯大模型决策更稳定、更可控、更适合产品上线。
