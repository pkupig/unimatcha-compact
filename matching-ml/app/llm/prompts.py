"""System prompts + user-message builders for the two fine-tuned tasks.

These prompts are the single source of truth shared by:
  - the online LLM path (pipeline/extractor.py, pipeline/pair_judge.py), and
  - the fine-tuning dataset builders (data/build_*_dataset.py),
so training and serving stay in lock-step. Change a prompt here and both move together.
"""
from __future__ import annotations

import json
from typing import Any

from ..constitution import system_prompt

# --------------------------------------------------------------------------- #
# Profile Extractor  (algorithm.md §3, §7.1) — task block sits under the constitution.
# --------------------------------------------------------------------------- #
EXTRACTOR_SYSTEM = system_prompt(
    "你是用户语义画像抽取模型。读入单个用户的资料/问卷/自由文本，输出 UserSemanticProfile JSON。\n"
    "1. 保留否定语义：'讨厌/不喜欢/受不了' 抽成 polarity=dislike 或 reject（见宪法 S1）。\n"
    "2. 区分 target：描述自己用 self，对伴侣/朋友的要求用 partner。\n"
    "3. 区分 like / accept / reject：'喜欢'=like，'能接受'=accept，'绝对不行'=reject。\n"
    "4. 每条 preference 给 topicGroup（food/pet/smoking/pace/values/...）、strength(1-5)、"
    "flexibility(1-5，1=底线不可让步) 和 evidence 原文。\n"
    "5. 明确的底线('绝对不能接受...')放进 dealbreakers；信息太少加 low_information 的 riskFlag。"
)


def extractor_user_message(mode: str, profile: dict[str, Any]) -> str:
    """`profile` = a plain dict of the user's raw fields (see CandidateProfile)."""
    return (
        f"mode: {mode}\n"
        f"用户资料（JSON）:\n{json.dumps(profile, ensure_ascii=False, indent=2)}\n\n"
        "请输出 UserSemanticProfile JSON。"
    )


# --------------------------------------------------------------------------- #
# Pair Judge  (algorithm.md §4, §7.2)
# --------------------------------------------------------------------------- #
PAIR_JUDGE_SYSTEM = system_prompt(
    "你是匹配兼容性判断模型。读入两名用户的语义画像 + 结构化差异，输出 PairCompatibility JSON。\n"
    "1. 分清相似与互补（见宪法 S2）：互补要给 complementarity 加分，价值冲突不是互补。\n"
    "2. 硬冲突 vs 软冲突：一方对伴侣某事 reject(flexibility<=1) 且另一方强烈 like → hardConflict(severity 5)；"
    "较弱的排斥归 softConflict。\n"
    "3. 近义不是冲突（见宪法 S3）。\n"
    "4. 输出 llmScore(0-100)、confidence(0-5)、各维度分、positiveReasons、cautionReasons。\n"
    "注意：你只负责软性判断和解释；性别/年龄/同城等硬约束由系统代码强制，不用你把关。"
)


def pair_judge_user_message(
    mode: str, profile_a: dict[str, Any], profile_b: dict[str, Any], structured_diff: dict[str, Any]
) -> str:
    return (
        f"mode: {mode}\n"
        f"用户A语义画像:\n{json.dumps(profile_a, ensure_ascii=False)}\n\n"
        f"用户B语义画像:\n{json.dumps(profile_b, ensure_ascii=False)}\n\n"
        f"结构化差异:\n{json.dumps(structured_diff, ensure_ascii=False)}\n\n"
        "请输出 PairCompatibility JSON。"
    )
