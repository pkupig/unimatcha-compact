"""Global matching (algorithm.md §6) — now with stable matching.

Greedy max-weight (our old default, and still used for friend b-matching) can leave
**blocking pairs**: two users who both prefer each other over whom they were matched
with. That is exactly the instability Hinge markets Gale-Shapley to avoid.

`stable_one_to_one` returns a matching with **zero blocking pairs when the feasibility
graph is bipartite** (deferred acceptance) and drives blocking pairs toward zero
otherwise (blocking-pair elimination for the non-bipartite / same-sex-inclusive case,
where a fully stable matching may not exist — the residual count is reported, not hidden).

Preference lists come from directional desirability d(u→v) (pairscore.py); the emitted
pair score is the symmetric harmonic mutual score.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field


@dataclass
class ScoredPair:
    a: str
    b: str
    score: float  # symmetric mutual score


@dataclass
class MatchStats:
    method: str = "greedy"
    blocking_pairs: int = 0
    total_score: float = 0.0
    matched_users: int = 0


# --------------------------------------------------------------------------- #
# Legacy / friend-mode matchers (kept for comparison and multi-match)
# --------------------------------------------------------------------------- #
def greedy_one_to_one(pairs: list[ScoredPair], priority: set[str] | None = None) -> list[ScoredPair]:
    priority = priority or set()
    key = lambda p: (1 if (p.a in priority or p.b in priority) else 0, p.score)
    matched: set[str] = set()
    chosen: list[ScoredPair] = []
    for p in sorted(pairs, key=key, reverse=True):
        if p.a in matched or p.b in matched:
            continue
        chosen.append(p)
        matched.update((p.a, p.b))
    return chosen


def capacitated_b_match(
    pairs: list[ScoredPair], capacity: dict[str, int], priority: set[str] | None = None
) -> list[ScoredPair]:
    priority = priority or set()
    key = lambda p: (1 if (p.a in priority or p.b in priority) else 0, p.score)
    used: dict[str, int] = {}
    chosen: list[ScoredPair] = []
    for p in sorted(pairs, key=key, reverse=True):
        if used.get(p.a, 0) >= capacity.get(p.a, 1) or used.get(p.b, 0) >= capacity.get(p.b, 1):
            continue
        chosen.append(p)
        used[p.a] = used.get(p.a, 0) + 1
        used[p.b] = used.get(p.b, 0) + 1
    return chosen


# --------------------------------------------------------------------------- #
# Stable one-to-one matching
# --------------------------------------------------------------------------- #
def _prefers(u: str, v: str, cur: str | None, dir_score: dict[tuple[str, str], float]) -> bool:
    """Does u prefer v over its current partner `cur` (None = unmatched)?"""
    if cur is None:
        return True
    return dir_score.get((u, v), 0.0) > dir_score.get((u, cur), 0.0)


def count_blocking_pairs(
    match: dict[str, str], pairs: list[ScoredPair], dir_score: dict[tuple[str, str], float]
) -> int:
    n = 0
    for p in pairs:
        u, v = p.a, p.b
        if match.get(u) == v:
            continue
        if _prefers(u, v, match.get(u), dir_score) and _prefers(v, u, match.get(v), dir_score):
            n += 1
    return n


def _two_color(pairs: list[ScoredPair]) -> dict[str, int] | None:
    """2-color the feasibility graph; None if it has an odd cycle (not bipartite)."""
    adj: dict[str, list[str]] = {}
    for p in pairs:
        adj.setdefault(p.a, []).append(p.b)
        adj.setdefault(p.b, []).append(p.a)
    color: dict[str, int] = {}
    for start in adj:
        if start in color:
            continue
        color[start] = 0
        q = deque([start])
        while q:
            u = q.popleft()
            for w in adj[u]:
                if w not in color:
                    color[w] = color[u] ^ 1
                    q.append(w)
                elif color[w] == color[u]:
                    return None
    return color


def _pref_lists(
    pairs: list[ScoredPair], dir_score: dict[tuple[str, str], float]
) -> dict[str, list[str]]:
    """For each user, partners sorted by that user's directional desirability."""
    nbr: dict[str, set[str]] = {}
    for p in pairs:
        nbr.setdefault(p.a, set()).add(p.b)
        nbr.setdefault(p.b, set()).add(p.a)
    return {
        u: sorted(vs, key=lambda v: dir_score.get((u, v), 0.0), reverse=True)
        for u, vs in nbr.items()
    }


def _gale_shapley(
    proposers: list[str], prefs: dict[str, list[str]], dir_score: dict[tuple[str, str], float]
) -> dict[str, str]:
    """Bipartite deferred acceptance. Returns acceptor->proposer, guaranteed stable."""
    free = deque(proposers)
    nxt: dict[str, int] = {p: 0 for p in proposers}
    held: dict[str, str] = {}  # acceptor -> current proposer
    while free:
        p = free.popleft()
        plist = prefs.get(p, [])
        while nxt[p] < len(plist):
            a = plist[nxt[p]]
            nxt[p] += 1
            cur = held.get(a)
            if cur is None:
                held[a] = p
                break
            if dir_score.get((a, p), 0.0) > dir_score.get((a, cur), 0.0):
                held[a] = p
                free.append(cur)
                break
            # else a keeps cur; p tries next
        # if list exhausted, p stays unmatched
    return held


def _blocking_elimination(
    pairs: list[ScoredPair],
    dir_score: dict[tuple[str, str], float],
    priority: set[str],
    max_iter: int = 200,
) -> dict[str, str]:
    """Greedy init + repeatedly resolve the strongest blocking pair (non-bipartite case)."""
    match: dict[str, str] = {}
    for sp in greedy_one_to_one(pairs, priority):
        match[sp.a] = sp.b
        match[sp.b] = sp.a
    for _ in range(max_iter):
        blocking = [
            p for p in pairs
            if match.get(p.a) != p.b
            and _prefers(p.a, p.b, match.get(p.a), dir_score)
            and _prefers(p.b, p.a, match.get(p.b), dir_score)
        ]
        if not blocking:
            break
        p = max(blocking, key=lambda x: x.score)
        for endpoint in (p.a, p.b):
            old = match.pop(endpoint, None)
            if old is not None:
                match.pop(old, None)
        match[p.a] = p.b
        match[p.b] = p.a
    return match


def stable_one_to_one(
    pairs: list[ScoredPair],
    dir_score: dict[tuple[str, str], float],
    priority: set[str] | None = None,
) -> tuple[list[ScoredPair], MatchStats]:
    """Stable one-to-one matching. Bipartite -> Gale-Shapley; else blocking-elimination."""
    priority = priority or set()
    if not pairs:
        return [], MatchStats(method="stable-empty")

    color = _two_color(pairs)
    prefs = _pref_lists(pairs, dir_score)

    if color is not None:
        # Members go on the proposing side — proposers get their optimal stable partner.
        side0 = [u for u, c in color.items() if c == 0]
        side1 = [u for u, c in color.items() if c == 1]
        m0 = sum(1 for u in side0 if u in priority)
        m1 = sum(1 for u in side1 if u in priority)
        proposers = side0 if (m0, -len(side0)) >= (m1, -len(side1)) else side1
        held = _gale_shapley(proposers, prefs, dir_score)
        match = {}
        for a, p in held.items():
            match[a] = p
            match[p] = a
        method = "gale-shapley"
    else:
        match = _blocking_elimination(pairs, dir_score, priority)
        method = "blocking-elimination"

    score_of = {(p.a, p.b): p.score for p in pairs}
    score_of.update({(p.b, p.a): p.score for p in pairs})
    seen: set[frozenset[str]] = set()
    chosen: list[ScoredPair] = []
    for u, v in match.items():
        k = frozenset((u, v))
        if k in seen:
            continue
        seen.add(k)
        chosen.append(ScoredPair(u, v, score_of.get((u, v), 0.0)))

    stats = MatchStats(
        method=method,
        blocking_pairs=count_blocking_pairs(match, pairs, dir_score),
        total_score=round(sum(c.score for c in chosen), 1),
        matched_users=len(seen) * 2,
    )
    return chosen, stats
