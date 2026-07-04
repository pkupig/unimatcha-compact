"""Simulate a full feedback round so the loop is runnable/testable BEFORE real users.

    build pool -> run pipeline (real featureSnapshots) -> log exposures
              -> simulate user behavior correlated with an INJECTED latent signal
              -> log events

⚠️ This is a PLUMBING test only. The simulated outcomes are a function of the model's own
features (+ noise), so a ranker trained on them just recovers the injected signal — it does
NOT prove anything about real human compatibility (README §1.2, circular distillation).
Its only jobs: exercise exposure→attribution→train→serve end-to-end, and let you eyeball
label balance. Replace with real logged feedback the moment you have users.

Usage:  python feedback/gen_synthetic_feedback.py --users 80 --seed 7
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings
from app.pipeline.orchestrator import MatchingPipeline
from app.schemas import CandidateProfile, MatchConstraints
from feedback.emit import exposures_from_result
from feedback.logging_sink import JsonlSink
from feedback.schemas import BehaviorEvent

_BASE = datetime(2026, 1, 1, 12, 0, 0)  # literal base; scripts avoid wall-clock
INTERESTS = ["猫", "狗", "摄影", "音乐", "游戏", "运动", "读书", "旅游", "咖啡", "健身"]
BIOS = ["认真恋爱", "想找认真的", "随便聊聊", "看缘分", ""]


def _ts(minutes: int) -> str:
    return (_BASE + timedelta(minutes=minutes)).isoformat()


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + np.exp(-x))


def make_pool(rng: np.random.Generator, n: int) -> list[CandidateProfile]:
    pool = []
    for i in range(n):
        g = "male" if rng.random() < 0.5 else "female"
        pool.append(CandidateProfile(
            userId=f"u{i:03d}", gender=g,
            genderPref="female" if g == "male" else "male",
            age=int(rng.integers(19, 27)), city="London", school="UCL", grade="研一",
            interests=list(rng.choice(INTERESTS, size=int(rng.integers(1, 4)), replace=False)),
            bio=str(rng.choice(BIOS)), answers=[]))
    return pool


def simulate_events(pair, snapshot, rng) -> list[BehaviorEvent]:
    """Outcomes correlated with desir_mutual (the injected signal) minus conflict penalties."""
    a, b = pair.userAId, pair.userBId
    t = snapshot.get("desir_mutual", 50.0)
    penalty = 0.25 * snapshot.get("hardConflicts", 0) + 0.1 * snapshot.get("softConflicts", 0)
    p = float(np.clip(_sigmoid((t - 60) / 8.0) - penalty, 0.02, 0.95))
    ev = []

    def add(actor, typ, minute, **meta):
        ev.append(BehaviorEvent(mode="friend", userAId=a, userBId=b, actorId=actor,
                                type=typ, at=_ts(minute), meta=meta))

    add(a, "viewed", 1); add(b, "viewed", 2)
    if rng.random() < 0.5 + 0.4 * p:
        add(a, "openedProfile", 5)
    a_msg = rng.random() < p
    b_msg = rng.random() < p
    if a_msg:
        add(a, "firstMessage", 30)
    if b_msg:
        add(b, "message", 40)
    if rng.random() < p:
        add(a, "confirmed", 60)
    if rng.random() < p * 0.9:
        add(b, "confirmed", 65)
    if rng.random() < 0.03 + 0.12 * (snapshot.get("softConflicts", 0) > 0):
        add(a, "reported", 90, reason="对方表达让我不舒服")
    if a_msg and b_msg and rng.random() < 0.10:
        add(a, "dissolved", 8 * 60, reason="不太合适")
    return ev


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--users", type=int, default=80)
    ap.add_argument("--rounds", type=int, default=3, help="reshuffle rounds to grow data")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--store", default="feedback/store")
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    sink = JsonlSink(args.store)
    pipe = MatchingPipeline(Settings(llm_backend="mock", score_threshold=45), None)

    total_exp, total_ev = 0, 0
    for r in range(args.rounds):
        pool = make_pool(rng, args.users)
        res = asyncio.run(pipe.run(pool, MatchConstraints(mode="friend", maxMatchesPerUser=4)))
        exps = exposures_from_result(res, "friend", shown_at=_ts(r * 1000), id_prefix=f"r{r}")
        # friend mode has no featureSnapshot? it does — set via metadata. Re-key to romantic
        # is unnecessary; simulate on the emitted pairs directly.
        total_exp += sink.log_exposures(exps)
        for p in res.pairs:
            for e in simulate_events(p, (p.metadata or {}).get("featureSnapshot", {}), rng):
                sink.log_event(e)
                total_ev += 1

    print(f"logged {total_exp} exposures, {total_ev} events -> {args.store}/")
    print("next: python feedback/train_ranker.py --store", args.store,
          "--out", f"{args.store}/ranker.json")


if __name__ == "__main__":
    main()
