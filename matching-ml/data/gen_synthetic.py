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

# --- generalization pool: DEcorrelate topic <-> severity ------------------- #
# The judge's hard/medium/soft call must come from flexibility (§constitution H1 &
# prompts.PAIR_JUDGE_SYSTEM: reject+flex<=1 triggered -> hardConflict), NOT from the
# topic. If每个话题的 flexibility 写死，模型就记住"话题->severity"抄近路。So we draw a
# WIDE topic set and randomize flexibility per instance: the SAME topic shows up hard
# (flex1) in one profile and soft (flex3) in another, leaving flexibility as the only
# consistent severity signal. Extractor phrasing is tiered to match (see REJECT_PHRASING),
# so text->flexibility (extractor) then flexibility->severity (judge) both generalize.
#
# COLLIDABLE = topics a user can BOTH set as a partner boundary AND self-own, so pairs
# actually collide. (topic, group, self-embrace bio clause, reject-target noun).
COLLIDABLE = [
    ("抽烟",   "smoking",       "平时会抽烟",           "抽烟"),
    ("喝酒",   "drinking",      "挺爱喝酒的",           "酗酒"),
    ("放鸽子", "reliability",   "比较随性偶尔放鸽子",   "老放鸽子爽约"),
    ("迟到",   "reliability",   "没什么时间观念常迟到", "总是迟到"),
    ("熬夜",   "schedule",      "习惯熬夜",             "天天熬夜作息乱"),
    ("香菜",   "food",          "无香菜不欢",           "吃香菜"),
    ("大手大脚","money",         "花钱大手大脚",         "乱花钱不攒钱"),
    ("不回消息","communication", "回消息比较慢",         "半天不回消息"),
    ("查手机", "boundary",      "没安全感会想看对方手机","查我手机翻隐私"),
    ("控制欲", "boundary",      "占有欲比较强",         "控制欲太强"),
    ("邋遢",   "hygiene",       "生活比较随意不太整洁", "邋遢不讲卫生"),
    ("游戏",   "gaming",        "重度游戏爱好者",       "沉迷游戏"),
    ("追星",   "hobby",         "重度追星",             "过度追星"),
    ("工作狂", "lifestyle",     "是个工作狂",           "只顾工作没时间"),
    ("借钱不还","trust",         "花钱大手大脚常跟朋友周转","借钱不还"),
]
# BOUNDARY_ONLY = grave boundaries nobody self-endorses positively — they never collide,
# but they widen the range of topics the EXTRACTOR must handle at varying flexibility.
BOUNDARY_ONLY = [
    ("撒谎",     "trust",         "撒谎骗人"),
    ("劈腿",     "loyalty",       "劈腿脚踏两条船"),
    ("背后说人", "values",        "背后编排朋友"),
    ("歧视",     "values",        "地域或性别歧视"),
    ("冷暴力",   "communication", "冷暴力"),
    ("情绪勒索", "boundary",      "情绪勒索"),
    ("没礼貌",   "values",        "对服务员没礼貌"),
    ("赌博",     "lifestyle",     "赌博"),
    ("啃老",     "values",        "啃老不上进"),
]
# Reject phrasing tiered by flexibility -> teaches the extractor phrasing->flexibility.
# {x} is filled with the reject-target noun. flex1 = 绝对底线, flex2 = 较强介意, flex3 = 轻度不喜欢.
REJECT_PHRASING = {
    1: ["绝对不能接受对方{x}", "最受不了{x}的，直接拉黑", "{x}是我的死穴零容忍", "碰到{x}的立刻拜拜"],
    2: ["挺介意对方{x}的", "很难接受{x}", "{x}的话基本处不来", "不太能忍对方{x}"],
    3: ["不太喜欢对方{x}", "对方{x}会扣点分", "有点介意{x}", "{x}的话看情况吧"],
}

# --- intent/seriousness bio ladder (mode-aware) --------------------------- #
# romantic: relationship seriousness; friend: how much you invest in the friendship.
SERIOUS_BIO = {5: "奔着结婚去的", 4: "想认真长期发展", 3: "看感觉顺其自然",
               2: "先聊聊看缘分", 1: "就想随便认识玩玩"}
FRIEND_INTENT_BIO = {5: "想找能长期交心的好朋友", 4: "想认识志同道合、一起成长的伙伴",
                     3: "随缘交朋友，处得来最重要", 2: "找个一起玩的搭子就行",
                     1: "随便扩列加个好友"}

# --- Hard-case augmentation (fixes eval_*_harsh findings) ------------------ #
# 1) minimal/empty profiles -> truth is EMPTY prefs + low_information, so the
#    extractor learns to ABSTAIN instead of hallucinating hobbies (S4). Mode-agnostic.
MINIMAL_BIOS = ["。", "。。。", "……", "随便看看", "在吗", "hi", "hello", "不知道写啥",
                "先这样吧", "试试", "路过", "无", "占个位", "看看再说", "emmm", "?", "。 "]
# 2) joke / sarcasm -> the joked-about trait must NOT become a dealbreaker (S1).
#    Each: (joke clause rendered into the bio). The joked trait is dropped entirely.
#    Romantic jokes lean on 择偶 tropes (身高/月薪/车房); friend jokes lean on 交友 tropes.
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
FRIEND_JOKE_CLAUSES = [
    "不组队上分的直接删好友——逗你的，青铜也一起玩啦",
    "社恐勿扰……骗你的，慢热也完全没问题",
    "不请我喝奶茶就绝交，哈哈说着玩的",
    "i人别加我，假的假的，i人e人都欢迎",
    "只找同校的，开玩笑啦，哪个学校都能处",
    "不追同一部剧的不聊，逗你玩的哈哈",
    # rejection VERBS wrapped in a joke (friend domain) — joke marker must override.
    "受不了半天不回消息的——哈哈开玩笑，随缘啦",
    "不爱运动的直接拉黑，逗你玩的，宅家也行",
    "话少的我真的接受不了……假的假的，安静的朋友也很好",
    "不熬夜的绝对处不来，开玩笑哈，早睡星人也欢迎",
]
# genuine dealbreakers that CAN co-occur with a joke, to teach the contrast.
GENUINE_DB = [
    ("异地", "distance", "不过说真的，异地我是真的接受不了"),
    ("抽烟", "smoking", "但对方抽烟是真的不行"),
    ("出轨", "loyalty", "出轨这种事我绝对零容忍"),
]
FRIEND_GENUINE_DB = [
    ("借钱不还", "trust", "但借钱不还的我真处不来"),
    ("放鸽子", "reliability", "老放鸽子爽约的是真的受不了"),
    ("背后说人", "values", "背后编排朋友的没法深交"),
]


def _mode_content(mode: str):
    """(intent_bio_ladder, joke_clauses, genuine_dealbreakers) for the given mode."""
    if mode == "friend":
        return FRIEND_INTENT_BIO, FRIEND_JOKE_CLAUSES, FRIEND_GENUINE_DB
    return SERIOUS_BIO, JOKE_CLAUSES, GENUINE_DB


def _pref(topic, group, polarity, target, strength, flexibility, evidence):
    return Preference(topic=topic, topicGroup=group, polarity=polarity, target=target,
                      strength=strength, flexibility=flexibility, evidence=evidence)


def _make_boundary(rng, topic, group, reject_noun):
    """Sample a partner boundary at a RANDOM flexibility tier with intensity-matched phrasing.
    flex1/2 -> a reject dealbreaker; flex3 -> a mild dislike preference. Randomizing flex per
    instance is what DEcorrelates topic from severity, forcing the model to key off flexibility.
    Returns (Preference, bio_clause, is_dealbreaker)."""
    flex = rng.choices([1, 2, 3], weights=[4, 3, 3])[0]
    clause = rng.choice(REJECT_PHRASING[flex]).format(x=reject_noun)
    polarity = "reject" if flex <= 2 else "dislike"
    pref = _pref(topic, group, polarity, "partner", 6 - flex, flex, clause)  # flex1->s5 … flex3->s3
    return pref, clause, flex <= 2


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

    intent_bio, _, _ = _mode_content(mode)
    prefs: list[Preference] = []
    dealbreakers: list[Preference] = []
    bio_bits = [intent_bio[seriousness]]
    interests: list[str] = []
    self_pos: set[str] = set()   # topics the user is positive about -> can't also dealbreak them

    if attach == "anxious":
        bio_bits.append(rng.choice(
            ["希望朋友能常联系着", "喜欢时常一起约"] if mode == "friend"
            else ["很需要安全感", "希望能常联系着"]))
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

    # self-owned collidable habits (the EMBRACE side — the other half of a potential conflict).
    # Drawn from the wide COLLIDABLE pool so the "positive" side spans many topics too.
    for topic, group, embrace, _rej in rng.sample(COLLIDABLE, k=rng.randint(0, 3)):
        if topic in self_pos:
            continue
        prefs.append(_pref(topic, group, "like", "self", rng.randint(3, 4), 4, embrace))
        self_pos.add(topic)
        bio_bits.append(embrace)

    # partner boundaries drawn from the WIDE pool at RANDOM flexibility (via _make_boundary):
    # the same topic appears hard (flex1) in some profiles and soft (flex3) in others, so the
    # judge cannot shortcut on topic and must learn flexibility -> hard/medium/soft. target is
    # always partner (a requirement ABOUT the other person), so the extractor won't collapse it
    # onto self. Never boundary a topic the user just embraced.
    cand = ([(t, g, rej) for t, g, _e, rej in COLLIDABLE if t not in self_pos]
            + [(t, g, rej) for t, g, rej in BOUNDARY_ONLY])
    for topic, group, rej in rng.sample(cand, k=min(len(cand), rng.randint(0, 3))):
        pref, clause, is_db = _make_boundary(rng, topic, group, rej)
        (dealbreakers if is_db else prefs).append(pref)
        bio_bits.append(clause)

    # 异地 keeps its dedicated long-distance path (labeler cross-checks sameCity).
    if rng.random() < 0.2:
        dealbreakers.append(_pref("异地", "distance", "reject", "partner", 4, 2, "不能接受异地"))
        bio_bits.append("不能接受异地")
    # 宠物 keeps its special GROUP-level collision path (讨厌宠物 vs 喜欢猫/狗).
    if "宠物" not in self_pos and rng.random() < 0.12:
        dealbreakers.append(_pref("宠物", "pet", "dislike", "self", 4, 2, "不太能接受宠物"))
        bio_bits.append("不太能接受宠物")

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
    intent_bio, jokes, genuine_db = _mode_content(mode)
    prefs: list[Preference] = []
    interests: list[str] = []
    bio_bits = [intent_bio[seriousness]]

    for topic, group in rng.sample(HOBBIES, k=rng.randint(1, 2)):
        prefs.append(_pref(topic, group, "like", "self", 3, 4, topic))
        interests.append(topic)

    bio_bits.append(rng.choice(jokes))  # joked trait -> intentionally NOT extracted

    dealbreakers: list[Preference] = []
    if rng.random() < 0.5:  # half also carry a real boundary, to teach the contrast
        topic, group, clause = rng.choice(genuine_db)
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
