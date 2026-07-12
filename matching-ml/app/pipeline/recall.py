"""Candidate recall (algorithm.md §六 Step 3).

Never send all O(n²) pairs to the LLM. Cheap rules (hard gate + questionnaire +
demographic, no model) prefilter to the top-K most promising candidates per user;
only those reach the Pair Judge.
"""
from __future__ import annotations

from ..schemas import CandidateProfile
from . import rules


def prefilter_score(a: CandidateProfile, b: CandidateProfile, mode: str) -> float:
    """Cheap 0..100 estimate used only to rank candidates for recall."""
    q = rules.questionnaire_score(a.answers, b.answers, mode)
    demo = rules.demographic_score(a, b, mode)
    return q + demo  # both already scaled so q(≤70)+demo(≤30) ≈ 0..100


def recall_pairs(
    candidates: list[CandidateProfile], mode: str, top_k: int, min_prefilter: float
) -> list[tuple[CandidateProfile, CandidateProfile, float]]:
    """Return deduped (a, b, prefilter) triples worth judging."""
    n = len(candidates)
    per_user: dict[str, list[tuple[str, float]]] = {c.userId: [] for c in candidates}
    scores: dict[tuple[str, str], float] = {}

    for i in range(n):
        for j in range(i + 1, n):
            a, b = candidates[i], candidates[j]
            if not rules.passes_hard_gate(a, b, mode):
                continue
            s = prefilter_score(a, b, mode)
            if s < min_prefilter:
                continue
            scores[(a.userId, b.userId)] = s
            per_user[a.userId].append((b.userId, s))
            per_user[b.userId].append((a.userId, s))

    by_id = {c.userId: c for c in candidates}
    keep: set[tuple[str, str]] = set()
    for uid, lst in per_user.items():
        lst.sort(key=lambda x: x[1], reverse=True)
        for other, _ in lst[: max(1, top_k)]:
            keep.add((uid, other) if uid < other else (other, uid))

    out = []
    for (x, y) in keep:
        s = scores.get((x, y)) or scores.get((y, x)) or 0.0
        out.append((by_id[x], by_id[y], s))
    return out
