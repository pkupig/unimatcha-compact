"""Convert profiles.jsonl -> Profile Extractor fine-tuning JSONL (algorithm.md §7.1).

Emits OpenAI-style `{"messages": [system, user, assistant]}` records — the format
LLaMA-Factory / unsloth / axolotl all accept for Qwen2.5 and Llama SFT. The system &
user messages are built from the SAME prompts the online service uses (app/llm/prompts.py),
so training and serving never drift.

Usage:  python data/build_extractor_dataset.py --in data/out/profiles.jsonl \
            --out data/out/extractor.sft.jsonl --split 0.8 0.1 0.1
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.llm.prompts import EXTRACTOR_SYSTEM, extractor_user_message


def build(records: list[dict]) -> list[dict]:
    out = []
    for r in records:
        user = extractor_user_message(r["mode"], r["raw"])
        assistant = json.dumps(r["semantic"], ensure_ascii=False)
        out.append({"messages": [
            {"role": "system", "content": EXTRACTOR_SYSTEM},
            {"role": "user", "content": user},
            {"role": "assistant", "content": assistant},
        ]})
    return out


def write_split(samples: list[dict], out: Path, split: tuple[float, float, float]) -> None:
    n = len(samples)
    n_tr = int(n * split[0])
    n_va = int(n * split[1])
    parts = {"train": samples[:n_tr], "val": samples[n_tr:n_tr + n_va], "test": samples[n_tr + n_va:]}
    for name, rows in parts.items():
        p = out.with_suffix(f".{name}.jsonl")
        with p.open("w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"  {name}: {len(rows)} -> {p}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/out/profiles.jsonl")
    ap.add_argument("--out", default="data/out/extractor.sft.jsonl")
    ap.add_argument("--split", nargs=3, type=float, default=[0.8, 0.1, 0.1])
    args = ap.parse_args()

    records = [json.loads(l) for l in Path(args.inp).read_text(encoding="utf-8").splitlines() if l.strip()]
    samples = build(records)
    print(f"built {len(samples)} extractor samples")
    write_split(samples, Path(args.out), tuple(args.split))


if __name__ == "__main__":
    main()
