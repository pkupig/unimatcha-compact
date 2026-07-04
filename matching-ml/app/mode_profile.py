"""ModeProfile — one algorithm, one config object per business (交友 / 恋爱).

The matching pipeline is a SINGLE code path. Everything that legitimately differs between
friend and romantic matching lives HERE, not scattered as `if mode == 'friend'` across
rules.py / fusion.py / orchestrator.py. Adding a third business later = add one profile.

What is shared (the algorithm): hard gate → semantic profiles → recall → pair judge →
fusion → global match → feedback loop, plus the constitution, prompts and schemas.

What differs (this file):
  - hard constraints          (romantic requires a mutually-satisfied gender preference)
  - questionnaire groups/weights (the two frontends ask different questions)
  - fusion weights            (what matters for a partner ≠ for a friend)
  - matching topology         (romantic = exclusive 1:1; friend = many friends)
  - economics                 (energy cost per match / refund differ)
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ModeProfile:
    mode: str

    # --- hard constraints (enforced in rules.passes_hard_gate) ---------------
    # romantic: both sides' gender preference must be mutually satisfied.
    # friend:   only enforce preferredGender if the user actually set one.
    gender_pref_required: bool = False

    # --- questionnaire (rules.questionnaire_score) ---------------------------
    category_weights: dict[str, float] = field(default_factory=dict)

    # --- fusion (fusion.fuse); keys are the breakdown component names --------
    fusion_weights: dict[str, float] = field(default_factory=dict)

    # --- global matching topology (orchestrator) ----------------------------
    exclusive: bool = True        # True = one match max (romantic); False = many (friend)
    default_capacity: int = 1     # friend: base number of friends per round

    # --- economics (empty-pool refund / cost accounting) --------------------
    match_cost: float = 1.0       # energy spent per match in this mode
    empty_pool_refund: float = 1.0

    # --- quality gate override (None = use global SCORE_THRESHOLD) ----------
    score_threshold: float | None = None


ROMANTIC = ModeProfile(
    mode="romantic",
    gender_pref_required=True,
    category_weights={"生活习惯": 0.15, "价值观": 0.20, "恋爱观": 0.25, "沟通": 0.20, "财务观": 0.20},
    fusion_weights={"llm": 0.35, "questionnaire": 0.25, "profile": 0.15,
                    "semantic": 0.15, "complementarity": 0.10},
    exclusive=True,
    default_capacity=1,
    match_cost=3.0,        # ENERGY_COST_ROMANTIC
    empty_pool_refund=3.0,
)

FRIEND = ModeProfile(
    mode="friend",
    gender_pref_required=False,
    category_weights={"社交风格": 0.15, "兴趣活动": 0.25, "人格节奏": 0.20, "价值观": 0.20, "生活规划": 0.20},
    fusion_weights={"llm": 0.30, "interestActivity": 0.25, "questionnaire": 0.20,
                    "semantic": 0.15, "campusSchedule": 0.10},
    exclusive=False,
    default_capacity=5,
    match_cost=1.0,
    empty_pool_refund=1.0,
)

_PROFILES = {"romantic": ROMANTIC, "friend": FRIEND}


def get_profile(mode: str) -> ModeProfile:
    return _PROFILES.get(mode, ROMANTIC)
