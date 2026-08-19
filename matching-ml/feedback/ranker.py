"""Interface outline: implementation bodies removed."""
from __future__ import annotations
import json
import math
from pathlib import Path
from typing import Optional
from .features import FEATURE_NAMES, vectorize
from .schemas import RANKER_TASKS, rank_score
def _sigmoid(z: float) -> float:
class Ranker:
    def __init__(self, artifact: dict, boosters: Optional[dict] = None):
    def _predict_logreg(self, x: list[float], task: str) -> float:
    def _predict_lgb(self, x: list[float], task: str) -> float:
    def predict(self, snapshot: dict[str, float]) -> dict[str, float]:
    def rank_score(self, snapshot: dict[str, float]) -> float:
    @classmethod
    def load(cls, path: str | Path) -> "Ranker":
            import lightgbm as lgb  # optional; only needed for this backend
def build_ranker(model_path: str) -> Optional[Ranker]:
