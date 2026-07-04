"""Validate the questionnaire spec and print a per-mode coverage summary.

Checks the invariants that keep the two frontends' questionnaires in sync with the ONE
matching pipeline: each mode's scored groups must match that mode's ModeProfile
category_weights (app/mode_profile.py), and every matching layer must be represented.

Usage:  python questionnaire/validate.py
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.mode_profile import get_profile  # noqa: E402

SPEC = Path(__file__).parent / "uspark_questionnaire.json"
VALID_SEM = {"filter", "similar", "complement", "freeform"}
VALID_HARD = {"hard", "soft"}
MODES = ["romantic", "friend"]


def _sections_for(spec: dict, mode: str) -> list[dict]:
    return [s for s in spec["sections"] if s.get("mode") in (mode, "both")]


def main() -> int:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    errors: list[str] = []
    ids: set[str] = set()

    # global item invariants
    for sec in spec["sections"]:
        for it in sec["items"]:
            if it["id"] in ids:
                errors.append(f"duplicate item id: {it['id']}")
            ids.add(it["id"])
            if it["matchSemantics"] not in VALID_SEM:
                errors.append(f"{it['id']}: bad matchSemantics {it['matchSemantics']!r}")
            if it["hardness"] not in VALID_HARD:
                errors.append(f"{it['id']}: bad hardness {it['hardness']!r}")
            if it["hardness"] == "hard" and it["matchSemantics"] == "similar":
                errors.append(f"{it['id']}: hard item cannot be 'similar' (would gate on a scale)")

    # per-mode invariants
    print(f"spec {spec['version']}:")
    for mode in MODES:
        secs = _sections_for(spec, mode)
        groups = {s["group"] for s in secs if s.get("group")}
        known = set(get_profile(mode).category_weights)
        sem = Counter(it["matchSemantics"] for s in secs for it in s["items"])
        n = sum(len(s["items"]) for s in secs)
        print(f"  [{mode}] {len(secs)} sections, {n} items, groups={sorted(groups)}  matchSemantics={dict(sem)}")
        for g in groups:
            if g not in known:
                errors.append(f"[{mode}] group '{g}' not in ModeProfile.category_weights {sorted(known)}")
        missing = known - groups
        if missing:
            errors.append(f"[{mode}] ModeProfile has weighted groups with no questions: {sorted(missing)}")
        for want in VALID_SEM:
            if sem[want] == 0:
                errors.append(f"[{mode}] no items with matchSemantics={want}")

    if errors:
        print("\nFAILED:")
        for e in errors:
            print("  -", e)
        return 1
    print("\nOK — both modes: questionnaire groups match their ModeProfile, all layers represented.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
