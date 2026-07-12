#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Harsh, hand-crafted adversarial eval for the fine-tuned FRIEND extractor+judge.
Mirror of eval_rom_harsh.py but with 交友-domain 考点 (friendship, not 择偶): a joked
friend-trait must not become a dealbreaker, real friend boundaries (放鸽子/借钱) must
survive, and intent gaps (交心 vs 搭子) are SOFT mismatches — never romantic-style hard
elimination. All inputs are NEW (not lifted from training labels).
Run: python eval_friend_harsh.py 2>/dev/null
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
from app.llm.prompts import (
    EXTRACTOR_SYSTEM, PAIR_JUDGE_SYSTEM,
    extractor_user_message, pair_judge_user_message,
)

BASE = "/root/.cache/modelscope/hub/models/Qwen/Qwen2___5-7B-Instruct"
# override via env to eval a specific versioned run (train_all.sh prints these):
#   EXT_LORA=train_out/friend-extractor-lora-v2 JUDGE_LORA=train_out/friend-judge-lora-v2 python eval_friend_harsh.py
EXT_LORA = os.environ.get("EXT_LORA", "train_out/friend-extractor-lora")
JUDGE_LORA = os.environ.get("JUDGE_LORA", "train_out/friend-judge-lora")

print(">> loading base…", flush=True)
tok = AutoTokenizer.from_pretrained(BASE, trust_remote_code=True)
base = AutoModelForCausalLM.from_pretrained(
    BASE, torch_dtype=torch.bfloat16, device_map="cuda", trust_remote_code=True)
base.eval()

def gen(system, user, max_new=768):
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    text = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    ids = tok(text, return_tensors="pt").to("cuda")
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=max_new, do_sample=False,
                             temperature=None, top_p=None, top_k=None,
                             pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True).strip()

def show(title, kaodian, out):
    print("\n" + "=" * 78)
    print("【CASE】", title)
    print("【考点】", kaodian)
    try:
        print("【输出】", json.dumps(json.loads(out), ensure_ascii=False, indent=1))
    except Exception:
        print("【输出(非法JSON!)】", out)

# ---------------------------------------------------------------- EXTRACTOR
print("\n\n########## PROFILE EXTRACTOR (friend) ##########", flush=True)
model = PeftModel.from_pretrained(base, EXT_LORA)
model.eval()

EXT_CASES = [
    ("玩笑 vs 真底线 混写（交友）",
     "S1: '不组队上分就删——逗你的' 是玩笑不该进 dealbreakers；'老放鸽子的真处不来' 才是硬底线",
     {"age": 21, "gender": "female", "school": "LSE", "city": "London", "interests": ["桌游"],
      "bio": "不组队上分的直接删好友——逗你的青铜也一起玩，不过说真的老放鸽子爽约的我真处不来"}),
    ("self/partner 反向 + 否定（交友）",
     "规则2: 自己是社牛=self；'但受不了对方一直不回消息'=对朋友的期待，别混成一个",
     {"age": 20, "gender": "male", "school": "KCL", "city": "London", "interests": [],
      "bio": "我自己挺社牛爱张罗，但真的受不了朋友半天不回消息的"}),
    ("兴趣近似不是冲突",
     "S3: 都爱桌游只是偏好不同 -> interest like，别抽成排斥/冲突",
     {"age": 21, "gender": "female", "school": "Edinburgh", "city": "Edinburgh", "interests": ["剧本杀"],
      "bio": "超爱剧本杀，希望能找到一起开本的朋友"}),
    ("借钱底线 + 公平",
     "真底线: '借钱不还的处不来' 是信任边界，应识别为 reject/dislike，不得因家境等背景贬低",
     {"age": 23, "gender": "male", "school": "Manchester", "city": "Manchester", "interests": ["篮球"],
      "bio": "打球的搭子最好啦，但借钱不还的真的没法深交"}),
    ("英文否定 + 强底线（交友）",
     "英文 'can't stand flaky people' 需识别成 reject 底线，flexibility 低",
     {"age": 22, "gender": "female", "school": "UCL", "city": "London", "interests": ["hiking"],
      "bio": "I honestly can't stand flaky people who always cancel last minute."}),
    ("空资料",
     "S4: 几乎无信息不得判低质量，应 low_information，不该编造 preference",
     {"age": 19, "gender": "male", "school": "Bristol", "city": "Bristol", "interests": [], "bio": "扩列"}),
]
for title, kd, prof in EXT_CASES:
    out = gen(EXTRACTOR_SYSTEM, extractor_user_message("friend", prof))
    show(title, kd, out)

# swap to judge adapter
del model
torch.cuda.empty_cache()

# ---------------------------------------------------------------- PAIR JUDGE
print("\n\n########## PAIR JUDGE (friend) ##########", flush=True)
model = PeftModel.from_pretrained(base, JUDGE_LORA)
model.eval()

def P(**kw):
    """build a minimal-but-valid semantic profile with novel values."""
    base_p = {"version": "profile-extractor-synth-v1",
              "relationshipIntent": {"mode": "friend", "seriousness": 3, "longTermOrientation": 3, "opennessToDifferentBackground": 3},
              "traits": {"socialEnergy": 3, "emotionalExpression": 3, "conflictStyle": "mixed", "planningStyle": "mixed", "attachmentSignal": "unknown"},
              "preferences": [], "dealbreakers": [], "flexibleAreas": [],
              "summaryForMatching": "", "riskFlags": []}
    base_p.update(kw)
    return base_p

def pref(topic, group, pol="like", tgt="self", s=3, f=3):
    return {"topic": topic, "topicGroup": group, "polarity": pol, "target": tgt, "strength": s, "flexibility": f, "evidence": topic}

JUDGE_CASES = [
    ("交心挚友 vs 随便扩列",
     "交友 vs 恋爱差异: 深交意图(5) vs 扩列(1) 是 SOFT 期待落差、拉低分，但绝不像恋爱那样 hard 淘汰",
     P(relationshipIntent={"mode":"friend","seriousness":5,"longTermOrientation":5,"opennessToDifferentBackground":3},
       summaryForMatching="想找能长期交心的好朋友"),
     P(relationshipIntent={"mode":"friend","seriousness":1,"longTermOrientation":1,"opennessToDifferentBackground":3},
       summaryForMatching="随便扩列加个好友"),
     {"ageDiff": 2, "sameSchool": False, "sameCity": True, "sharedInterests": []}),

    ("共同兴趣是交友核心正向",
     "交友核心: 都爱剧本杀/桌游 -> interests 高、明确正向，是交友最强信号",
     P(preferences=[pref("剧本杀","hobby",s=4)], summaryForMatching="剧本杀重度爱好者"),
     P(preferences=[pref("桌游","hobby",s=4)], summaryForMatching="每周都要开桌游"),
     {"ageDiff": 1, "sameSchool": True, "sameCity": True, "sharedInterests": ["桌游"]}),

    ("放鸽子底线 vs 常爽约",
     "真底线冲突: A 把 partner 放鸽子设为 reject flexibility=1，B self 承认常爽约 -> hardConflict/高 conflictRisk",
     P(dealbreakers=[pref("放鸽子","reliability",pol="reject",tgt="partner",s=5,f=1)], summaryForMatching="最受不了放鸽子的"),
     P(preferences=[pref("放鸽子","reliability",pol="like",tgt="self",s=4,f=4)], summaryForMatching="随性，经常临时放鸽子"),
     {"ageDiff": 3, "sameSchool": False, "sameCity": True, "sharedInterests": []}),

    ("社交能量差异（交友）",
     "社牛(5) vs 社恐(1) 做朋友: 交友里差异影响有限，可轻度互补/中性，不该判成严重冲突",
     P(traits={"socialEnergy":5,"emotionalExpression":4,"conflictStyle":"direct","planningStyle":"structured","attachmentSignal":"secure"},
       summaryForMatching="爱张罗局的社牛"),
     P(traits={"socialEnergy":1,"emotionalExpression":2,"conflictStyle":"avoidant","planningStyle":"flexible","attachmentSignal":"secure"},
       summaryForMatching="安静宅家的社恐"),
     {"ageDiff": 2, "sameSchool": True, "sameCity": True, "sharedInterests": []}),

    ("焦虑 vs 回避（交友里更轻）",
     "S2 交友版: 黏 vs 独立 在交友里只是相处节奏的软差异(severity≈2)，不应像恋爱那样重罚 emotionalNeeds",
     P(traits={"socialEnergy":3,"emotionalExpression":5,"conflictStyle":"direct","planningStyle":"mixed","attachmentSignal":"anxious"},
       summaryForMatching="希望朋友能常联系着"),
     P(traits={"socialEnergy":3,"emotionalExpression":1,"conflictStyle":"avoidant","planningStyle":"mixed","attachmentSignal":"avoidant"},
       summaryForMatching="需要不少个人空间，不喜欢黏太紧"),
     {"ageDiff": 1, "sameSchool": False, "sameCity": True, "sharedInterests": []}),

    ("跨背景但兴趣三观一致",
     "S4: 不得因国籍/背景降权；共同兴趣+合得来的相处方式应给较高分，把差异当 openness 而非扣分",
     P(relationshipIntent={"mode":"friend","seriousness":4,"longTermOrientation":4,"opennessToDifferentBackground":5},
       preferences=[pref("篮球","sport",s=4),pref("读书","hobby",s=3)], summaryForMatching="尼日利亚留学生，爱打球爱读书"),
     P(relationshipIntent={"mode":"friend","seriousness":4,"longTermOrientation":4,"opennessToDifferentBackground":5},
       preferences=[pref("篮球","sport",s=4),pref("读书","hobby",s=3)], summaryForMatching="本地生，也爱打球爱读书"),
     {"ageDiff": 2, "sameSchool": False, "sameCity": True, "sharedInterests": ["篮球","读书"]}),

    # --- GENERALIZATION: held-out topics NOT in the synthetic pool. If the model learned the
    # BINARY rule (flexibility -> severity) rather than memorizing topics, an unseen topic must
    # be judged purely by its flexibility: flex<=1 -> hardConflict(sev5), flex>=2 -> soft(sev2).
    # The flex=1 (抠门) and flex=2 (夜店) cases straddle the one boundary that matters. ---
    ("泛化·未见话题硬底线（抠门 flex=1）",
     "泛化: '抠门'不在训练话题里。A 对 partner reject flexibility=1 被 B 触发 → 必须 hardConflict(sev5)；证明学到的是 flex 规则而非话题",
     P(dealbreakers=[pref("抠门","money",pol="reject",tgt="partner",s=5,f=1)], summaryForMatching="最受不了抠门斤斤计较的"),
     P(preferences=[pref("抠门","money",pol="like",tgt="self",s=4,f=4)], summaryForMatching="花钱很省，AA算得很清"),
     {"ageDiff": 1, "sameSchool": False, "sameCity": True, "sharedInterests": []}),

    ("泛化·未见话题软冲突（夜店 flex=2）",
     "泛化: '夜店'未见。A flexibility=2（可协商，非绝对底线）→ softConflict(sev2)，绝不该 hard 淘汰；与抠门 flex=1 只差一格 flexibility 却应落在软侧，考的就是 hard/soft 边界",
     P(dealbreakers=[pref("夜店","lifestyle",pol="reject",tgt="partner",s=4,f=2)], summaryForMatching="挺介意天天泡夜店的"),
     P(preferences=[pref("夜店","lifestyle",pol="like",tgt="self",s=4,f=4)], summaryForMatching="超爱蹦迪泡吧"),
     {"ageDiff": 1, "sameSchool": True, "sameCity": True, "sharedInterests": []}),

    ("泛化·未见话题可协商（纹身 flex=3）",
     "泛化: '纹身'未见。A flexibility=3 轻度不喜欢 → softConflict(sev2)，绝不该 hard 淘汰",
     P(preferences=[pref("纹身","appearance",pol="dislike",tgt="partner",s=3,f=3)], summaryForMatching="不太喜欢对方纹身"),
     P(preferences=[pref("纹身","appearance",pol="like",tgt="self",s=4,f=4)], summaryForMatching="很喜欢纹身，纹了好几个"),
     {"ageDiff": 1, "sameSchool": True, "sameCity": True, "sharedInterests": []}),
]
for title, kd, pa, pb, diff in JUDGE_CASES:
    out = gen(PAIR_JUDGE_SYSTEM, pair_judge_user_message("friend", pa, pb, diff))
    show(title, kd, out)

print("\n\nDONE.", flush=True)
