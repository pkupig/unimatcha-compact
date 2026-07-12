"""Convert pairs.jsonl -> Pair Judge fine-tuning JSONL (algorithm.md §7.2).

Same OpenAI-style chat format and same shared prompts as the extractor builder.

Usage:  python data/build_judge_dataset.py --in data/out/pairs.jsonl \
            --out data/out/judge.sft.jsonl --split 0.8 0.1 0.1
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.llm.prompts import PAIR_JUDGE_SYSTEM, pair_judge_user_message
from data.build_extractor_dataset import write_split  # reuse split writer


def build(records: list[dict]) -> list[dict]:
    out = []
    for r in records:
        user = pair_judge_user_message(r["mode"], r["userA"], r["userB"], r["structuredDiff"])
        assistant = json.dumps(r["label"], ensure_ascii=False)
        out.append({"messages": [
            {"role": "system", "content": PAIR_JUDGE_SYSTEM},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant},
        ]})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/out/pairs.jsonl")
    ap.add_argument("--out", default="data/out/judge.sft.jsonl")
    ap.add_argument("--split", nargs=3, type=float, default=[0.8, 0.1, 0.1])
    args = ap.parse_args()

    records = [json.loads(l) for l in Path(args.inp).read_text(encoding="utf-8").splitlines() if l.strip()]
    samples = build(records)
    print(f"built {len(samples)} pair-judge samples")
    write_split(samples, Path(args.out), tuple(args.split))


if __name__ == "__main__":
    main()
