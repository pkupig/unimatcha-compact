"""Interface outline: implementation bodies removed."""
from __future__ import annotations
from typing import Any
from ..config import Settings
from ..llm.client import LLMError, OllamaClient
from ..llm.prompts import PAIR_JUDGE_SYSTEM, pair_judge_user_message
from ..schemas import (
def _by_group(prefs: list[Preference]) -> dict[str, list[Preference]]:
def _dealbreaker_collisions(
def _enforce_dealbreakers(
def _clamp(x: float, lo: float, hi: float) -> float:
class RuleBasedJudge:
    def judge(
        def scan_conflicts(x_all: list[Preference], y_all: list[Preference]) -> None:
class LlmJudge:
    def __init__(self, client: OllamaClient, model: str, fallback: RuleBasedJudge):
    async def judge(self, a: UserSemanticProfile, b: UserSemanticProfile,
def build_judge(settings: Settings, client: OllamaClient | None):
