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


# ── 问卷 v2：过滤题硬门 / complement / 题内权重 / hard 自由题升格 ─────────

def _v2ans(code, qtype, value, semantics="similar", hardness="soft",
           group=None, weight=None):
    return AnswerData(questionId=code, questionType=qtype, value=value,
                      questionGroup=group, questionCode=code,
                      semantics=semantics, hardness=hardness, weight=weight)


def test_v2_filter_gate_distance_and_smoking():
    from app.pipeline.rules import passes_hard_gate
    base = dict(gender="female", pref="male", age=22)
    a = _cand("a", "female", "male", 22)
    b = _cand("b", "male", "female", 23)
    # 同城（都 London）：必须同城不拦
    a.answers.append(_v2ans("db_distance", "SINGLE_CHOICE", "must_same_city", semantics="filter", hardness="hard"))
    assert passes_hard_gate(a, b, "romantic")
    # 异地：必须同城 → 拦
    b.city = "Manchester"
    assert not passes_hard_gate(a, b, "romantic")
    # 对方城市未知：不拦（宁可放过）
    b.city = ""
    assert passes_hard_gate(a, b, "romantic")
    # 吸烟：绝对不能接受 vs 经常吸 → 拦；vs 不吸 → 放行
    b.city = "London"
    a.answers.append(_v2ans("life_smoking", "SINGLE_CHOICE", "never", semantics="filter", hardness="hard"))
    b.answers.append(_v2ans("life_smoking_self", "SINGLE_CHOICE", "regularly", semantics="filter"))
    assert not passes_hard_gate(a, b, "romantic")
    b.answers[-1] = _v2ans("life_smoking_self", "SINGLE_CHOICE", "no", semantics="filter")
    assert passes_hard_gate(a, b, "romantic")
    print("✓ v2 filter gate: distance + smoking")


def test_v2_scoring_semantics():
    from app.pipeline.rules import questionnaire_score, COMPLEMENT_TABLE
    # complement：一动一静（1 vs 5 差 4）得 0.3；适度差 2 得 1.0；similar 同题差 4 得 0
    comp_far = [_v2ans("soc_energy", "SCALE", 1, semantics="complement", group="社交风格")]
    comp_far_b = [_v2ans("soc_energy", "SCALE", 5, semantics="complement", group="社交风格")]
    sim_far = [_v2ans("x", "SCALE", 1, group="社交风格")]
    sim_far_b = [_v2ans("x", "SCALE", 5, group="社交风格")]
    s_comp = questionnaire_score(comp_far, comp_far_b, "friend")
    s_sim = questionnaire_score(sim_far, sim_far_b, "friend")
    assert abs(s_comp - COMPLEMENT_TABLE[4] * 70) < 1e-6
    assert s_sim == 0.0
    comp_mid_b = [_v2ans("soc_energy", "SCALE", 3, semantics="complement", group="社交风格")]
    assert abs(questionnaire_score(comp_far, comp_mid_b, "friend") - 70.0) < 1e-6
    # filter 题不计分：只有 filter 题时回退 0.5*70 的无数据基线
    f = [_v2ans("db_distance", "SINGLE_CHOICE", "any", semantics="filter", hardness="hard")]
    assert questionnaire_score(f, f, "friend") == 0.5 * 70
    # 题内权重：同组一题满分(w=1.5)一题零分(w=1) → 加权 0.6，高于等权 0.5
    wa = [_v2ans("q1", "SCALE", 5, group="价值观", weight=1.5), _v2ans("q2", "SCALE", 1, group="价值观")]
    wb = [_v2ans("q1", "SCALE", 5, group="价值观", weight=1.5), _v2ans("q2", "SCALE", 5, group="价值观")]
    got = questionnaire_score(wa, wb, "friend")
    assert abs(got - (1.5 / 2.5) * 70) < 1e-6
    print("✓ v2 scoring: complement table, filter skip, per-item weight")


def test_v2_hard_freeform_becomes_absolute_dealbreaker():
    ext = RuleBasedExtractor()
    a = _cand("a", "female", "male", 22)
    # db_other（hard TEXT）：写「不能接受吸烟」→ 必须升格为 flexibility=1 的绝对底线
    a.answers.append(AnswerData(questionId="db_other", questionType="TEXT",
                                value="不能接受吸烟", questionCode="db_other",
                                semantics="freeform", hardness="hard"))
    pa = ext.extract(a, "romantic")
    hard = [p for p in pa.dealbreakers if p.topicGroup == "smoking"]
    assert hard and hard[0].flexibility == 1 and hard[0].polarity == "reject"
    # 同样的话写在普通 extraMatchInfo 里只是 flex=2（不升格）——两者必须有区别
    b = _cand("b", "female", "male", 22, extra="不能接受吸烟")
    pb = RuleBasedExtractor().extract(b, "romantic")
    soft = [p for p in pb.dealbreakers if p.topicGroup == "smoking"]
    assert soft and soft[0].flexibility == 2
    # 裸名词回答（「还有什么完全无法接受？」→「吸烟」）：语境自带否定，
    # 词典给 neutral 也必须升格为绝对底线；「爱抽烟的」同理不能被记成正向偏好
    c = _cand("c", "female", "male", 22)
    c.answers.append(AnswerData(questionId="db_other", questionType="TEXT",
                                value="吸烟", questionCode="db_other",
                                semantics="freeform", hardness="hard"))
    pcx = RuleBasedExtractor().extract(c, "romantic")
    bare = [p for p in pcx.dealbreakers if p.topicGroup == "smoking"]
    assert bare and bare[0].flexibility == 1 and bare[0].polarity == "reject", "bare noun must escalate"
    d = _cand("d", "female", "male", 22)
    d.answers.append(AnswerData(questionId="db_other", questionType="TEXT",
                                value="爱抽烟的", questionCode="db_other",
                                semantics="freeform", hardness="hard"))
    pdx = RuleBasedExtractor().extract(d, "romantic")
    lovers = [p for p in pdx.preferences if p.topicGroup == "smoking" and p.polarity == "like"]
    assert not lovers, "hard text must never yield a positive preference"
    assert any(p.topicGroup == "smoking" and p.flexibility == 1 for p in pdx.dealbreakers)
    print("✓ v2 hard freeform -> flexibility=1 absolute dealbreaker (incl. bare nouns)")


if __name__ == "__main__":
    test_cilantro_hard_conflict()
    test_cat_vs_dog_not_conflict()
    test_full_job_shape()
    test_stable_beats_greedy_on_blocking_pairs()
    test_feedback_ranker_learns_signal()
    test_dealbreaker_guardrail_overrides_soft_llm()
    test_v2_filter_gate_distance_and_smoking()
    test_v2_scoring_semantics()
    test_v2_hard_freeform_becomes_absolute_dealbreaker()
    print("\nAll smoke tests passed.")
