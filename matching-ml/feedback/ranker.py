"""The learned ranker (algorithm.md §3.3, §9.5) — replaces fusion.py's hand weights.

It predicts the four outcome probabilities from the feature snapshot and combines them
into a RankScore (schemas.rank_score). When no trained model exists, `build_ranker`
returns None and the pipeline keeps the hand-weighted fusion score — so the system runs
before any feedback exists and upgrades itself once a model is trained.

Model artifact is a self-describing JSON (backend="logreg") or a LightGBM manifest
(backend="lightgbm"); `Ranker.load` handles both.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Optional

from .features import FEATURE_NAMES, vectorize
from .schemas import RANKER_TASKS, rank_score


def _sigmoid(z: float) -> float:
    if z < -60:
        return 0.0
    if z > 60:
        return 1.0
    return 1.0 / (1.0 + math.exp(-z))


class Ranker:
    def __init__(self, artifact: dict, boosters: Optional[dict] = None):
        self.backend = artifact.get("backend", "logreg")
        self.feature_names = artifact.get("featureNames", FEATURE_NAMES)
        self.tasks = artifact.get("tasks", {})
        self._boosters = boosters or {}
        self.version = artifact.get("version", "ranker-v1")

    # --- prediction --------------------------------------------------------- #
    def _predict_logreg(self, x: list[float], task: str) -> float:
        t = self.tasks[task]
        mean, std, w, b = t["mean"], t["std"], t["weights"], t["bias"]
        z = b
        for i, xi in enumerate(x):
            z += w[i] * ((xi - mean[i]) / (std[i] or 1.0))
        return _sigmoid(z)

    def _predict_lgb(self, x: list[float], task: str) -> float:
        return float(self._boosters[task].predict([x])[0])

    def predict(self, snapshot: dict[str, float]) -> dict[str, float]:
        x = vectorize(snapshot)
        out = {}
        for task in RANKER_TASKS:
            if task not in self.tasks:
                out[task] = 0.0
            elif self.backend == "lightgbm":
                out[task] = self._predict_lgb(x, task)
            else:
                out[task] = self._predict_logreg(x, task)
        return out

    def rank_score(self, snapshot: dict[str, float]) -> float:
        """RankScore in [0,1]; multiply by 100 for the pipeline's 0-100 scale."""
        return rank_score(self.predict(snapshot))

    # --- io ----------------------------------------------------------------- #
    @classmethod
    def load(cls, path: str | Path) -> "Ranker":
        path = Path(path)
        artifact = json.loads(path.read_text(encoding="utf-8"))
        boosters = {}
        if artifact.get("backend") == "lightgbm":
            import lightgbm as lgb  # optional; only needed for this backend
            for task, fname in artifact["tasks"].items():
                boosters[task] = lgb.Booster(model_file=str(path.parent / fname))
        return cls(artifact, boosters)


def build_ranker(model_path: str) -> Optional[Ranker]:
    """Return a Ranker if a trained model exists at model_path, else None (use hand weights)."""
    if model_path and Path(model_path).exists():
        return Ranker.load(model_path)
    return None
