"""Interface outline: implementation bodies removed."""
from __future__ import annotations
from collections import deque
from dataclasses import dataclass, field
@dataclass
class ScoredPair:
@dataclass
class MatchStats:
def greedy_one_to_one(pairs: list[ScoredPair], priority: set[str] | None = None) -> list[ScoredPair]:
def capacitated_b_match(
def _prefers(u: str, v: str, cur: str | None, dir_score: dict[tuple[str, str], float]) -> bool:
def count_blocking_pairs(
def _two_color(pairs: list[ScoredPair]) -> dict[str, int] | None:
def _pref_lists(
def _gale_shapley(
def _blocking_elimination(
def stable_one_to_one(
