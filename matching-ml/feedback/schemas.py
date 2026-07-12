"""Feedback data model — the foundation of "越用越准" (algorithm.md §9).

Three record types flow through the loop:

    MatchExposure   — logged when a pair is SHOWN. Carries a FEATURE SNAPSHOT frozen at
                      show-time (§9.4): profiles/models change later, so we must train on
                      what was true then, not on today's data.
    BehaviorEvent   — raw user actions (viewed / opened / messaged / confirmed / reported…).
                      No exposure ⇒ no negative label: a pair nobody saw isn't a rejection.
    OutcomeLabel    — derived by attribution.py by joining events to an exposure within
                      time windows. Multi-task, NOT a single success/fail bit.

These are storage-agnostic Pydantic models; logging_sink.py persists them (JSONL now,
DB later — Prisma models in feedback/prisma_models.prisma).
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Mode = Literal["romantic", "friend"]

BehaviorType = Literal[
    "viewed", "openedProfile", "firstMessage", "message",
    "confirmed", "rejected", "dissolved", "reported", "blocked",
]


class MatchExposure(BaseModel):
    exposureId: str
    matchId: Optional[str] = None
    mode: Mode
    userAId: str
    userBId: str
    shownToUserId: str            # which side this card was shown to (§9.3)
    position: int = 0             # rank position shown at (exposure bias signal)
    algorithmVersion: str = ""
    constitutionVersion: str = ""
    modelVersions: dict[str, str] = Field(default_factory=dict)
    featureSnapshot: dict[str, float] = Field(default_factory=dict)  # frozen features
    finalScore: float = 0.0
    shownAt: str = ""             # ISO timestamp (stamped by caller; scripts stay deterministic)


class BehaviorEvent(BaseModel):
    matchId: Optional[str] = None
    exposureId: Optional[str] = None
    mode: Mode
    userAId: str
    userBId: str
    actorId: str                  # who performed the action
    type: BehaviorType
    at: str = ""                  # ISO timestamp
    meta: dict[str, Any] = Field(default_factory=dict)  # e.g. {"reason": "兴趣不合"}


class OutcomeLabel(BaseModel):
    viewed: int = 0
    openedProfile: int = 0
    userAConfirmed: int = 0
    userBConfirmed: int = 0
    mutualConfirmed: int = 0
    firstMessageSent: int = 0
    mutualConversation: int = 0
    messageCountBucket: Literal["0", "1-2", "3-10", "10+"] = "0"
    survived48h: int = 0
    survived7d: int = 0
    dissolvedQuickly: int = 0
    reportedOrBlocked: int = 0
    explicitRating: Optional[int] = None
    explicitReason: list[str] = Field(default_factory=list)
    # Context needed to de-bias (active vs inactive — §9.7):
    bothActive: int = 1


# successScore weights (§9.2) — the initial hand weights; data team retunes later.
SUCCESS_WEIGHTS = {
    "viewed": 0.10,
    "openedProfile": 0.15,
    "firstMessageSent": 0.30,
    "mutualConversation": 0.45,
    "mutualConfirmed": 0.70,
    "survived7d": 0.30,
    "dissolvedQuickly": -0.60,
    "reportedOrBlocked": -1.00,
}


def success_score(label: OutcomeLabel) -> float:
    """Single scalar target (§9.2). Report/block is a strong negative; a card open is weak."""
    d = label.model_dump()
    return round(sum(w * d.get(k, 0) for k, w in SUCCESS_WEIGHTS.items()), 4)


# The four binary heads the ranker predicts (§9.5.1). Order is the model's output order.
RANKER_TASKS = ["mutualConfirmed", "mutualConversation", "survived7d", "reportedOrBlocked"]

# How those P(head) combine into the final RankScore (§9.5.1).
RANK_WEIGHTS = {
    "mutualConfirmed": 0.40,
    "mutualConversation": 0.35,
    "survived7d": 0.20,
    "reportedOrBlocked": -0.50,
}


def rank_score(probs: dict[str, float]) -> float:
    """RankScore in [0,1] from the four predicted probabilities."""
    s = sum(w * probs.get(k, 0.0) for k, w in RANK_WEIGHTS.items())
    return max(0.0, min(1.0, s))
