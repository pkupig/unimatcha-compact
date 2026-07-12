"""A tiny domain lexicon for topic -> topicGroup mapping and negation detection.

This deliberately small, hand-maintained lexicon backs the rule-based (mock) extractor
so the pipeline runs and demonstrates the two hard cases from dialogue.txt WITHOUT a
model:

  - "我讨厌他吃香菜"  -> reject / target=partner / topicGroup=food
  - "喜欢猫" vs "喜欢狗" -> same topicGroup=pet, not a conflict

Once the fine-tuned LLM is live it replaces this entirely; the lexicon then only survives
as weak-labeling for synthetic training data (data/gen_synthetic.py).
"""
from __future__ import annotations

import re

# topic keyword -> canonical (topic, topicGroup)
TOPIC_GROUPS: dict[str, tuple[str, str]] = {
    "香菜": ("香菜", "food"),
    "辣": ("吃辣", "food"),
    "甜": ("甜食", "food"),
    "猫": ("猫", "pet"),
    "狗": ("狗", "pet"),
    "宠物": ("宠物", "pet"),
    "抽烟": ("抽烟", "smoking"),
    "吸烟": ("抽烟", "smoking"),
    "烟": ("抽烟", "smoking"),
    "喝酒": ("喝酒", "drinking"),
    "酒": ("喝酒", "drinking"),
    "游戏": ("游戏", "gaming"),
    "运动": ("运动", "sport"),
    "健身": ("健身", "sport"),
    "熬夜": ("熬夜", "schedule"),
    "早睡": ("早睡", "schedule"),
    "异地": ("异地", "distance"),
    "摄影": ("摄影", "hobby"),
    "旅游": ("旅游", "hobby"),
    "旅行": ("旅游", "hobby"),
    "音乐": ("音乐", "hobby"),
    "读书": ("读书", "hobby"),
    "咖啡": ("咖啡", "food"),
    "猫咪": ("猫", "pet"),
}

# Negation / polarity cues, ordered by strength.
_REJECT_CUES = ["绝对不能", "不能接受", "受不了", "无法接受", "坚决不", "讨厌", "反感", "厌恶"]
_DISLIKE_CUES = ["不喜欢", "不太喜欢", "不爱", "嫌"]
_ACCEPT_CUES = ["能接受", "可以接受", "无所谓", "都行", "还行"]
_LIKE_CUES = ["喜欢", "热爱", "爱", "超爱", "最爱"]

# Cues that the statement is about the *other* person, not oneself.
_PARTNER_CUES = ["他", "她", "对方", "对象", "伴侣", "另一半"]


def find_topic(text: str) -> tuple[str, str] | None:
    for kw, (topic, group) in TOPIC_GROUPS.items():
        if kw in text:
            return topic, group
    return None


def polarity_and_strength(text: str) -> tuple[str, int, int]:
    """Return (polarity, strength 1-5, flexibility 1-5)."""
    for cue in _REJECT_CUES:
        if cue in text:
            return "reject", 4, 2
    for cue in _DISLIKE_CUES:
        if cue in text:
            return "dislike", 3, 3
    for cue in _ACCEPT_CUES:
        if cue in text:
            return "accept", 2, 4
    for cue in _LIKE_CUES:
        if cue in text:
            return "like", 4, 3
    return "neutral", 2, 4


def infer_target(text: str) -> str:
    return "partner" if any(cue in text for cue in _PARTNER_CUES) else "self"


# Split a free-text blob into short clauses so each opinion is scored on its own.
_CLAUSE_SPLIT = re.compile(r"[，,。.；;、\n!！?？]")


def clauses(text: str) -> list[str]:
    return [c.strip() for c in _CLAUSE_SPLIT.split(text or "") if c.strip()]
