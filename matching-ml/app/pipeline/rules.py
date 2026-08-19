"""Interface outline: implementation bodies removed."""
from __future__ import annotations
import json
import re
from typing import Any
from ..mode_profile import get_profile
from ..schemas import AnswerData, CandidateProfile
def _cat_weights(mode: str) -> dict[str, float]:
def _norm(s: str | None) -> str:
def infer_stage_from_grade(grade: str | None) -> str | None:
def infer_group_by_order(order: int, mode: str) -> str:
def _normalize_multichoice(value: Any) -> list[str] | None:
def passes_hard_gate(a: CandidateProfile, b: CandidateProfile, mode: str) -> bool:
def questionnaire_score(answers_a: list[AnswerData], answers_b: list[AnswerData], mode: str) -> float:
def demographic_score(a: CandidateProfile, b: CandidateProfile, mode: str) -> float:
def _set(xs: list[str] | None) -> set[str]:
def _friend_demographic(a: CandidateProfile, b: CandidateProfile) -> float:
def structured_diff(a: CandidateProfile, b: CandidateProfile) -> dict[str, Any]:
