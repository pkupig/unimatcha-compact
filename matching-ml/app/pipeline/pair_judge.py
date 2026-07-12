"""Pair Judge: (profile A, profile B, structured diff) -> PairCompatibility (§4).

RuleBasedJudge implements the concrete cases the design calls out:
  - A rejects partner eating 香菜 + B loves 香菜  -> hard conflict, big penalty
  - like cat + like dog (same topicGroup=pet) -> partial positive, NOT a conflict
  - large seriousness gap (认真长期 vs 随便玩玩) -> values conflict
LlmJudge defers to the fine-tuned model, falling back to rules on error.
"""
from __future__ import annotations

from typing import Any

from ..config import Settings
from ..llm.client import LLMError, OllamaClient
from ..llm.prompts import PAIR_JUDGE_SYSTEM, pair_judge_user_message
from ..schemas import (
    Conflict,
    PairCompatibility,
    PairDimensions,
    Preference,
    UserSemanticProfile,
)

_LIKE = {"like"}
_NEG = {"reject", "dislike"}
_SELF = {"self", "both"}
_PARTNER = {"partner", "both"}


def _by_group(prefs: list[Preference]) -> dict[str, list[Preference]]:
    out: dict[str, list[Preference]] = {}
    for p in prefs:
        out.setdefault(p.topicGroup, []).append(p)
    return out


_PET_GROUP = "pet"


def _dealbreaker_collisions(
    a: UserSemanticProfile, b: UserSemanticProfile
) -> list[str]:
    """Topics where one side holds an ABSOLUTE boundary (reject + target=partner +
    flexibility<=1) that the other side actually triggers (like + target=self). Matched at
    topic level, and at group level for pets (讨厌宠物 vs 喜欢猫). This is the constitution-H1
    dealbreaker: it is CODE-enforced, never left to the model — same class as gender/age/city."""
    hits: list[str] = []
    for x, y in ((a, b), (b, a)):
        x_all = x.preferences + x.dealbreakers
        y_all = y.preferences + y.dealbreakers
        y_pos_topics = {p.topic for p in y_all if p.polarity in _LIKE and p.target in _SELF}
        y_pos_groups = {p.topicGroup for p in y_all if p.polarity in _LIKE and p.target in _SELF}
        for xp in x_all:
            if not (xp.polarity == "reject" and xp.target in _PARTNER and xp.flexibility <= 1):
                continue
            if xp.topic in y_pos_topics or (
                xp.topicGroup == _PET_GROUP and _PET_GROUP in y_pos_groups
            ):
                hits.append(xp.topic)
    return hits


def _enforce_dealbreakers(
    result: PairCompatibility, a: UserSemanticProfile, b: UserSemanticProfile
) -> PairCompatibility:
    """Overlay the deterministic H1 dealbreaker rule on ANY judge output (LLM or rule). A
    triggered flex<=1 boundary MUST be a hardConflict(sev5) with the score capped — regardless
    of what the model decided. Idempotent: skips topics already flagged hard. This is why we no
    longer need the model to learn flex<=1->hard (it repeatedly couldn't); code guarantees it."""
    collisions = _dealbreaker_collisions(a, b)
    if not collisions:
        return result
    flagged = {c.topic for c in result.hardConflicts}
    for topic in collisions:
        if topic not in flagged:
            result.hardConflicts.append(Conflict(
                topic=topic, severity=5,
                reason=f"一方把「{topic}」设为不可退让的底线（flexibility<=1），另一方恰好触发 → 一票否决"))
            result.cautionReasons = ([f"{topic}：底线被触发"] + list(result.cautionReasons))[:5]
            flagged.add(topic)
    result.llmScore = min(result.llmScore, 15.0)
    result.dimensions.conflictRisk = max(result.dimensions.conflictRisk, 90.0)
    return result


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


class RuleBasedJudge:
    version = "pair-judge-rule-v0"

    def judge(
        self,
        a: UserSemanticProfile,
        b: UserSemanticProfile,
        diff: dict[str, Any],
    ) -> PairCompatibility:
        score = 55.0
        positives: list[str] = []
        cautions: list[str] = []
        hard: list[Conflict] = []
        soft: list[Conflict] = []
        dims = PairDimensions()

        a_all = a.preferences + a.dealbreakers
        b_all = b.preferences + b.dealbreakers
        a_groups = _by_group(a_all)
        b_groups = _by_group(b_all)

        # --- shared positive interests ---------------------------------------
        for group in set(a_groups) & set(b_groups):
            a_likes = [p for p in a_groups[group] if p.polarity in _LIKE and p.target in _SELF]
            b_likes = [p for p in b_groups[group] if p.polarity in _LIKE and p.target in _SELF]
            if a_likes and b_likes:
                same_topic = {p.topic for p in a_likes} & {p.topic for p in b_likes}
                if same_topic:
                    score += 8
                    dims.interests += 20
                    positives.append(f"都喜欢{next(iter(same_topic))}")
                else:  # e.g. cat vs dog: same group, different topic
                    score += 4
                    dims.interests += 10
                    positives.append(f"都对{group}类有共同兴趣")

        # --- conflicts: one side rejects a thing the other side loves --------
        def scan_conflicts(x_all: list[Preference], y_all: list[Preference]) -> None:
            nonlocal score
            for xp in x_all:
                if not (xp.polarity in _NEG and xp.target in _PARTNER):
                    continue
                for yp in y_all:
                    if yp.topicGroup != xp.topicGroup:
                        continue
                    if not (yp.polarity in _LIKE and yp.target in _SELF):
                        continue
                    if xp.polarity == "reject" and xp.flexibility <= 2:
                        sev = 5 if xp.flexibility <= 1 else 4
                    elif xp.polarity == "reject":
                        sev = 3
                    else:  # dislike
                        sev = 2
                    reason = f"一方对伴侣{xp.topic}较排斥，另一方明确喜欢{yp.topic}"
                    conflict = Conflict(topic=xp.topic, severity=sev, reason=reason)
                    (hard if sev >= 4 else soft).append(conflict)
                    score -= sev * 6
                    cautions.append(reason)

        scan_conflicts(a_all, b_all)
        scan_conflicts(b_all, a_all)

        # --- values / long-term alignment ------------------------------------
        s_gap = abs(a.relationshipIntent.seriousness - b.relationshipIntent.seriousness)
        if s_gap >= 3:
            c = Conflict(topic="关系目标", severity=4,
                         reason="一方想认真长期，一方偏随意，关系目标差距较大")
            hard.append(c)
            cautions.append(c.reason)
            score -= 18
            dims.values = 20
            dims.longTermPlan = 20
        else:
            dims.values = _clamp(80 - s_gap * 15, 20, 90)
            dims.longTermPlan = dims.values
            if s_gap <= 1 and a.relationshipIntent.seriousness >= 4:
                score += 6
                positives.append("都倾向认真稳定的长期关系")

        # --- complementarity (only 'good' opposites) -------------------------
        e_gap = abs(a.traits.socialEnergy - b.traits.socialEnergy)
        if 1 <= e_gap <= 2:
            dims.complementarity = 60 + e_gap * 5
            score += 4
            positives.append("社交节奏一动一静，可以互补")
        elif e_gap == 0:
            dims.complementarity = 45

        # --- structured diff nudges ------------------------------------------
        if diff.get("sameSchool"):
            score += 3
            positives.append("同校")
        if diff.get("sameCity"):
            score += 3
        shared = diff.get("sharedInterests") or []
        if shared:
            score += min(6, len(shared) * 2)

        dims.interests = _clamp(dims.interests, 0, 100)
        dims.conflictRisk = _clamp(len(hard) * 40 + len(soft) * 15, 0, 100)
        dims.communication = 60
        dims.emotionalNeeds = 55
        dims.lifestyle = _clamp(70 - len(soft) * 10, 20, 90)

        info = len(a_all) + len(b_all)
        confidence = 1 if info <= 2 else 3 if info <= 8 else 4

        return PairCompatibility(
            llmScore=round(_clamp(score, 0, 100), 1),
            confidence=confidence,
            dimensions=dims,
            hardConflicts=hard,
            softConflicts=soft,
            positiveReasons=positives[:5],
            cautionReasons=cautions[:5],
        )


class LlmJudge:
    version = "pair-judge-ft"

    def __init__(self, client: OllamaClient, model: str, fallback: RuleBasedJudge):
        self._client = client
        self._model = model
        self._fallback = fallback

    async def judge(self, a: UserSemanticProfile, b: UserSemanticProfile,
                    diff: dict[str, Any]) -> PairCompatibility:
        msg = pair_judge_user_message(
            a.relationshipIntent.mode, a.model_dump(), b.model_dump(), diff)
        try:
            data = await self._client.chat_json(self._model, PAIR_JUDGE_SYSTEM, msg)
            result = PairCompatibility.model_validate(data)
        except (LLMError, ValueError):
            result = self._fallback.judge(a, b, diff)
        # H1 dealbreakers are code-enforced, never trusted to the model (see _enforce_dealbreakers).
        return _enforce_dealbreakers(result, a, b)


def build_judge(settings: Settings, client: OllamaClient | None):
    rule = RuleBasedJudge()
    if settings.llm_backend == "ollama" and client is not None:
        return LlmJudge(client, settings.pair_judge_model, rule)
    return rule
