"""Generate synthetic candidate profiles + weak-labeled pairs for cold start (§4.1.C).

Covers the scenario matrix the design asks for: different schools/cities/grades,
varying seriousness & social energy, schedule/pet/smoking/distance opinions, explicit
dealbreakers, and a mix of high-similar / high-complement / high-conflict / borderline
pairs.

Weak labels come from the rule-based extractor & judge (lexicon.py). These are a
*starting point* — the design (§4.1.C) is explicit that synthetic weak labels must be
sampled and hand-corrected before they train the real model. build_*_dataset.py turns
this output into fine-tuning JSONL.

Usage:  python data/gen_synthetic.py --n 400 --pairs 1200 --out data/out
Outputs: data/out/profiles.jsonl , data/out/pairs.jsonl
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline.extractor import RuleBasedExtractor, raw_profile_dict
from app.pipeline.pair_judge import RuleBasedJudge
from app.pipeline.rules import passes_hard_gate, structured_diff
from app.schemas import CandidateProfile

SCHOOLS = ["UCL", "Imperial", "KCL", "LSE", "Edinburgh", "Manchester"]
CITIES = ["London", "Manchester", "Edinburgh", "Birmingham"]
MAJORS = ["CS", "Economics", "Design", "Law", "Biology", "Business"]
GRADES = ["大二", "大三", "大四", "研一", "研二", "博一"]
INTERESTS = ["猫", "狗", "摄影", "音乐", "游戏", "运动", "读书", "旅游", "咖啡", "健身"]

# (bio fragment, is_serious) building blocks
SERIOUS_BIOS = ["希望认真恋爱", "想找个能长期稳定走下去的人", "奔着结婚去的"]
CASUAL_BIOS = ["先聊聊看缘分", "想随便认识新朋友", "不着急，慢慢来"]
OPINION_FRAGMENTS = [
    "我讨厌他吃香菜", "受不了对方抽烟", "喜欢猫", "超爱狗", "无辣不欢",
    "我不能接受异地", "喜欢摄影和旅行", "习惯早睡", "经常熬夜打游戏", "喜欢健身",
]


def make_profile(rng: random.Random, uid: str) -> CandidateProfile:
    gender = rng.choice(["male", "female"])
    pref = rng.choice(["male", "female", "any"])
    serious = rng.random() < 0.55
    bio = rng.choice(SERIOUS_BIOS if serious else CASUAL_BIOS)
    extra_bits = rng.sample(OPINION_FRAGMENTS, k=rng.randint(0, 2))
    return CandidateProfile(
        userId=uid,
        gender=gender,
        genderPref=pref,
        age=rng.randint(19, 27),
        city=rng.choice(CITIES),
        school=rng.choice(SCHOOLS),
        major=rng.choice(MAJORS),
        grade=rng.choice(GRADES),
        interests=rng.sample(INTERESTS, k=rng.randint(1, 4)),
        bio=bio + ("，" + "，".join(extra_bits) if extra_bits else ""),
        answers=[],
        _prefs={"extraMatchInfo": "，".join(extra_bits)},
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=400, help="number of profiles")
    ap.add_argument("--pairs", type=int, default=1200, help="number of labeled pairs")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(Path(__file__).parent / "out"))
    ap.add_argument("--mode", default="romantic", choices=["romantic", "friend"])
    args = ap.parse_args()

    rng = random.Random(args.seed)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    ext, judge = RuleBasedExtractor(), RuleBasedJudge()
    profiles = [make_profile(rng, f"syn{i:04d}") for i in range(args.n)]
    sem = {p.userId: ext.extract(p, args.mode) for p in profiles}

    with (out / "profiles.jsonl").open("w", encoding="utf-8") as f:
        for p in profiles:
            f.write(json.dumps({
                "mode": args.mode,
                "raw": raw_profile_dict(p),
                "semantic": sem[p.userId].model_dump(),
            }, ensure_ascii=False) + "\n")

    written = 0
    with (out / "pairs.jsonl").open("w", encoding="utf-8") as f:
        attempts = 0
        while written < args.pairs and attempts < args.pairs * 20:
            attempts += 1
            a, b = rng.sample(profiles, 2)
            if not passes_hard_gate(a, b, args.mode):
                continue
            diff = structured_diff(a, b)
            pc = judge.judge(sem[a.userId], sem[b.userId], diff)
            f.write(json.dumps({
                "mode": args.mode,
                "userA": sem[a.userId].model_dump(),
                "userB": sem[b.userId].model_dump(),
                "structuredDiff": diff,
                "label": pc.model_dump(),
            }, ensure_ascii=False) + "\n")
            written += 1

    print(f"wrote {len(profiles)} profiles -> {out/'profiles.jsonl'}")
    print(f"wrote {written} pairs      -> {out/'pairs.jsonl'}")
    print("NOTE: weak labels — sample & hand-correct before training (algorithm.md §4.1.C).")


if __name__ == "__main__":
    main()
