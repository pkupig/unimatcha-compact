"""Re-label pairs.jsonl with mode-aware judgment -> pairs.autolabeled.jsonl (§4.1.C).

Independent, mode-aware Pair Judge labeler used both to (re)label existing pairs and
as the label source inside gen_synthetic.py, so generation and labeling agree.

Judgments encoded (all derived from the two semantic profiles + structured diff):
  - Dealbreaker collision: one side is negative about topic X (dealbreaker or a
    reject/dislike preference) AND the other side is positive about X (like).
    Matched at topic level, and at GROUP level for pets (讨厌宠物 vs 喜欢猫).
    Romantic -> HARD (severity 5, fusion eliminates); friend -> SOFT (severity 2).
  - Long-distance (异地) dealbreaker + not same city -> romantic HARD(4) / friend SOFT.
  - Seriousness mismatch (认真度 gap>=3): romantic HARD(4) / friend SOFT.
  - Schedule clash (熬夜 vs 早睡): SOFT lifestyle conflict both modes.
  - Complementary social energy (gap 1-2) is a plus; gap>=3 is not.
Scores clamped to [5,95]; confidence 4 (limited synthetic info — a seed, not truth).

Usage:  python data/autolabel_pairs.py --in data/out/pairs.jsonl \
            --out data/out/pairs.autolabeled.jsonl --mode romantic
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

_NEG = ("reject", "dislike")
_PET_GROUP = "pet"


def _neg_items(sem: dict) -> set[tuple[str, str]]:
    """(topic, group) the user is negative about (dealbreaker or reject/dislike pref)."""
    out = set()
    for p in (sem.get("dealbreakers") or []):
        out.add((p.get("topic"), p.get("topicGroup")))
    for p in (sem.get("preferences") or []):
        if p.get("polarity") in _NEG:
            out.add((p.get("topic"), p.get("topicGroup")))
    return {(t, g) for t, g in out if t}


def _pos_items(sem: dict) -> set[tuple[str, str]]:
    return {(p.get("topic"), p.get("topicGroup")) for p in (sem.get("preferences") or [])
            if p.get("polarity") == "like" and p.get("topic")}


def _collisions(a: dict, b: dict) -> list[str]:
    """Topics where A is negative and B is positive (or vice versa)."""
    hits = set()
    for x, y in ((a, b), (b, a)):
        neg, pos = _neg_items(x), _pos_items(y)
        pos_topics = {t for t, _ in pos}
        pos_groups = {g for _, g in pos}
        for t, g in neg:
            if t in pos_topics:
                hits.add(t)
            elif g == _PET_GROUP and _PET_GROUP in pos_groups:  # 讨厌宠物 vs 喜欢猫/狗
                hits.add(t)
    return sorted(hits)


def _has_neg_topic(sem: dict, topic: str) -> bool:
    return any(t == topic for t, _ in _neg_items(sem))


def _schedule_clash(a: dict, b: dict) -> bool:
    def sched(sem):
        return {p.get("topic") for p in (sem.get("preferences") or [])
                if p.get("topicGroup") == "schedule" and p.get("polarity") == "like"}
    sa, sb = sched(a), sched(b)
    return ("熬夜" in sa and "早睡" in sb) or ("早睡" in sa and "熬夜" in sb)


def label_pair(mode: str, a: dict, b: dict, diff: dict) -> dict:
    clamp = lambda x: max(5.0, min(95.0, float(x)))
    romantic = mode == "romantic"
    serA = a.get("relationshipIntent", {}).get("seriousness") or 3
    serB = b.get("relationshipIntent", {}).get("seriousness") or 3
    ser_gap = abs(serA - serB)
    shared = diff.get("sharedInterests") or []
    socA = a.get("traits", {}).get("socialEnergy") or 3
    socB = b.get("traits", {}).get("socialEnergy") or 3
    soc_gap = abs(socA - socB)
    exprA = a.get("traits", {}).get("emotionalExpression") or 3
    exprB = b.get("traits", {}).get("emotionalExpression") or 3
    expr_gap = abs(exprA - exprB)
    attA = a.get("traits", {}).get("attachmentSignal") or "unknown"
    attB = b.get("traits", {}).get("attachmentSignal") or "unknown"
    # S2: 焦虑 vs 回避 不是互补，是冲突（一方要安全感，一方要空间，互相拉扯）。
    attach_clash = {attA, attB} == {"anxious", "avoidant"}
    planA = a.get("traits", {}).get("planningStyle") or "mixed"
    planB = b.get("traits", {}).get("planningStyle") or "mixed"
    plan_complement = {planA, planB} in ({"structured", "flexible"}, {"structured", "spontaneous"})
    hard, soft, pos, caution = [], [], [], []

    # --- dealbreaker collisions ---
    for t in _collisions(a, b):
        if romantic:
            hard.append({"topic": t, "severity": 5,
                         "reason": f"一方将「{t}」列为底线，另一方明确喜欢，触发一票否决"})
            caution.append(f"{t}：一方底线 vs 一方喜欢")
        else:
            soft.append({"topic": t, "severity": 2,
                         "reason": f"「{t}」偏好相反，交友影响有限"})
            caution.append(f"{t}偏好相反")

    # --- long distance ---
    if (_has_neg_topic(a, "异地") or _has_neg_topic(b, "异地")) and diff.get("sameCity") is False:
        if romantic:
            hard.append({"topic": "异地", "severity": 4,
                         "reason": "一方不接受异地，且两人不同城"})
            caution.append("不接受异地且不同城")
        else:
            soft.append({"topic": "异地", "severity": 2, "reason": "不同城，线下见面较少"})

    # --- seriousness / relationship intent ---
    if ser_gap >= 3:
        if romantic:
            hard.append({"topic": "关系目标", "severity": 4,
                         "reason": "一方想认真长期，一方偏随意，恋爱目标差距大"})
            caution.append("关系目标不一致（认真 vs 随意）")
        else:
            soft.append({"topic": "相处期待", "severity": 2, "reason": "对关系投入度不同，交友可接受"})
    elif ser_gap <= 1:
        if serA >= 4 and serB >= 4:
            pos.append("都想认真长期" if romantic else "都很投入这段关系")
        elif serA <= 2 and serB <= 2:
            pos.append("都想轻松认识，节奏一致")

    # --- schedule ---
    if _schedule_clash(a, b):
        soft.append({"topic": "作息", "severity": 2, "reason": "一方熬夜一方早睡，作息不同步"})
        caution.append("作息差异（熬夜 vs 早睡）")

    # --- attachment style (S2: anxious vs avoidant is a CONFLICT, not complementary) ---
    if attach_clash:
        if romantic:
            soft.append({"topic": "依恋风格", "severity": 3,
                         "reason": "一方焦虑型很需要安全感，一方回避型需要空间，情感需求易互相拉扯"})
            caution.append("依恋风格冲突（焦虑 vs 回避）")
        else:
            soft.append({"topic": "相处节奏", "severity": 2,
                         "reason": "一方偏黏、一方偏独立，交友影响有限"})

    # --- complementarity: graded across social energy / expression / planning ---
    # (adequate difference = complement; anxious-avoidant is explicitly NOT credited)
    comp = 55.0
    comp_axes: list[str] = []
    if 1 <= soc_gap <= 2:
        comp += 20; comp_axes.append("社交能量")
    elif soc_gap == 3:
        comp += 10; comp_axes.append("社交能量")
    elif soc_gap >= 4:
        comp -= 5
    if 2 <= expr_gap <= 3:
        comp += 8; comp_axes.append("表达欲（健谈×倾听）")
    if plan_complement:
        comp += 8; comp_axes.append("计划性（规划×随性）")
    if attach_clash:
        comp = min(comp, 45.0); comp_axes = []  # not complementary
    comp = max(30.0, min(90.0, comp))

    # --- positives ---
    if shared:
        pos.append("共同兴趣：" + "、".join(shared[:3]))
    if diff.get("sameSchool"):
        pos.append("同校")
    if diff.get("sameCity"):
        pos.append("同城")
    if comp_axes and comp >= 65:
        pos.append("性格互补（" + "、".join(comp_axes) + "）")

    # --- score ---
    score = 52.0
    score += (4 - ser_gap) * (4 if romantic else 2)
    if ser_gap <= 1 and serA >= 4 and serB >= 4:
        score += 6
    score += min(len(shared) * (8 if not romantic else 6), 24 if not romantic else 18)
    score += (5 if diff.get("sameSchool") else 0) + (5 if diff.get("sameCity") else 0)
    score -= min(diff.get("ageDiff", 0), 5) * 2
    score += (comp - 55) * 0.2   # graded complementarity nudges the score both ways
    score -= 4 * len(soft)
    if any(h["severity"] >= 5 for h in hard):
        score = min(score, 15)
    elif any(h["severity"] >= 4 for h in hard):
        score = min(score, 38)

    # --- dimensions ---
    align = lambda gap, per: max(10, 100 - gap * per)
    interest_dim = min(30 + len(shared) * 20, 95) if shared else 30
    n_hard = len(hard)
    # emotionalNeeds: secure×secure meshes; anxious×avoidant clashes.
    if attach_clash:
        emo_needs = 30
    elif attA == "secure" and attB == "secure":
        emo_needs = 75
    else:
        emo_needs = 55
    dims = {
        "values": align(ser_gap, 18) if romantic else 65,
        "lifestyle": 70 - 20 * _schedule_clash(a, b) - 10 * sum(
            1 for t in _collisions(a, b) if t in ("抽烟", "喝酒")),
        "communication": max(45, 70 - expr_gap * 5),
        "emotionalNeeds": emo_needs,
        "interests": interest_dim,
        "longTermPlan": align(ser_gap, 18),
        "complementarity": comp,
        "conflictRisk": min(90, 20 + 25 * n_hard + 10 * len(soft)),
    }

    return {
        "llmScore": round(clamp(score), 1),
        "confidence": 4,
        "dimensions": {k: round(float(v), 1) for k, v in dims.items()},
        "hardConflicts": hard,
        "softConflicts": soft,
        "positiveReasons": pos or ["资料匹配度一般，可先认识"],
        "cautionReasons": caution,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mode", choices=["romantic", "friend"], required=True)
    args = ap.parse_args()

    recs = [json.loads(l) for l in Path(args.inp).read_text(encoding="utf-8").splitlines() if l.strip()]
    for r in recs:
        r["label"] = label_pair(args.mode, r["userA"], r["userB"], r.get("structuredDiff", {}))
    Path(args.out).write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in recs) + "\n", encoding="utf-8")
    print(f"re-labeled {len(recs)} {args.mode} pairs -> {args.out}")


if __name__ == "__main__":
    main()
