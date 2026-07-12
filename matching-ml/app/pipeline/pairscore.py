"""Directional desirability + symmetric mutual score (README §1.5).

A symmetric compatibility scalar is not enough for a big-tech-grade matcher: A can
find B great while B is lukewarm about A. Stable matching (Gale-Shapley) needs each
user's *ordinal preference list*, which requires a directional score d(u→v).

    d(a→b) = symmetric_core  +  (how well B satisfies A's OWN partner preferences)
    s(a,b) = HarmonicMean(d(a→b), d(b→a))     # penalizes one-sided attraction

The symmetric core is the fused score (fusion.py). The directional adjustment is
computed from each viewer's partner-targeted preferences vs the target's self-likes,
using only SOFT signals — hard conflicts already eliminated the pair upstream.
"""
from __future__ import annotations

from .fusion import _avg  # noqa: F401  (kept for parity/testing imports)
from ..schemas import Preference, UserSemanticProfile

_LIKE = {"like", "accept"}
_NEG = {"dislike", "reject"}
_SELF = {"self", "both"}
_PARTNER = {"partner", "both"}
_ADJ_CAP = 15.0


def _self_like_index(p: UserSemanticProfile) -> dict[str, set[str]]:
    """topicGroup -> {topics the user likes about themselves}."""
    idx: dict[str, set[str]] = {}
    for pref in p.preferences + p.dealbreakers:
        if pref.polarity in _LIKE and pref.target in _SELF:
            idx.setdefault(pref.topicGroup, set()).add(pref.topic)
    return idx


def _adjustment(viewer: UserSemanticProfile, target: UserSemanticProfile) -> float:
    """How much the target pleases/annoys the viewer, per the viewer's OWN wishes."""
    target_likes = _self_like_index(target)
    adj = 0.0
    for pref in viewer.preferences + viewer.dealbreakers:
        if pref.target not in _PARTNER:
            continue
        hit = pref.topic in target_likes.get(pref.topicGroup, set())
        group_hit = pref.topicGroup in target_likes
        if pref.polarity in _LIKE and (hit or group_hit):
            adj += pref.strength * (1.0 if hit else 0.5)          # aspiration met
        elif pref.polarity in _NEG and group_hit:
            adj -= pref.strength                                   # soft dislike hit
    return max(-_ADJ_CAP, min(_ADJ_CAP, adj))


def _clamp(x: float) -> float:
    return max(0.0, min(100.0, x))


def directional(a: UserSemanticProfile, b: UserSemanticProfile, symmetric_core: float) -> tuple[float, float]:
    """Return (d_ab, d_ba): how much A wants B, and how much B wants A."""
    d_ab = _clamp(symmetric_core + _adjustment(a, b))
    d_ba = _clamp(symmetric_core + _adjustment(b, a))
    return d_ab, d_ba


def harmonic_mutual(d_ab: float, d_ba: float) -> float:
    """Symmetric mutual score. Harmonic mean → one lukewarm side drags it down."""
    if d_ab <= 0 or d_ba <= 0:
        return 0.0
    return round(2 * d_ab * d_ba / (d_ab + d_ba), 1)
