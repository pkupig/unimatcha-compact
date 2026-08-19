"""Interface outline: implementation bodies removed."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
from ..mode_profile import get_profile
from ..schemas import CandidateProfile, PairCompatibility
from . import rules
@dataclass
class FusionResult:
def _avg(*xs: float) -> float:
def _pair_basis(a: CandidateProfile, b: CandidateProfile) -> str:
    def norm(c: CandidateProfile) -> str:
def fuse(
