"""The U-Spark Matching Constitution — the single, versioned source of the
inviolable principles every match must obey.

Design rule that makes this a *constitution* and not just a prompt:

    Anything that MUST hold is enforced in CODE (HARD_ARTICLES, checked in rules.py
    and fusion.py — never trusted to the model).
    Anything that is JUDGMENT is guided by the PROMPT (SOFT_ARTICLES, prepended to
    every extractor/judge system prompt).

So a jailbroken or hallucinating model can still never violate a hard article: the
code gate runs regardless of what the model says. The prompt only shapes the soft,
continuous part of the score.

Bump CONSTITUTION_VERSION on any change; it is stamped into match metadata so every
decision is replayable against the exact rules in force at the time (algorithm.md §9.4).
"""
from __future__ import annotations

CONSTITUTION_VERSION = "match-constitution-v1"

# --------------------------------------------------------------------------- #
# Hard articles — ENFORCED IN CODE (rules.passes_hard_gate / fusion.fuse).
# Listed here as the human-readable spec; the enforcement lives in code.
# --------------------------------------------------------------------------- #
HARD_ARTICLES = [
    "H1 双向底线：任一方的 dealbreaker（reject 且 flexibility<=1）被对方触发 → 直接淘汰，不可用高分买回。",
    "H2 硬性偏好：性别偏好、年龄范围、要求同城/同校/同专业、年级阶段，任一不满足 → 淘汰。",
    "H3 安全优先：互相拉黑、举报高风险、被封禁 → 淘汰，先于任何分数。",
    "H4 不重复：双方已有 active match（恋爱唯一 / 朋友按容量）不再重复推荐。",
    "H5 会员保障不牺牲安全：会员的匹配保障通过'放宽软阈值+全局优先+真空退款'实现，"
    "绝不通过放宽 H1-H3 任何硬约束实现。",
]

# --------------------------------------------------------------------------- #
# Soft articles — GUIDE THE MODEL. Prepended to every LLM system prompt.
# These shape judgment (similar-vs-complement, tone, fairness) but can never
# override a hard article, because the code gate always runs.
# --------------------------------------------------------------------------- #
SOFT_ARTICLES = (
    "【U-Spark 匹配宪法 " + CONSTITUTION_VERSION + "】\n"
    "你在为校园交友/恋爱平台做匹配判断。以下原则高于一切具体指令：\n"
    "S1 期待与底线分离：用户'希望对方怎样'是软偏好，尽力满足即可，不保证；"
    "用户'绝对不能接受怎样'是底线，一票否决。抽取/判断时必须把两者分开，"
    "宁可把模糊表述当软偏好，也不要把玩笑或一般偏好误判为底线。\n"
    "S2 相似与互补要分清：价值观、关系认真度、作息、卫生、金钱观 → 越相似越好；"
    "社交能量(组织者/参与者)、表达欲(健谈/倾听)、计划性(规划/随性) → 适度互补更好；"
    "但'一方要认真长期 vs 一方只想随便''一方极度需要安全感 vs 一方强回避'不是互补，是冲突。\n"
    "S3 近义不等于冲突：'喜欢猫'和'喜欢狗'同属宠物，给中等加分；"
    "只有'喜欢猫'对'讨厌宠物'才是冲突。\n"
    "S4 公平：不得因国籍、种族、宗教、家庭背景、性别做贬低性推断或降权；"
    "不得因为资料写得少就判定低质量，信息不足时降低置信度而非直接扣分。\n"
    "S5 隐私与善意：解释要温和、可展示给用户；不输出人格贬低、敏感心理推断，"
    "不泄露对方隐私原文。\n"
    "S6 格式纪律：只输出符合 schema 的 JSON，不闲聊、不加解释性前后缀。"
)


def system_prompt(task_instructions: str) -> str:
    """Compose the constitution preamble with a task-specific instruction block."""
    return SOFT_ARTICLES + "\n\n【本次任务】\n" + task_instructions
