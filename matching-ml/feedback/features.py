"""Feature snapshot: the single definition of what we freeze at exposure time and feed
to the ranker. Building it in ONE place guarantees the logged snapshot and the training
features are identical (no train/serve skew).

`build_snapshot(...)` runs in the pipeline; `vectorize(snapshot)` turns it into the fixed
ordered float vector the ranker consumes. FEATURE_NAMES is the contract between them.
"""
from __future__ import annotations

from typing import Any

FEATURE_NAMES = [
    # LLM pair judge
    "llmScore", "confidence",
    "dim_values", "dim_lifestyle", "dim_communication", "dim_emotionalNeeds",
    "dim_interests", "dim_longTermPlan", "dim_complementarity", "dim_conflictRisk",
    # fused rule/questionnaire signals (the hand-weighted score becomes a feature — §3.3)
    "fusedScore", "f_questionnaire", "f_profile", "f_semantic", "f_complementarity", "riskPenalty",
    "hardConflicts", "softConflicts",
    # structured diff
    "ageDiff", "sameSchool", "sameCity", "sharedInterests",
    # directional desirability
    "desir_aToB", "desir_bToA", "desir_mutual",
    # context (de-bias — §9.7)
    "waitRounds", "exposureCount", "position",
]


def build_snapshot(
    *,
    pc: Any,           # PairCompatibility
    fr: Any,           # FusionResult
    diff: dict[str, Any],
    d_ab: float,
    d_ba: float,
    mutual: float,
    wait_rounds: int = 0,
    exposure_count: int = 0,
    position: int = 0,
) -> dict[str, float]:
    b = fr.breakdown
    dims = pc.dimensions
    return {
        "llmScore": float(pc.llmScore),
        "confidence": float(pc.confidence),
        "dim_values": float(dims.values),
        "dim_lifestyle": float(dims.lifestyle),
        "dim_communication": float(dims.communication),
        "dim_emotionalNeeds": float(dims.emotionalNeeds),
        "dim_interests": float(dims.interests),
        "dim_longTermPlan": float(dims.longTermPlan),
        "dim_complementarity": float(dims.complementarity),
        "dim_conflictRisk": float(dims.conflictRisk),
        "fusedScore": float(fr.final_score),
        "f_questionnaire": float(b.get("questionnaire", b.get("interestActivity", 0.0))),
        "f_profile": float(b.get("profile", 0.0)),
        "f_semantic": float(b.get("semantic", 0.0)),
        "f_complementarity": float(b.get("complementarity", 0.0)),
        "riskPenalty": float(b.get("riskPenalty", 0.0)),
        "hardConflicts": float(len(pc.hardConflicts)),
        "softConflicts": float(len(pc.softConflicts)),
        "ageDiff": float(diff.get("ageDiff", 0)),
        "sameSchool": 1.0 if diff.get("sameSchool") else 0.0,
        "sameCity": 1.0 if diff.get("sameCity") else 0.0,
        "sharedInterests": float(len(diff.get("sharedInterests") or [])),
        "desir_aToB": float(d_ab),
        "desir_bToA": float(d_ba),
        "desir_mutual": float(mutual),
        "waitRounds": float(wait_rounds),
        "exposureCount": float(exposure_count),
        "position": float(position),
    }


def vectorize(snapshot: dict[str, float]) -> list[float]:
    """Fixed-order vector; missing keys default to 0 so old snapshots still load."""
    return [float(snapshot.get(name, 0.0)) for name in FEATURE_NAMES]
