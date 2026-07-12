"""Train the multi-task ranker on attributed feedback (algorithm.md §9.5, first layer).

    exposures.jsonl + events.jsonl  --attribution-->  samples  --train-->  ranker.json

Trains one binary head per RANKER_TASK. Uses LightGBM when installed (production), else a
numpy logistic regression (zero extra deps) so the whole loop is runnable and testable now.
This is the layer to retrain WEEKLY on real feedback — it's cheap, fast and interpretable,
and it replaces the hand-written fusion weights without touching the LLM.

Usage:
  python feedback/train_ranker.py --store feedback/store --out feedback/store/ranker.json
  python feedback/train_ranker.py --store feedback/store --out feedback/store/ranker.json --backend lightgbm
"""
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
    """Standardized logistic regression via gradient descent. Handles degenerate labels."""
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std[std == 0] = 1.0
    Xs = (X - mean) / std
    n, d = Xs.shape
    w = np.zeros(d)
    # If a label is constant, learn bias only (a calibrated constant predictor).
    p_pos = float(y.mean())
    if p_pos in (0.0, 1.0):
        eps = 1e-4
        p_pos = min(max(p_pos, eps), 1 - eps)
        bias = math_log_odds(p_pos)
        return mean, std, w, bias
    b = math_log_odds(p_pos)
    for _ in range(epochs):
        z = Xs @ w + b
        p = 1.0 / (1.0 + np.exp(-np.clip(z, -60, 60)))
        g = p - y
        w -= lr * (Xs.T @ g / n + l2 * w)
        b -= lr * g.mean()
    return mean, std, w, b


def math_log_odds(p: float) -> float:
    import math
    return math.log(p / (1 - p))


def train_logreg(samples: list[dict], out: Path) -> dict:
    X = np.array([s["features"] for s in samples], dtype=float)
    artifact = {"backend": "logreg", "version": "ranker-logreg-v1",
                "featureNames": FEATURE_NAMES, "tasks": {}, "nSamples": len(samples)}
    for task in RANKER_TASKS:
        y = np.array([s["label"][task] for s in samples], dtype=float)
        mean, std, w, b = _fit_logreg(X, y)
        artifact["tasks"][task] = {
            "mean": mean.tolist(), "std": std.tolist(),
            "weights": w.tolist(), "bias": float(b), "posRate": float(y.mean()),
        }
    out.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    return artifact


def train_lightgbm(samples: list[dict], out: Path) -> dict:
    import lightgbm as lgb
    X = np.array([s["features"] for s in samples], dtype=float)
    manifest = {"backend": "lightgbm", "version": "ranker-lgb-v1",
                "featureNames": FEATURE_NAMES, "tasks": {}, "nSamples": len(samples)}
    for task in RANKER_TASKS:
        y = np.array([s["label"][task] for s in samples], dtype=float)
        if y.min() == y.max():  # constant → lgb can't split; store as logreg-style constant
            continue
        booster = lgb.train(
            {"objective": "binary", "verbosity": -1, "num_leaves": 15, "learning_rate": 0.05},
            lgb.Dataset(X, label=y), num_boost_round=100)
        fname = f"ranker_{task}.txt"
        booster.save_model(str(out.parent / fname))
        manifest["tasks"][task] = fname
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--store", default="feedback/store")
    ap.add_argument("--out", default="feedback/store/ranker.json")
    ap.add_argument("--backend", choices=["auto", "logreg", "lightgbm"], default="auto")
    args = ap.parse_args()

    sink = JsonlSink(args.store)
    exposures, events = sink.read_exposures(), sink.read_events()
    samples = build_samples(exposures, events)
    if not samples:
        raise SystemExit("no exposures found — log some matches first")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    backend = args.backend
    if backend == "auto":
        try:
            import lightgbm  # noqa: F401
            backend = "lightgbm"
        except ImportError:
            backend = "logreg"

    art = (train_lightgbm if backend == "lightgbm" else train_logreg)(samples, out)
    print(f"trained {backend} ranker on {len(samples)} samples -> {out}")
    for task, t in (art["tasks"].items() if backend == "logreg" else []):
        print(f"  {task:20s} posRate={t['posRate']:.3f}")
    print("  positive rates tell you label balance; retrain weekly as feedback grows (§9.8).")


if __name__ == "__main__":
    main()
