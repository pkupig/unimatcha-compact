"""Export pairs.jsonl -> a human-readable CSV for hand annotation (algorithm.md §4.1.A / §4.4).

The synthetic `label` in pairs.jsonl is a *weak* rule label — a seed, not truth
(§4.1.C). This turns each pair into one CSV row an operator can read and correct
WITHOUT touching JSON: readable profile summaries + structured diff + the weak
label's starting values, plus 4 empty columns to fill in.

Annotator fills only 4 columns per row:
  overall_1to5      整体该不该配: 1明显不该 / 2勉强有冲突 / 3可以认识不强 / 4比较合适 / 5强匹配
  hard_conflict     真正的硬冲突(会触发底线): 填冲突话题如"关系目标;抽烟"; 没有就填 none
  positive_reasons  正向理由, 多个用 ; 分隔 (可留空)
  caution_reasons   风险/注意理由, 多个用 ; 分隔 (可留空)

Rows are keyed by `idx` (line number in the source jsonl) so merge_annotation.py
can map corrections back. Leave overall_1to5 blank to skip a row (stays weak-labeled).

Usage:  python data/export_for_annotation.py --in data/out/pairs.jsonl \
            --out data/out/annotate.csv --n 400
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

SERIOUS = {1: "随便", 2: "偏随意", 3: "中等", 4: "偏认真", 5: "很认真"}


def _prefs(sem: dict, key: str) -> str:
    """Compact 'topic(polarity,target)' list for preferences/dealbreakers."""
    items = sem.get(key) or []
    out = []
    for p in items:
        tag = p.get("polarity", "")
        tgt = p.get("target", "")
        out.append(f"{p.get('topic','')}({tag}{'/' + tgt if tgt else ''})")
    return ", ".join(out) if out else "-"


def summarize(sem: dict) -> str:
    ri = sem.get("relationshipIntent", {}) or {}
    tr = sem.get("traits", {}) or {}
    ser = ri.get("seriousness")
    parts = [
        f"认真度={ser}/5({SERIOUS.get(ser, '?')})",
        f"社交能量={tr.get('socialEnergy','?')}/5",
        f"表达={tr.get('emotionalExpression','?')}/5",
        f"喜好:[{_prefs(sem, 'preferences')}]",
        f"底线:[{_prefs(sem, 'dealbreakers')}]",
    ]
    summ = (sem.get("summaryForMatching") or "").strip()
    if summ:
        parts.append(f"bio:{summ}")
    return " | ".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="data/out/pairs.jsonl")
    ap.add_argument("--out", default="data/out/annotate.csv")
    ap.add_argument("--n", type=int, default=0, help="max rows to export (0 = all)")
    ap.add_argument("--start", type=int, default=0, help="start line offset (for batching)")
    args = ap.parse_args()

    lines = [l for l in Path(args.inp).read_text(encoding="utf-8").splitlines() if l.strip()]
    rows = []
    for idx, line in enumerate(lines):
        if idx < args.start:
            continue
        if args.n and len(rows) >= args.n:
            break
        r = json.loads(line)
        lab = r.get("label", {}) or {}
        diff = r.get("structuredDiff", {}) or {}
        hc = lab.get("hardConflicts") or []
        rows.append({
            "idx": idx,
            "mode": r.get("mode", ""),
            "A_画像": summarize(r.get("userA", {})),
            "B_画像": summarize(r.get("userB", {})),
            "结构差异": f"年龄差{diff.get('ageDiff','?')} 同校{diff.get('sameSchool')} "
                        f"同城{diff.get('sameCity')} 共同兴趣{diff.get('sharedInterests') or []}",
            "弱标注_分数": lab.get("llmScore", ""),
            "弱标注_硬冲突": "; ".join(c.get("topic", "") for c in hc) or "none",
            # ---- 人工填这 4 列 ----
            "overall_1to5": "",
            "hard_conflict": "",
            "positive_reasons": "",
            "caution_reasons": "",
        })

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8-sig", newline="") as f:  # utf-8-sig = Excel 友好
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"exported {len(rows)} rows -> {out}  (只需填后 4 列, overall 留空=跳过该行)")


if __name__ == "__main__":
    main()
