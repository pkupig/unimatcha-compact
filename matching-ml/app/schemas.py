"""Pydantic models.

Two groups:

1. Wire contract — mirrors the NestJS `MatchModelProvider` interface
   (api/app/.../matching/providers/match-model.interface.ts). The service accepts
   `{candidates, constraints}` and returns a `MatchResult`, byte-compatible with the
   existing `ai-match-model.provider.example.ts` so wiring it in is a config switch.

2. Semantic layer — `UserSemanticProfile` and `PairCompatibility` from algorithm.md.
   These are the fine-tuned LLM's structured I/O. They never leave the service on the
   wire; only the fused score + a sanitized `metadata` blob does.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Mode = Literal["romantic", "friend"]
Polarity = Literal["like", "dislike", "accept", "reject", "neutral"]
Target = Literal["self", "partner", "both"]


# --------------------------------------------------------------------------- #
# 1. Wire contract (must match match-model.interface.ts)
# --------------------------------------------------------------------------- #
class AnswerData(BaseModel):
    questionId: str
    questionType: str  # SCALE | SINGLE_CHOICE | MULTIPLE_CHOICE | TEXT
    value: Any
    questionOrder: Optional[int] = None
    questionGroup: Optional[str] = None


class MatchPreferences(BaseModel):
    """The `_prefs` blob the NestJS side attaches to each candidate."""
    preferredGender: Optional[str] = None
    requireSameCity: Optional[bool] = None
    requireSameUniversity: Optional[bool] = None
    requireSameMajor: Optional[bool] = None
    ageMin: Optional[int] = None
    ageMax: Optional[int] = None
    universityStage: Optional[str] = None  # comma-separated: undergraduate,master,doctor
    matchBasis: Optional[str] = None  # questionnaire | profile | both
    extraMatchInfo: Optional[str] = None  # free text -> feeds the extractor


class CandidateProfile(BaseModel):
    userId: str
    gender: str = ""
    genderPref: str = "any"
    age: int = 0
    city: str = ""
    school: str = ""
    grade: Optional[str] = None
    major: Optional[str] = None
    interests: list[str] = Field(default_factory=list)
    activities: Optional[list[str]] = None
    bio: Optional[str] = None
    answers: list[AnswerData] = Field(default_factory=list)
    prefs: Optional[MatchPreferences] = Field(default=None, alias="_prefs")
    enhanced: Optional[bool] = False
    enhancedCost: Optional[int] = None
    # Fairness / anti-Matthew-effect signals (optional; backend fills if available).
    waitingRounds: Optional[int] = 0   # match rounds this user has waited unmatched
    exposureCount: Optional[int] = 0   # how many times already shown (recall bias)

    model_config = {"populate_by_name": True}


class MatchConstraints(BaseModel):
    mode: Mode
    maxMatchesPerUser: int = 1
    sameCity: Optional[bool] = None
    excludeRelationshipMode: Optional[bool] = None


class MatchPair(BaseModel):
    userAId: str
    userBId: str
    score: float
    metadata: Optional[dict[str, Any]] = None
    enhanced: Optional[bool] = False
    enhancedCost: Optional[int] = None


class EmptyPoolRefund(BaseModel):
    userId: str
    mode: Mode
    cost: float


class MatchResult(BaseModel):
    pairs: list[MatchPair] = Field(default_factory=list)
    unmatched: list[str] = Field(default_factory=list)
    emptyPoolUserIds: list[EmptyPoolRefund] = Field(default_factory=list)
    modelVersion: Optional[str] = None
    processingTimeMs: Optional[int] = None
    # Matching-quality audit (extra field; NestJS ignores unknown keys).
    matchStats: Optional[dict[str, Any]] = None


class GenerateMatchesRequest(BaseModel):
    candidates: list[CandidateProfile]
    constraints: MatchConstraints


# --------------------------------------------------------------------------- #
# 2. Semantic layer (fine-tuned LLM I/O — algorithm.md §3, §4)
# --------------------------------------------------------------------------- #
class Preference(BaseModel):
    topic: str
    topicGroup: str
    polarity: Polarity
    target: Target
    strength: int = 3      # 1..5
    flexibility: int = 3   # 1..5  (1 = hard dealbreaker)
    evidence: str = ""


class RiskFlag(BaseModel):
    type: Literal["hard_boundary", "possible_conflict", "safety", "low_information"]
    severity: int = 1  # 1..5
    evidence: str = ""


class RelationshipIntent(BaseModel):
    mode: Mode
    seriousness: int = 3
    longTermOrientation: int = 3
    opennessToDifferentBackground: int = 3


class Traits(BaseModel):
    socialEnergy: int = 3
    emotionalExpression: int = 3
    conflictStyle: Literal["direct", "avoidant", "cooldown_then_talk", "mixed"] = "mixed"
    planningStyle: Literal["structured", "flexible", "spontaneous", "mixed"] = "mixed"
    attachmentSignal: Literal["secure", "anxious", "avoidant", "mixed", "unknown"] = "unknown"


class UserSemanticProfile(BaseModel):
    version: str = "profile-extractor-v0"
    relationshipIntent: RelationshipIntent
    traits: Traits = Field(default_factory=Traits)
    preferences: list[Preference] = Field(default_factory=list)
    dealbreakers: list[Preference] = Field(default_factory=list)
    flexibleAreas: list[str] = Field(default_factory=list)
    summaryForMatching: str = ""
    riskFlags: list[RiskFlag] = Field(default_factory=list)


class Conflict(BaseModel):
    topic: str
    severity: int = 1  # 1..5
    reason: str = ""


class PairDimensions(BaseModel):
    values: float = 0
    lifestyle: float = 0
    communication: float = 0
    emotionalNeeds: float = 0
    interests: float = 0
    longTermPlan: float = 0
    complementarity: float = 0
    conflictRisk: float = 0


class PairCompatibility(BaseModel):
    llmScore: float = 0          # 0..100
    confidence: int = 0          # 0..5
    dimensions: PairDimensions = Field(default_factory=PairDimensions)
    hardConflicts: list[Conflict] = Field(default_factory=list)
    softConflicts: list[Conflict] = Field(default_factory=list)
    positiveReasons: list[str] = Field(default_factory=list)
    cautionReasons: list[str] = Field(default_factory=list)
