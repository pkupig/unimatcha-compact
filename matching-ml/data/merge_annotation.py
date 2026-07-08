"""Merge a hand-annotated CSV back into pairs.jsonl -> pairs.corrected.jsonl (§4.1.C).

Reads the CSV produced by export_for_annotation.py after an operator filled in
overall_1to5 / hard_conflict / positive_reasons / caution_reasons, and overwrites
the weak `label` of the matching pairs (keyed by `idx`). Rows with an empty
overall_1to5 are left weak-labeled (skipped).

What each human column overwrites in the PairCompatibility label:
  overall_1to5     -> llmScore (1->10 2->30 3->55 4->75 5->90) + confidence=5 (人标可信)
  hard_conflict    -> hardConflicts (each topic, severity 4). 'none'/空 -> 清空硬冲突
  positive_reasons -> positiveReasons  (; 分隔; 空则保留弱标注)
  caution_reasons  -> cautionReasons   (; 分隔; 空则保留弱标注)
Weak `dimensions` are kept as-is (cold start doesn't need per-dimension labels).

Then re-run build_judge_dataset.py on the corrected file to get judge.sft.*.jsonl.

Usage:  python data/merge_annotation.py --pairs data/out/pairs.jsonl \
            --csv data/out/annotate.csv --out data/out/pairs.corrected.jsonl
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

SCORE_MAP = {1: 10.0, 2: 30.0, 3: 55.0, 4: 75.0, 5: 90.0}


def _split(cell: str) -> list[str]:
    return [x.strip() for x in (cell or "").replace("，", ";").replace(",", ";").split(";") if x.strip()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", default="data/out/pairs.jsonl")
    ap.add_argument("--csv", default="data/out/annotate.csv")
    ap.add_argument("--out", default="data/out/pairs.corrected.jsonl")
    args = ap.parse_args()

    lines = [l for l in Path(args.pairs).read_text(encoding="utf-8").splitlines() if l.strip()]
    records = [json.loads(l) for l in lines]

    corrections: dict[int, dict] = {}
    with Path(args.csv).open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            ov = (row.get("overall_1to5") or "").strip()
            if not ov:
                continue  # 未标 -> 跳过, 保留弱标注
            corrections[int(row["idx"])] = row

    applied = 0
    for idx, row in corrections.items():
        if idx >= len(records):
            print(f"WARN: idx {idx} 超出 pairs 范围, 跳过")
            continue
        lab = records[idx].setdefault("label", {})
        ov = int(float(row["overall_1to5"]))
        lab["llmScore"] = SCORE_MAP.get(ov, 55.0)
        lab["confidence"] = 5

        hc = (row.get("hard_conflict") or "").strip()
        if hc and hc.lower() != "none":
            lab["hardConflicts"] = [{"topic": t, "severity": 4,
                                     "reason": f"人工标注硬冲突: {t}"} for t in _split(hc)]
        elif hc.lower() == "none" or hc == "":
            lab["hardConflicts"] = []

        pos = _split(row.get("positive_reasons", ""))
        if pos:
            lab["positiveReasons"] = pos
        cau = _split(row.get("caution_reasons", ""))
        if cau:
            lab["cautionReasons"] = cau
        applied += 1

    Path(args.out).write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in records) + "\n", encoding="utf-8")
    print(f"applied {applied} human corrections over {len(records)} pairs -> {args.out}")
    print(f"next: python data/build_judge_dataset.py --in {args.out} --out data/out/judge.sft.jsonl")


if __name__ == "__main__":
    main()
