"""End-to-end matching pipeline (algorithm.md §6, §10.2).

    hard gate → semantic profiles → recall → pair judge → fusion → global match → MatchResult

Runs identically whether the extractor/judge are rule-based (mock) or the fine-tuned
LLM — only `build_extractor` / `build_judge` differ. The returned MatchResult is
byte-compatible with the NestJS MatchModelProvider contract.
"""
from __future__ import annotations

import inspect
import time
from typing import Any

from ..config import Settings
from ..constitution import CONSTITUTION_VERSION
from ..llm.client import OllamaClient
from ..mode_profile import get_profile
from ..schemas import (
    CandidateProfile,
    EmptyPoolRefund,
    MatchConstraints,
    MatchPair,
    MatchResult,
    UserSemanticProfile,
)
from feedback import features
from . import fusion, pairscore, recall, rules
from .extractor import build_extractor
from .global_match import (
    MatchStats,
    ScoredPair,
    capacitated_b_match,
    count_blocking_pairs,
    greedy_one_to_one,
    stable_one_to_one,
)
from .pair_judge import build_judge

async def _maybe_await(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


class MatchingPipeline:
    def __init__(self, settings: Settings, client: OllamaClient | None):
        self.settings = settings
        self.extractor = build_extractor(settings, client)
        self.judge = build_judge(settings, client)
        # Optional learned ranker; None -> hand-weighted fusion (§9.5).
        from feedback.ranker import build_ranker
        self.ranker = build_ranker(settings.ranker_model_path)

    async def run(
        self, candidates: list[CandidateProfile], constraints: MatchConstraints
    ) -> MatchResult:
        start = time.monotonic()
        mode = constraints.mode
        profile = get_profile(mode)  # one algorithm, mode-specific config (交友/恋爱)
        threshold = profile.score_threshold if profile.score_threshold is not None else self.settings.score_threshold
        by_id = {c.userId: c for c in candidates}

        # 1) semantic profiles (cached per user for the whole job)
        profiles: dict[str, UserSemanticProfile] = {}
        for c in candidates:
            profiles[c.userId] = await _maybe_await(self.extractor.extract(c, mode))

        # 2) recall cheap top-K pairs
        recalled = recall.recall_pairs(
            candidates, mode, self.settings.recall_top_k, self.settings.judge_min_prefilter
        )

        # 3+4) judge + fuse each recalled pair
        members = {c.userId for c in candidates if c.enhanced}  # guaranteed users (§H5)
        # Fairness (anti-Matthew-effect): long-waiting users also get matching priority.
        wait_gate = self.settings.fairness_wait_rounds
        priority_users = members | {
            c.userId for c in candidates if (c.waitingRounds or 0) >= wait_gate
        }
        scored: list[ScoredPair] = []
        dir_score: dict[tuple[str, str], float] = {}  # (u,v) -> how much u wants v
        meta_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
        involved: set[str] = set()  # users with at least one FEASIBLE pair
        for a, b, _pref in recalled:
            diff = rules.structured_diff(a, b)
            pc = await _maybe_await(self.judge.judge(profiles[a.userId], profiles[b.userId], diff))
            fr = fusion.fuse(a, b, pc, mode)
            # H1: a hard conflict is infeasible — even members never get it.
            if fr.eliminated:
                continue
            # Directional desirability -> symmetric harmonic mutual score (README §1.5).
            d_ab, d_ba = pairscore.directional(profiles[a.userId], profiles[b.userId], fr.final_score)
            mutual = pairscore.harmonic_mutual(d_ab, d_ba)
            # Frozen feature snapshot: logged for training AND fed to the ranker (no skew).
            snapshot = features.build_snapshot(
                pc=pc, fr=fr, diff=diff, d_ab=d_ab, d_ba=d_ba, mutual=mutual,
                wait_rounds=max(a.waitingRounds or 0, b.waitingRounds or 0),
                exposure_count=max(a.exposureCount or 0, b.exposureCount or 0))
            # Soft score: learned ranker if trained (§9.5), else hand-weighted fusion.
            soft_score = self.ranker.rank_score(snapshot) * 100 if self.ranker else fr.final_score
            # The pair is FEASIBLE. Below the quality threshold it is normally dropped,
            # BUT for a member (H5) we keep their top-feasible option rather than refund.
            #
            # Feasibility gate is ALWAYS on the fusion score: SCORE_THRESHOLD (τ=60, config.py)
            # is calibrated for the fusion 0..100 distribution. The ranker output is a blend of
            # rare-event probabilities on a compressed scale (ceiling ~95, typically ~10–35), so
            # comparing it to the same τ would drop virtually every non-member pair and collapse
            # the pool. The ranker still decides RANKING order among the gated-in pairs (§9.5).
            gate_score = fr.final_score
            below = gate_score < threshold
            is_member = a.userId in members or b.userId in members
            if below and not is_member:
                continue
            pair_score = round(soft_score, 1) if self.ranker else mutual
            dir_score[(a.userId, b.userId)] = d_ab
            dir_score[(b.userId, a.userId)] = d_ba
            scored.append(ScoredPair(a.userId, b.userId, pair_score))
            involved.add(a.userId)
            involved.add(b.userId)
            meta_by_pair[(a.userId, b.userId)] = {
                "algorithm": f"hybrid-llm-{mode}-v1",
                "scoreSource": "ranker" if self.ranker else "fusion",
                "featureSnapshot": snapshot,      # frozen — log this for training (§9.4)
                "constitutionVersion": CONSTITUTION_VERSION,
                "belowThreshold": below,          # member guaranteed match kept below τ
                "guaranteedForMember": below and is_member,
                "desirability": {"aToB": d_ab, "bToA": d_ba, "mutual": mutual},
                "modelVersions": {
                    "profileExtractor": getattr(self.extractor, "version", "n/a"),
                    "pairJudge": getattr(self.judge, "version", "n/a"),
                },
                "scoreBreakdown": fr.breakdown,
                "reasons": fr.reasons,
                "risks": fr.risks,
                "llmScore": pc.llmScore,
                "confidence": pc.confidence,
            }

        # 5) global matching — topology decided by the ModeProfile (exclusive vs multi)
        stats: MatchStats | None = None
        if profile.exclusive:
            if self.settings.matching_objective == "stable":
                chosen, stats = stable_one_to_one(scored, dir_score, priority=priority_users)
            else:
                chosen = greedy_one_to_one(scored, priority=priority_users)
                stats = MatchStats(
                    method="greedy",
                    blocking_pairs=count_blocking_pairs(
                        {x: y for p in chosen for x, y in ((p.a, p.b), (p.b, p.a))},
                        scored, dir_score),
                    total_score=round(sum(p.score for p in chosen), 1),
                    matched_users=len(chosen) * 2,
                )
        else:
            cap: dict[str, int] = {}
            for c in candidates:
                base = max(1, constraints.maxMatchesPerUser or profile.default_capacity)
                cap[c.userId] = min(profile.default_capacity, c.enhancedCost or base) if c.enhanced else base
            chosen = capacitated_b_match(scored, cap, priority=priority_users)

        # 6) assemble result
        matched: set[str] = set()
        pairs: list[MatchPair] = []
        for sp in chosen:
            a, b = by_id[sp.a], by_id[sp.b]
            is_enh = a.userId in members or b.userId in members
            # Stable matcher may return endpoints in either order; meta was keyed as recalled.
            meta = meta_by_pair.get((sp.a, sp.b)) or meta_by_pair[(sp.b, sp.a)]
            meta["enhanced"] = is_enh
            pairs.append(MatchPair(
                userAId=sp.a, userBId=sp.b, score=sp.score,
                enhanced=is_enh,
                enhancedCost=(a.enhancedCost or b.enhancedCost) if is_enh else None,
                metadata=meta,
            ))
            matched.add(sp.a)
            matched.add(sp.b)

        # enhanced users with no viable candidate at all → refund (§2 empty pool)
        empty_pool = [
            EmptyPoolRefund(
                userId=c.userId, mode=mode,
                cost=c.enhancedCost or profile.empty_pool_refund,
            )
            for c in candidates
            if c.enhanced and c.userId not in matched and c.userId not in involved
        ]

        unmatched = [c.userId for c in candidates if c.userId not in matched]
        elapsed = int((time.monotonic() - start) * 1000)
        return MatchResult(
            pairs=pairs,
            unmatched=unmatched,
            emptyPoolUserIds=empty_pool,
            modelVersion=f"hybrid-llm-{mode}-v1({self.settings.llm_backend})",
            processingTimeMs=elapsed,
            matchStats=vars(stats) if stats else None,
        )
