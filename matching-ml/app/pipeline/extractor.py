"""Profile Extractor: CandidateProfile -> UserSemanticProfile (algorithm.md §3).

Two interchangeable implementations behind `build_extractor(settings)`:

  - RuleBasedExtractor: no model. Uses lexicon.py. Handles negation/target/topicGroup
    well enough to run the whole pipeline and pass tests before ollama exists.
  - LlmExtractor: calls the fine-tuned model via OllamaClient.

Both produce the SAME schema, so downstream code (pair judge, fusion) is agnostic.
"""
from __future__ import annotations

from typing import Any

from ..config import Settings
from ..llm.client import LLMError, OllamaClient
from ..llm.prompts import EXTRACTOR_SYSTEM, extractor_user_message
from ..schemas import (
    CandidateProfile,
    Preference,
    RelationshipIntent,
    RiskFlag,
    UserSemanticProfile,
)
from . import lexicon

_SERIOUS_CUES = ["认真", "长期", "稳定", "奔着结婚", "定下来"]
_CASUAL_CUES = ["随便", "玩玩", "先聊聊", "不着急", "看缘分"]


def _free_texts(c: CandidateProfile) -> list[str]:
    texts: list[str] = []
    if c.bio:
        texts.append(c.bio)
    if c.prefs and c.prefs.extraMatchInfo:
        texts.append(c.prefs.extraMatchInfo)
    for a in c.answers:
        if a.questionType == "TEXT" and isinstance(a.value, str) and a.value.strip():
            texts.append(a.value)
    return texts


def raw_profile_dict(c: CandidateProfile) -> dict[str, Any]:
    """The compact view handed to the LLM / stored for auditing."""
    return {
        "age": c.age,
        "gender": c.gender,
        "school": c.school,
        "city": c.city,
        "major": c.major,
        "grade": c.grade,
        "interests": c.interests,
        "activities": c.activities or [],
        "bio": c.bio,
        "extraMatchInfo": c.prefs.extraMatchInfo if c.prefs else None,
        "textAnswers": [a.value for a in c.answers if a.questionType == "TEXT"],
    }


class RuleBasedExtractor:
    version = "profile-extractor-rule-v0"

    def extract(self, c: CandidateProfile, mode: str) -> UserSemanticProfile:
        prefs: list[Preference] = []
        dealbreakers: list[Preference] = []

        # Interests -> positive self-preferences.
        for it in c.interests or []:
            hit = lexicon.find_topic(it)
            topic, group = hit if hit else (it, "interest")
            prefs.append(
                Preference(topic=topic, topicGroup=group, polarity="like",
                           target="self", strength=3, flexibility=4, evidence=it)
            )

        # Free-text clauses -> polarity-aware preferences / dealbreakers.
        for text in _free_texts(c):
            for clause in lexicon.clauses(text):
                hit = lexicon.find_topic(clause)
                if not hit:
                    continue
                topic, group = hit
                polarity, strength, flexibility = lexicon.polarity_and_strength(clause)
                target = lexicon.infer_target(clause)
                pref = Preference(topic=topic, topicGroup=group, polarity=polarity,
                                  target=target, strength=strength,
                                  flexibility=flexibility, evidence=clause)
                if polarity == "reject" and flexibility <= 2:
                    dealbreakers.append(pref)
                else:
                    prefs.append(pref)

        seriousness = 3
        blob = " ".join(_free_texts(c))
        if any(cue in blob for cue in _SERIOUS_CUES):
            seriousness = 5
        elif any(cue in blob for cue in _CASUAL_CUES):
            seriousness = 2

        risk = []
        if len(blob) < 8 and not c.interests:
            risk.append(RiskFlag(type="low_information", severity=3,
                                 evidence="资料过少，画像置信度低"))

        return UserSemanticProfile(
            version=self.version,
            relationshipIntent=RelationshipIntent(
                mode=mode, seriousness=seriousness,
                longTermOrientation=seriousness,
                opennessToDifferentBackground=3),
            preferences=prefs,
            dealbreakers=dealbreakers,
            summaryForMatching=blob[:120],
            riskFlags=risk,
        )


class LlmExtractor:
    version = "profile-extractor-ft"

    def __init__(self, client: OllamaClient, model: str, fallback: RuleBasedExtractor):
        self._client = client
        self._model = model
        self._fallback = fallback

    async def extract(self, c: CandidateProfile, mode: str) -> UserSemanticProfile:
        user_msg = extractor_user_message(mode, raw_profile_dict(c))
        try:
            data = await self._client.chat_json(self._model, EXTRACTOR_SYSTEM, user_msg)
            data.setdefault("relationshipIntent", {"mode": mode})
            data["version"] = f"{self.version}:{self._model}"
            return UserSemanticProfile.model_validate(data)
        except (LLMError, ValueError):
            # Never fail a match job on a model hiccup — degrade to rules.
            return self._fallback.extract(c, mode)


def build_extractor(settings: Settings, client: OllamaClient | None):
    rule = RuleBasedExtractor()
    if settings.llm_backend == "ollama" and client is not None:
        return LlmExtractor(client, settings.extractor_model, rule)
    return rule
