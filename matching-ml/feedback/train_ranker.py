"""Interface outline: implementation bodies removed."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import numpy as np
from .attribution import build_samples
from .features import FEATURE_NAMES
from .logging_sink import JsonlSink
from .schemas import RANKER_TASKS
def _fit_logreg(X: np.ndarray, y: np.ndarray, epochs=400, lr=0.2, l2=1e-3):
def math_log_odds(p: float) -> float:
    import math
def train_logreg(samples: list[dict], out: Path) -> dict:
def train_lightgbm(samples: list[dict], out: Path) -> dict:
    import lightgbm as lgb
def main() -> None:
            import lightgbm  # noqa: F401
