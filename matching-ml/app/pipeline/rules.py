"""Deterministic rule layer: hard gate + questionnaire/demographic scoring.

Ported faithfully from the existing NestJS ScoringMatchModelProvider
(scoring-match-model.provider.ts) so the hybrid pipeline keeps the exact hard
constraints and questionnaire math the product already relies on. The LLM adds
signal on top of this; it never gets to override a hard constraint.
"""
from __future__ import annotations

import json
import re
from typing import Any

from ..mode_profile import get_profile
from ..schemas import AnswerData, CandidateProfile

GENERAL_GROUP = "general"
GENERAL_WEIGHT = 0.20


def _cat_weights(mode: str) -> dict[str, float]:
    return get_profile(mode).category_weights


def _norm(s: str | None) -> str:
    return (s or "").strip().lower()


def infer_stage_from_grade(grade: str | None) -> str | None:
    if not grade:
        return None
    g = grade.strip().lower()
    if re.search(r"博士|博一|博二|博三|博四|phd|doctor", g):
        return "doctor"
    if re.search(r"研一|研二|研三|硕士|硕|master|postgrad", g):
        return "master"
    if re.search(r"大一|大二|大三|大四|本科|undergrad|^year\s*\d", g):
        return "undergraduate"
    return None


def infer_group_by_order(order: int, mode: str) -> str:
    if mode == "friend":
        if 1 <= order <= 5: return "社交风格"
        if 6 <= order <= 10: return "兴趣活动"
        if 11 <= order <= 15: return "人格节奏"
        if 16 <= order <= 20: return "价值观"
        if 21 <= order <= 25: return "生活规划"
        return GENERAL_GROUP
    if 1 <= order <= 10: return "生活习惯"
    if 11 <= order <= 20: return "价值观"
    if 21 <= order <= 30: return "恋爱观"
    if 31 <= order <= 40: return "沟通"
    if 41 <= order <= 50: return "财务观"
    return GENERAL_GROUP


def _normalize_multichoice(value: Any) -> list[str] | None:
    v = value
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        if s.startswith("["):
            try:
                v = json.loads(s)
            except json.JSONDecodeError:
                return None
        else:
            v = [s]
    if not isinstance(v, list):
        return None
    items = [str(x).strip() for x in v if str(x).strip()]
    return items or None


def passes_hard_gate(a: CandidateProfile, b: CandidateProfile, mode: str) -> bool:
    """True iff the pair survives every hard constraint (calculatePairScore != 0)."""
    ap, bp = a.prefs, b.prefs
    if mode == "romantic":
        # per-mode 匹配偏好 preferredGender 优先，回退到 profile 级 genderPref。
        # 原实现只看 genderPref，用户经匹配偏好设的性别要求被硬门忽略（与 friend 分支不一致、
        # 且违反宪法硬条款）。保持 romantic 严格语义：对方性别未知则非 "any" 偏好一律不通过。
        a_pref = (ap.preferredGender if (ap and ap.preferredGender) else a.genderPref) or "any"
        b_pref = (bp.preferredGender if (bp and bp.preferredGender) else b.genderPref) or "any"
        a_ok = a_pref in ("any", "") or a_pref == b.gender
        b_ok = b_pref in ("any", "") or b_pref == a.gender
        if not a_ok or not b_ok:
            return False
    else:
        if ap and ap.preferredGender and b.gender and b.gender != ap.preferredGender:
            return False
        if bp and bp.preferredGender and a.gender and a.gender != bp.preferredGender:
            return False

    if (ap and ap.requireSameCity) or (bp and bp.requireSameCity):
        if not a.city or not b.city or _norm(a.city) != _norm(b.city):
            return False
    if (ap and ap.requireSameUniversity) or (bp and bp.requireSameUniversity):
        if not a.school or not b.school or _norm(a.school) != _norm(b.school):
            return False

    if ap:
        if ap.ageMin is not None and b.age and b.age < ap.ageMin: return False
        if ap.ageMax is not None and b.age and b.age > ap.ageMax: return False
    if bp:
        if bp.ageMin is not None and a.age and a.age < bp.ageMin: return False
        if bp.ageMax is not None and a.age and a.age > bp.ageMax: return False

    if ap and ap.universityStage:
        stages = [s.strip() for s in str(ap.universityStage).split(",") if s.strip()]
        sb = infer_stage_from_grade(b.grade)
        if stages and sb and sb not in stages:
            return False
    if bp and bp.universityStage:
        stages = [s.strip() for s in str(bp.universityStage).split(",") if s.strip()]
        sa = infer_stage_from_grade(a.grade)
        if stages and sa and sa not in stages:
            return False
    return True


def questionnaire_score(answers_a: list[AnswerData], answers_b: list[AnswerData], mode: str) -> float:
    """0..70, matching calcQuestionnaireScore."""
    weights = _cat_weights(mode)
    map_a = {a.questionId: a for a in answers_a}
    map_b = {b.questionId: b for b in answers_b}
    group_sims: dict[str, dict[str, float]] = {}

    for qid, ad_a in map_a.items():
        ad_b = map_b.get(qid)
        if not ad_b or ad_a.questionType == "TEXT":
            continue
        sim: float
        if ad_a.questionType == "SCALE":
            try:
                va, vb = float(ad_a.value), float(ad_b.value)
            except (TypeError, ValueError):
                continue
            if not (1 <= va <= 5 and 1 <= vb <= 5):
                continue
            sim = 1 - abs(va - vb) / 4
        elif ad_a.questionType == "SINGLE_CHOICE":
            if ad_a.value is None or ad_b.value is None:
                continue
            sim = 1.0 if str(ad_a.value) == str(ad_b.value) else 0.0
        elif ad_a.questionType == "MULTIPLE_CHOICE":
            la, lb = _normalize_multichoice(ad_a.value), _normalize_multichoice(ad_b.value)
            if not la or not lb:
                continue
            sa, sb = set(la), set(lb)
            union = sa | sb
            if not union:
                continue
            sim = len(sa & sb) / len(union)
        else:
            continue

        group = ad_a.questionGroup or infer_group_by_order(ad_a.questionOrder or 0, mode)
        if group not in weights:
            group = GENERAL_GROUP
        g = group_sims.setdefault(group, {"sum": 0.0, "count": 0.0})
        g["sum"] += sim
        g["count"] += 1

    weighted = list(weights.items()) + [(GENERAL_GROUP, GENERAL_WEIGHT)]
    present = [(grp, w) for grp, w in weighted if group_sims.get(grp, {}).get("count", 0) > 0]
    total_w = sum(w for _, w in present)
    if total_w == 0:
        return 0.5 * 70
    score = 0.0
    for grp, w in present:
        d = group_sims[grp]
        score += (w / total_w) * (d["sum"] / d["count"])
    return score * 70


def demographic_score(a: CandidateProfile, b: CandidateProfile, mode: str) -> float:
    """0..30."""
    if mode == "friend":
        return _friend_demographic(a, b)
    score = 0.0
    if a.age and b.age:
        d = abs(a.age - b.age)
        score += (15 if d <= 1 else 13 if d <= 2 else 11 if d <= 3 else 9 if d <= 4
                  else 7 if d <= 5 else 5 if d <= 7 else 2)
    else:
        score += 8
    if a.city and b.city:
        score += 10 if a.city == b.city else 4
    else:
        score += 6
    if a.school and b.school:
        score += 5 if a.school == b.school else 1
    else:
        score += 3
    return min(30.0, score)


def _set(xs: list[str] | None) -> set[str]:
    return {s.strip().lower() for s in (xs or []) if s and s.strip()}


def _friend_demographic(a: CandidateProfile, b: CandidateProfile) -> float:
    score = 0.0
    ia, ib = _set(a.interests), _set(b.interests)
    if ia and ib:
        score += min(15, len(ia & ib) * 5)
    else:
        score += 6
    aa, ab = _set(a.activities), _set(b.activities)
    if aa and ab:
        score += min(10, len(aa & ab) * 5)
    else:
        score += 4
    if a.school and b.school:
        score += 5 if a.school == b.school else 2
    else:
        score += 3
    return min(30.0, score)


def structured_diff(a: CandidateProfile, b: CandidateProfile) -> dict[str, Any]:
    return {
        "ageDiff": abs((a.age or 0) - (b.age or 0)),
        "sameSchool": bool(a.school and a.school == b.school),
        "sameCity": bool(a.city and a.city == b.city),
        "sharedInterests": sorted(_set(a.interests) & _set(b.interests)),
    }
