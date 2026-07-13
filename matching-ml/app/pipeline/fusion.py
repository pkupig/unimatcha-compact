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


# matchBasis 分类：questionnaire-basis 弱化 profile 组件、profile-basis 弱化 questionnaire 组件；
# llm/semantic/complementarity 是 LLM 派生的相容信号，两种 basis 都保留。
_QUESTIONNAIRE_KEYS = {"questionnaire"}
_PROFILE_KEYS = {"profile", "interestActivity", "campusSchedule"}


def _pair_basis(a: CandidateProfile, b: CandidateProfile) -> str:
    """一对的匹配依据：两人一致才生效，任一方不同则回退 'both'（中性默认，保持对称）。"""
    def norm(c: CandidateProfile) -> str:
        v = c.prefs.matchBasis if (c.prefs and c.prefs.matchBasis) else "both"
        return v if v in ("questionnaire", "profile", "both") else "both"
    na, nb = norm(a), norm(b)
    return na if na == nb else "both"


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
    # matchBasis：按用户选择的匹配依据重加权（questionnaire / profile 侧此消彼长），再归一化
    # 回同一 0..100 量纲，避免选了 basis 的用户系统性被打低分。仅当双方 basis 一致且非 "both"
    # 时生效；默认 / 分歧走原权重，输出与之前逐字节一致。
    basis = _pair_basis(a, b)
    if basis != "both":
        DOWN = 0.15  # 弱化系数（不置 0，留底避免主组件缺失时整对失去信号）
        down_keys = {
            k for k in parts
            if (basis == "questionnaire" and k in _PROFILE_KEYS)
            or (basis == "profile" and k in _QUESTIONNAIRE_KEYS)
        }
        for k in down_keys:
            parts[k] *= DOWN
        orig_w_sum = sum(w.values())
        new_w_sum = orig_w_sum - (1 - DOWN) * sum(w[k] for k in down_keys)
        if new_w_sum > 0:
            factor = orig_w_sum / new_w_sum
            for k in parts:
                parts[k] *= factor

    raw = sum(parts.values())
    breakdown = {k: round(v, 1) for k, v in parts.items()}
    breakdown["riskPenalty"] = float(risk_penalty)

    final = max(0.0, min(100.0, raw - risk_penalty))
    return FusionResult(round(final, 1), False, breakdown,
                        pc.positiveReasons, pc.cautionReasons)
