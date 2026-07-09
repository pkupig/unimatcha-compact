"""Generate DIVERSE synthetic profiles + labeled pairs for cold start (§4.1.C).

Unlike a round-trip through the rule extractor (which would make the extractor SFT
just relearn the rules), this constructs the ground-truth UserSemanticProfile DIRECTLY
from a sampled spec, then renders a matching bio. So the extractor learns text ->
correct profile, and pair labels come from the mode-aware judge in autolabel_pairs.

Diversity built in (was the real ceiling before):
  - seriousness across the FULL 1-5 spectrum (not just 2/5)
  - socialEnergy / emotionalExpression 1-5 (drive complementarity)
  - divisive topics appear on BOTH sides — some LIKE 香菜/抽烟/宠物, others REJECT a
    partner who does -> GENUINE conflicts exist (before, 香菜 was only ever a
    dealbreaker, so no real conflict could occur)
  - schedule (熬夜/早睡), long-distance (异地) opinions

Weak-label caveat still holds (§4.1.C): the compatibility SCORE is a reasoned prior,
not truth — replace with real feedback once live.

Usage:  python data/gen_synthetic.py --n 800 --pairs 2500 --out data/out --mode romantic
Outputs: <out>/profiles.jsonl , <out>/pairs.jsonl
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline.rules import passes_hard_gate, structured_diff
from app.schemas import (
    CandidateProfile,
    Preference,
    RelationshipIntent,
    RiskFlag,
    Traits,
    UserSemanticProfile,
)
from app.pipeline.extractor import raw_profile_dict
from data.autolabel_pairs import label_pair

SCHOOLS = ["UCL", "Imperial", "KCL", "LSE", "Edinburgh", "Manchester"]
CITIES = ["London", "Manchester", "Edinburgh", "Birmingham"]
MAJORS = ["CS", "Economics", "Design", "Law", "Biology", "Business"]
GRADES = ["大二", "大三", "大四", "研一", "研二", "博一"]

# (topic, group, interest-word) hobbies map onto the `interests` list too.
HOBBIES = [("摄影", "hobby"), ("音乐", "hobby"), ("读书", "hobby"), ("旅游", "hobby"),
           ("运动", "sport"), ("健身", "sport"), ("游戏", "gaming"), ("咖啡", "food")]
PETS = [("猫", "pet"), ("狗", "pet")]

SERIOUS_BIO = {5: "奔着结婚去的", 4: "想认真长期发展", 3: "看感觉顺其自然",
               2: "先聊聊看缘分", 1: "就想随便认识玩玩"}

# --- Hard-case augmentation (fixes eval_rom_harsh findings) ---------------- #
# 1) minimal/empty profiles -> truth is EMPTY prefs + low_information, so the
#    extractor learns to ABSTAIN instead of hallucinating hobbies (S4).
MINIMAL_BIOS = ["。", "。。。", "……", "随便看看", "在吗", "hi", "hello", "不知道写啥",
                "先这样吧", "试试", "路过", "无", "占个位", "看看再说", "emmm", "?", "。 "]
# 2) joke / sarcasm -> the joked-about trait must NOT become a dealbreaker (S1).
#    Each: (joke clause rendered into the bio). The joked trait is dropped entirely.
JOKE_CLAUSES = [
    "哈哈开玩笑的，矮一点也完全没关系啦",
    "不会做饭的绕道——逗你的，其实无所谓",
    "游戏打得菜就分手，开玩笑别当真哈",
    "追星女孩慎入……骗你的，随便啦",
    "非一米八不可，假的假的，看眼缘就行",
    "没车没房别理我，玩笑玩笑，我不看这些",
    "月薪不过万勿扰，逗你玩的哈哈",
    "属狗的不聊，开个玩笑，我不信这个",
    # strong rejection VERBS wrapped in a joke — same verbs real dealbreakers use,
    # so the model must let the joke marker override 受不了/接受不了/绝对不行/拉黑.
    "我可受不了矮个子——哈哈开玩笑的，身高其实无所谓啦",
    "接受不了不会打游戏的，逗你的其实随便",
    "矮于一米七绝对不行……假的假的，我不在意这些",
    "抠门的直接拉黑，玩笑玩笑，钱这事我看得开",
    "不刷牙的我真的接受不了——开个玩笑哈，逗你玩的",
    "追不上我三公里的就拜拜，哈哈说着玩的",
]
# genuine dealbreakers that CAN co-occur with a joke, to teach the contrast.
GENUINE_DB = [
    ("异地", "distance", "不过说真的，异地我是真的接受不了"),
    ("抽烟", "smoking", "但对方抽烟是真的不行"),
    ("出轨", "loyalty", "出轨这种事我绝对零容忍"),
]


def _pref(topic, group, polarity, target, strength, flexibility, evidence):
    return Preference(topic=topic, topicGroup=group, polarity=polarity, target=target,
                      strength=strength, flexibility=flexibility, evidence=evidence)


def make_user(rng: random.Random, uid: str, mode: str):
    """Return (CandidateProfile, UserSemanticProfile-ground-truth)."""
    gender = rng.choice(["male", "female"])
    pref_gender = rng.choice(["male", "female", "any"])
    seriousness = rng.randint(1, 5)
    social = rng.randint(1, 5)
    express = rng.randint(1, 5)
    # attachment (drives the S2 anxious-vs-avoidant conflict) — grounded with a bio cue
    # so BOTH extractor (text->trait) and judge (trait->conflict) can learn it.
    attach = rng.choices(["unknown", "secure", "anxious", "avoidant", "mixed"],
                         weights=[3, 3, 2, 2, 1])[0]
    plan = rng.choices(["mixed", "structured", "flexible", "spontaneous"],
                      weights=[3, 2, 2, 2])[0]

    prefs: list[Preference] = []
    dealbreakers: list[Preference] = []
    bio_bits = [SERIOUS_BIO[seriousness]]
    interests: list[str] = []
    self_pos: set[str] = set()   # topics the user is positive about -> can't also dealbreak them

    if attach == "anxious":
        bio_bits.append(rng.choice(["很需要安全感", "希望能常联系着"]))
    elif attach == "avoidant":
        bio_bits.append(rng.choice(["需要不少个人空间", "不太喜欢黏太紧"]))
    if plan == "structured":
        bio_bits.append("喜欢提前规划")
    elif plan == "spontaneous":
        bio_bits.append("比较随性，说走就走")

    # hobbies / pets -> positive self-preferences (+ interests list)
    for topic, group in rng.sample(HOBBIES, k=rng.randint(1, 3)):
        prefs.append(_pref(topic, group, "like", "self", 3, 4, topic))
        interests.append(topic)
        self_pos.add(topic)
    if rng.random() < 0.6:
        topic, group = rng.choice(PETS)
        prefs.append(_pref(topic, group, "like", "self", 4, 4, topic))
        interests.append(topic)
        self_pos.update({topic, "宠物"})
        bio_bits.append(f"喜欢{topic}")

    # divisive self-habits (create the OTHER side of a real conflict)
    if rng.random() < 0.25:
        prefs.append(_pref("抽烟", "smoking", "like", "self", 3, 4, "抽烟"))
        self_pos.add("抽烟")
        bio_bits.append("平时会抽烟")
    if rng.random() < 0.2:
        prefs.append(_pref("香菜", "food", "like", "self", 4, 4, "香菜"))
        self_pos.add("香菜")
        bio_bits.append("无香菜不欢")
    if rng.random() < 0.5:
        t = rng.choice(["熬夜", "早睡"])
        prefs.append(_pref(t, "schedule", "like", "self", 3, 4, t))
        bio_bits.append("经常熬夜" if t == "熬夜" else "习惯早睡")

    # partner dealbreakers (the negative side) — never on a topic the user embraces
    if "抽烟" not in self_pos and rng.random() < 0.3:
        dealbreakers.append(_pref("抽烟", "smoking", "reject", "partner", 5, 1, "受不了对方抽烟"))
        bio_bits.append("受不了对方抽烟")
    if "香菜" not in self_pos and rng.random() < 0.25:
        dealbreakers.append(_pref("香菜", "food", "reject", "partner", 4, 2, "讨厌对方吃香菜"))
        bio_bits.append("我讨厌他吃香菜")
    if "宠物" not in self_pos and rng.random() < 0.15:
        dealbreakers.append(_pref("宠物", "pet", "dislike", "self", 4, 2, "不喜欢宠物"))
        bio_bits.append("不太能接受宠物")
    if rng.random() < 0.2:
        dealbreakers.append(_pref("异地", "distance", "reject", "partner", 4, 2, "不能接受异地"))
        bio_bits.append("不能接受异地")

    bio = "，".join(bio_bits)
    extra = "，".join(b for b in bio_bits[1:] if b)  # everything except the seriousness lead

    candidate = CandidateProfile(
        userId=uid, gender=gender, genderPref=pref_gender,
        age=rng.randint(19, 27), city=rng.choice(CITIES), school=rng.choice(SCHOOLS),
        major=rng.choice(MAJORS), grade=rng.choice(GRADES), interests=interests,
        bio=bio, answers=[], _prefs={"extraMatchInfo": extra},
    )
    semantic = UserSemanticProfile(
        version="profile-extractor-synth-v1",
        relationshipIntent=RelationshipIntent(
            mode=mode, seriousness=seriousness, longTermOrientation=seriousness,
            opennessToDifferentBackground=rng.randint(2, 4)),
        traits=Traits(socialEnergy=social, emotionalExpression=express,
                      attachmentSignal=attach, planningStyle=plan),
        preferences=prefs, dealbreakers=dealbreakers,
        summaryForMatching=bio[:120],
        riskFlags=[RiskFlag(type="low_information", severity=2, evidence="资料较少")]
        if len(interests) <= 1 else [],
    )
    return candidate, semantic


def make_minimal_user(rng: random.Random, uid: str, mode: str):
    """Near-empty profile. Truth = NO preferences + low_information (teach abstention)."""
    bio = rng.choice(MINIMAL_BIOS)
    candidate = CandidateProfile(
        userId=uid, gender=rng.choice(["male", "female"]),
        genderPref=rng.choice(["male", "female", "any"]),
        age=rng.randint(19, 27), city=rng.choice(CITIES), school=rng.choice(SCHOOLS),
        major=rng.choice(MAJORS), grade=rng.choice(GRADES), interests=[],
        bio=bio, answers=[], _prefs={"extraMatchInfo": ""},
    )
    semantic = UserSemanticProfile(
        version="profile-extractor-synth-v1",
        relationshipIntent=RelationshipIntent(
            mode=mode, seriousness=3, longTermOrientation=3, opennessToDifferentBackground=3),
        traits=Traits(socialEnergy=3, emotionalExpression=3),
        preferences=[], dealbreakers=[], summaryForMatching="",
        riskFlags=[RiskFlag(type="low_information", severity=3, evidence="资料过少，信息不足")],
    )
    return candidate, semantic


def make_joke_user(rng: random.Random, uid: str, mode: str):
    """Bio wraps a JOKE (must be dropped) + maybe one GENUINE dealbreaker (kept). Teach S1."""
    seriousness = rng.randint(1, 5)
    social, express = rng.randint(1, 5), rng.randint(1, 5)
    prefs: list[Preference] = []
    interests: list[str] = []
    bio_bits = [SERIOUS_BIO[seriousness]]

    for topic, group in rng.sample(HOBBIES, k=rng.randint(1, 2)):
        prefs.append(_pref(topic, group, "like", "self", 3, 4, topic))
        interests.append(topic)

    bio_bits.append(rng.choice(JOKE_CLAUSES))  # joked trait -> intentionally NOT extracted

    dealbreakers: list[Preference] = []
    if rng.random() < 0.5:  # half also carry a real boundary, to teach the contrast
        topic, group, clause = rng.choice(GENUINE_DB)
        dealbreakers.append(_pref(topic, group, "reject", "partner", 5, 1, clause))
        bio_bits.append(clause)

    bio = "，".join(bio_bits)
    extra = "，".join(bio_bits[1:])
    candidate = CandidateProfile(
        userId=uid, gender=rng.choice(["male", "female"]),
        genderPref=rng.choice(["male", "female", "any"]),
        age=rng.randint(19, 27), city=rng.choice(CITIES), school=rng.choice(SCHOOLS),
        major=rng.choice(MAJORS), grade=rng.choice(GRADES), interests=interests,
        bio=bio, answers=[], _prefs={"extraMatchInfo": extra},
    )
    semantic = UserSemanticProfile(
        version="profile-extractor-synth-v1",
        relationshipIntent=RelationshipIntent(
            mode=mode, seriousness=seriousness, longTermOrientation=seriousness,
            opennessToDifferentBackground=rng.randint(2, 4)),
        traits=Traits(socialEnergy=social, emotionalExpression=express),
        preferences=prefs, dealbreakers=dealbreakers, summaryForMatching=bio[:120],
        riskFlags=[RiskFlag(type="low_information", severity=2, evidence="资料较少")]
        if len(interests) <= 1 else [],
    )
    return candidate, semantic


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=800, help="number of profiles")
    ap.add_argument("--pairs", type=int, default=2500, help="number of labeled pairs")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(Path(__file__).parent / "out"))
    ap.add_argument("--mode", default="romantic", choices=["romantic", "friend"])
    ap.add_argument("--empty", type=int, default=0,
                    help="extra near-empty profiles (truth = no prefs + low_information)")
    ap.add_argument("--joke", type=int, default=0,
                    help="extra joke/sarcasm profiles (joked trait must NOT become a dealbreaker)")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # Normal profiles feed BOTH the extractor and the pair pool.
    pair_pool, sem = [], {}
    for i in range(args.n):
        c, s = make_user(rng, f"syn{i:04d}", args.mode)
        pair_pool.append(c)
        sem[c.userId] = s

    # Hard cases feed the EXTRACTOR ONLY (kept out of pairs so judge data is untouched).
    extra_profiles = []
    for i in range(args.empty):
        c, s = make_minimal_user(rng, f"min{i:04d}", args.mode)
        extra_profiles.append(c); sem[c.userId] = s
    for i in range(args.joke):
        c, s = make_joke_user(rng, f"jok{i:04d}", args.mode)
        extra_profiles.append(c); sem[c.userId] = s

    # Shuffle so hard cases spread across the sequential train/val/test split.
    all_profiles = pair_pool + extra_profiles
    rng.shuffle(all_profiles)

    with (out / "profiles.jsonl").open("w", encoding="utf-8") as f:
        for p in all_profiles:
            f.write(json.dumps({
                "mode": args.mode,
                "raw": raw_profile_dict(p),
                "semantic": sem[p.userId].model_dump(),
            }, ensure_ascii=False) + "\n")

    written = 0
    with (out / "pairs.jsonl").open("w", encoding="utf-8") as f:
        attempts = 0
        while written < args.pairs and attempts < args.pairs * 20:
            attempts += 1
            a, b = rng.sample(pair_pool, 2)
            if not passes_hard_gate(a, b, args.mode):
                continue
            diff = structured_diff(a, b)
            sa, sb = sem[a.userId].model_dump(), sem[b.userId].model_dump()
            f.write(json.dumps({
                "mode": args.mode,
                "userA": sa, "userB": sb,
                "structuredDiff": diff,
                "label": label_pair(args.mode, sa, sb, diff),
            }, ensure_ascii=False) + "\n")
            written += 1

    print(f"wrote {len(all_profiles)} profiles ({len(extra_profiles)} hard-case) -> {out/'profiles.jsonl'}")
    print(f"wrote {written} pairs      -> {out/'pairs.jsonl'}")
    print("NOTE: score is a reasoned prior, not truth — replace with real feedback (§4.1.C).")


if __name__ == "__main__":
    main()
