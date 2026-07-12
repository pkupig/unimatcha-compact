"""End-to-end pipeline tests (mock backend, no ollama needed).

Run:  python -m pytest tests/ -q      or      python tests/test_pipeline.py
Covers the two cases from dialogue.txt plus the full match job shape.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings
from app.pipeline.extractor import RuleBasedExtractor
from app.pipeline.orchestrator import MatchingPipeline
from app.pipeline.pair_judge import RuleBasedJudge
from app.pipeline.rules import structured_diff
from app.schemas import AnswerData, CandidateProfile, MatchConstraints


def _scale(qid: str, order: int, val: int, group: str) -> AnswerData:
    return AnswerData(questionId=qid, questionType="SCALE", value=val,
                      questionOrder=order, questionGroup=group)


def _cand(uid, gender, pref, age, bio="", interests=None, extra="", enhanced=False):
    return CandidateProfile(
        userId=uid, gender=gender, genderPref=pref, age=age, city="London",
        school="UCL", grade="研一", interests=interests or [], bio=bio,
        answers=[_scale(f"q{order}", order, (age % 5) + 1, "价值观") for order in (11, 12, 13)],
        _prefs={"extraMatchInfo": extra}, enhanced=enhanced,
    )


def test_cilantro_hard_conflict():
    ext, judge = RuleBasedExtractor(), RuleBasedJudge()
    a = _cand("a", "female", "male", 22, bio="希望认真恋爱", extra="我讨厌他吃香菜")
    b = _cand("b", "male", "female", 23, bio="我超爱吃香菜，无辣不欢")
    pa = ext.extract(a, "romantic")
    pb = ext.extract(b, "romantic")
    assert any(p.polarity == "reject" and p.target == "partner" and p.topicGroup == "food"
               for p in pa.dealbreakers + pa.preferences), "should extract partner-cilantro reject"
    pc = judge.judge(pa, pb, structured_diff(a, b))
    assert any(c.topicGroup if hasattr(c, "topicGroup") else True for c in pc.hardConflicts)
    assert pc.hardConflicts, "cilantro reject vs love must produce a hard conflict"
    print("✓ cilantro -> hardConflicts:", [(c.topic, c.severity) for c in pc.hardConflicts])


def test_cat_vs_dog_not_conflict():
    ext, judge = RuleBasedExtractor(), RuleBasedJudge()
    a = _cand("a", "female", "male", 22, interests=["猫", "摄影"])
    b = _cand("b", "male", "female", 22, interests=["狗", "摄影"])
    pc = judge.judge(ext.extract(a, "romantic"), ext.extract(b, "romantic"),
                     structured_diff(a, b))
    assert not pc.hardConflicts, "cat vs dog must NOT be a hard conflict"
    assert pc.positiveReasons, "cat vs dog + shared 摄影 should yield positives"
    print("✓ cat/dog -> positives:", pc.positiveReasons, "| llmScore:", pc.llmScore)


def test_full_job_shape():
    settings = Settings(llm_backend="mock", score_threshold=40)
    pipe = MatchingPipeline(settings, client=None)
    cands = [
        _cand("u1", "female", "male", 22, bio="认真恋爱", interests=["猫", "摄影"]),
        _cand("u2", "male", "female", 23, bio="想找认真的", interests=["猫", "摄影"]),
        _cand("u3", "male", "female", 24, extra="我讨厌他吃香菜", interests=["狗"]),
        _cand("u4", "female", "male", 21, bio="超爱香菜", interests=["香菜"]),
    ]
    res = asyncio.run(pipe.run(cands, MatchConstraints(mode="romantic", maxMatchesPerUser=1)))
    print("✓ job:", res.modelVersion, "pairs=", len(res.pairs),
          "unmatched=", res.unmatched, f"{res.processingTimeMs}ms")
    for p in res.pairs:
        print("   ", p.userAId, "×", p.userBId, "=", p.score, p.metadata["reasons"])
    ids = {c.userId for c in cands}
    for p in res.pairs:
        assert p.userAId in ids and p.userBId in ids
    # every user appears at most once (romantic one-to-one)
    seen = [u for p in res.pairs for u in (p.userAId, p.userBId)]
    assert len(seen) == len(set(seen))


def test_stable_beats_greedy_on_blocking_pairs():
    """Classic instability instance: greedy leaves a blocking pair, Gale-Shapley doesn't."""
    from app.pipeline.global_match import (
        ScoredPair, count_blocking_pairs, greedy_one_to_one, stable_one_to_one)

    # Bipartite: men {m1,m2} x women {w1,w2}. Edges are all feasible pairs.
    pairs = [ScoredPair("m1", "w1", 90), ScoredPair("m1", "w2", 40),
             ScoredPair("m2", "w1", 50), ScoredPair("m2", "w2", 30)]
    # Directional prefs: both men want w1 most; w1 prefers m2 over m1; w2 prefers m1.
    dir_score = {
        ("m1", "w1"): 95, ("m1", "w2"): 40,
        ("m2", "w1"): 80, ("m2", "w2"): 30,
        ("w1", "m1"): 40, ("w1", "m2"): 90,   # w1 prefers m2
        ("w2", "m1"): 70, ("w2", "m2"): 20,   # w2 prefers m1
    }
    greedy = greedy_one_to_one(pairs)
    greedy_match = {x: y for p in greedy for x, y in ((p.a, p.b), (p.b, p.a))}
    greedy_blocking = count_blocking_pairs(greedy_match, pairs, dir_score)

    chosen, stats = stable_one_to_one(pairs, dir_score)
    print(f"✓ greedy blocking={greedy_blocking} ({stats.method}) stable blocking={stats.blocking_pairs}")
    assert greedy_blocking >= 1, "greedy should leave a blocking pair here"
    assert stats.blocking_pairs == 0, "Gale-Shapley must be stable (0 blocking pairs)"
    assert stats.method == "gale-shapley"


def test_feedback_ranker_learns_signal(tmp_path=None):
    """Full feedback loop on a temp store: attributed samples -> trained ranker -> recovers
    the injected signal. Plumbing test only (README §1.2)."""
    import random
    import tempfile
    from pathlib import Path as _P
    from feedback.features import FEATURE_NAMES, vectorize
    from feedback.train_ranker import train_logreg
    from feedback.ranker import Ranker

    rng = random.Random(0)
    def snap(desir):
        s = {n: 0.0 for n in FEATURE_NAMES}
        s.update({"desir_mutual": desir, "fusedScore": desir, "llmScore": desir})
        return s
    def sig(x):
        import math
        return 1 / (1 + math.exp(-x))
    samples = []
    for _ in range(300):
        desir = rng.uniform(30, 90)
        p = sig((desir - 60) / 8)
        lab = {"mutualConfirmed": int(rng.random() < p),
               "mutualConversation": int(rng.random() < p),
               "survived7d": int(rng.random() < p * 0.8),
               "reportedOrBlocked": int(rng.random() < 0.03)}
        samples.append({"features": vectorize(snap(desir)), "label": lab})

    out = _P(tmp_path or tempfile.mkdtemp()) / "ranker.json"
    train_logreg(samples, out)
    r = Ranker.load(out)
    hi, lo = r.rank_score(snap(85)), r.rank_score(snap(40))
    print(f"✓ feedback loop: ranker recovered signal  hi(85)={hi:.3f} > lo(40)={lo:.3f}")
    assert hi > lo, "ranker must learn that higher desirability -> higher rank score"


def test_dealbreaker_guardrail_overrides_soft_llm():
    """H1 dealbreakers are CODE-enforced: a flex<=1 partner-reject collision must become a
    hardConflict + capped score even when the (fine-tuned) model wrongly returns it as soft.
    This is the guarantee that lets us stop retraining the judge to learn flex<=1->hard."""
    from app.pipeline.pair_judge import _enforce_dealbreakers, _dealbreaker_collisions
    from app.schemas import (UserSemanticProfile, Preference, PairCompatibility,
                             PairDimensions, Conflict)

    def _prof(prefs, deals):
        return UserSemanticProfile(
            relationshipIntent={"mode": "friend", "seriousness": 3,
                                "longTermOrientation": 3, "opennessToDifferentBackground": 3},
            preferences=prefs, dealbreakers=deals)
    def _p(topic, pol, tgt, f):
        return Preference(topic=topic, topicGroup="reliability", polarity=pol,
                          target=tgt, strength=6 - f, flexibility=f)

    a = _prof([], [_p("放鸽子", "reject", "partner", 1)])
    b = _prof([_p("放鸽子", "like", "self", 4)], [])
    assert _dealbreaker_collisions(a, b) == ["放鸽子"]

    # model wrongly downgrades the absolute boundary to a soft conflict (the observed v4 failure)
    soft_llm = PairCompatibility(
        llmScore=68.0, confidence=4, dimensions=PairDimensions(conflictRisk=40.0),
        hardConflicts=[], softConflicts=[Conflict(topic="放鸽子", severity=3, reason="soft")],
        positiveReasons=[], cautionReasons=[])
    fixed = _enforce_dealbreakers(soft_llm, a, b)
    assert [(c.topic, c.severity) for c in fixed.hardConflicts] == [("放鸽子", 5)]
    assert fixed.llmScore <= 15.0
    assert fixed.dimensions.conflictRisk >= 90.0
    # idempotent, and flex=2 must NOT be force-promoted
    assert len(_enforce_dealbreakers(fixed, a, b).hardConflicts) == 1
    a2 = _prof([], [_p("夜店", "reject", "partner", 2)])
    b2 = _prof([_p("夜店", "like", "self", 4)], [])
    assert _dealbreaker_collisions(a2, b2) == []
    print("✓ dealbreaker guardrail: flex<=1 forced hard, score capped; flex=2 left soft")


if __name__ == "__main__":
    test_cilantro_hard_conflict()
    test_cat_vs_dog_not_conflict()
    test_full_job_shape()
    test_stable_beats_greedy_on_blocking_pairs()
    test_feedback_ranker_learns_signal()
    test_dealbreaker_guardrail_overrides_soft_llm()
    print("\nAll smoke tests passed.")
