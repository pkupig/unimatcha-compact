"""Interface outline: implementation bodies removed."""
from __future__ import annotations
from ..schemas import CandidateProfile
from . import rules
def prefilter_score(a: CandidateProfile, b: CandidateProfile, mode: str) -> float:
def recall_pairs(
