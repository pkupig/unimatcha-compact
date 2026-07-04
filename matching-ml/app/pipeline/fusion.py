"""Score fusion (algorithm.md §5).

FinalScore is NOT the raw llmScore. The LLM is one weighted signal among the
questionnaire, profile and semantic signals; a severity-5 hard conflict eliminates
the pair outright regardless of how high the LLM scored it (§4).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..mode_profile import get_profile
from ..schemas import CandidateProfile, PairCompatibility
from . import rules


@dataclass
class FusionResult:
    final_score: float
    eliminated: bool
    breakdown: dict[str, float]
    reasons: list[str]
    risks: list[str]


def _avg(*xs: float) -> float:
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else 0.0


def fuse(
    a: CandidateProfile,
    b: CandidateProfile,
    pc: PairCompatibility,
    mode: str,
) -> FusionResult:
    # Hard elimination first — a severity-5 hard conflict can't be bought back by score.
    if any(c.severity >= 5 for c in pc.hardConflicts):
        return FusionResult(0.0, True, {"eliminated": 1.0},
                            [], [c.reason for c in pc.hardConflicts])

    q = rules.questionnaire_score(a.answers, b.answers, mode)          # 0..70
    demo = rules.demographic_score(a, b, mode)                          # 0..30
    q100 = q / 70 * 100
    demo100 = demo / 30 * 100
    d = pc.dimensions
    semantic = _avg(d.values, d.communication, d.emotionalNeeds)        # 0..100
    complement = d.complementarity                                     # 0..100

    risk_penalty = (
        sum(c.severity for c in pc.hardConflicts) * 5
        + sum(c.severity for c in pc.softConflicts) * 2
    )

    w = get_profile(mode).fusion_weights  # all mode-specific weights live in ModeProfile
    if mode == "romantic":
        parts = {
            "llm": w["llm"] * pc.llmScore,
            "questionnaire": w["questionnaire"] * q100,
            "profile": w["profile"] * demo100,
            "semantic": w["semantic"] * semantic,
            "complementarity": w["complementarity"] * complement,
        }
    else:  # friend: demographic already = interest/activity signal
        campus = 100.0 if (a.school and a.school == b.school) else 50.0
        parts = {
            "llm": w["llm"] * pc.llmScore,
            "interestActivity": w["interestActivity"] * demo100,
            "questionnaire": w["questionnaire"] * q100,
            "semantic": w["semantic"] * semantic,
            "campusSchedule": w["campusSchedule"] * campus,
        }
    raw = sum(parts.values())
    breakdown = {k: round(v, 1) for k, v in parts.items()}
    breakdown["riskPenalty"] = float(risk_penalty)

    final = max(0.0, min(100.0, raw - risk_penalty))
    return FusionResult(round(final, 1), False, breakdown,
                        pc.positiveReasons, pc.cautionReasons)
