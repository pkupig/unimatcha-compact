"""Interface outline: implementation bodies removed."""
from __future__ import annotations
from .fusion import _avg  # noqa: F401  (kept for parity/testing imports)
from ..schemas import Preference, UserSemanticProfile
def _self_like_index(p: UserSemanticProfile) -> dict[str, set[str]]:
def _adjustment(viewer: UserSemanticProfile, target: UserSemanticProfile) -> float:
def _clamp(x: float) -> float:
def directional(a: UserSemanticProfile, b: UserSemanticProfile, symmetric_core: float) -> tuple[float, float]:
def harmonic_mutual(d_ab: float, d_ba: float) -> float:
