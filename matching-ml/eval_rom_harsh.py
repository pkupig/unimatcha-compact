#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Harsh, hand-crafted adversarial eval for the fine-tuned ROMANTIC extractor+judge.
All inputs are NEW (not lifted from training labels). Each case states what a correct
answer should do (the "考点"), then prints the model output so we can eyeball pass/fail.
Run: python eval_rom_harsh.py 2>/dev/null
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
EXT_LORA = "train_out/rom-extractor-lora"
JUDGE_LORA = "train_out/rom-judge-lora"

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
print("\n\n########## PROFILE EXTRACTOR (romantic) ##########", flush=True)
model = PeftModel.from_pretrained(base, EXT_LORA)
model.eval()

EXT_CASES = [
    ("玩笑 vs 底线 混写",
     "S1: '开玩笑说不能忍受' 是玩笑不该进 dealbreakers；'真的绝对没法接受异地' 才是硬底线",
     {"age": 22, "gender": "female", "school": "LSE", "city": "London", "interests": ["露营"],
      "bio": "哈哈开玩笑啦我可受不了矮个子，不过说真的，异地我是绝对绝对没办法接受的"}),
    ("self/partner 反向 + 否定",
     "S1/规则2: 自己抽烟=self like；'受不了对方也抽'=partner reject/dislike，别混成一个",
     {"age": 20, "gender": "male", "school": "KCL", "city": "London", "interests": [],
      "bio": "我自己偶尔抽烟，但真的受不了对象也是个烟鬼"}),
    ("近义不是冲突 + 宠物",
     "S3: 养狗、希望对方爱宠物 -> pet like，别抽成排斥/冲突",
     {"age": 21, "gender": "female", "school": "Edinburgh", "city": "Edinburgh", "interests": ["养狗"],
      "bio": "家里有只金毛，希望对方也是爱毛孩子的人就好"}),
    ("宗教/公平 + 低信息",
     "S4: '穆斯林不吃猪肉' 是饮食约束，不得因宗教贬低降权；且资料极短应加 low_information 而非低分",
     {"age": 23, "gender": "male", "school": "Manchester", "city": "Manchester", "interests": [],
      "bio": "穆斯林，不吃猪肉。"}),
    ("英文否定 + 强底线",
     "英文 'hate ... deal breaker' 需识别成 reject 底线，flexibility 低",
     {"age": 22, "gender": "female", "school": "UCL", "city": "London", "interests": ["yoga"],
      "bio": "I honestly can't stand cheating — that's a hard deal breaker for me."}),
    ("空资料",
     "S4: 几乎无信息不得判低质量，应 low_information，不该编造 preference",
     {"age": 19, "gender": "male", "school": "Bristol", "city": "Bristol", "interests": [], "bio": "。"}),
]
for title, kd, prof in EXT_CASES:
    out = gen(EXTRACTOR_SYSTEM, extractor_user_message("romantic", prof))
    show(title, kd, out)

# swap to judge adapter
del model
torch.cuda.empty_cache()

# ---------------------------------------------------------------- PAIR JUDGE
print("\n\n########## PAIR JUDGE (romantic) ##########", flush=True)
model = PeftModel.from_pretrained(base, JUDGE_LORA)
model.eval()

def P(**kw):
    """build a minimal-but-valid semantic profile with novel values."""
    base_p = {"version": "profile-extractor-synth-v1",
              "relationshipIntent": {"mode": "romantic", "seriousness": 3, "longTermOrientation": 3, "opennessToDifferentBackground": 3},
              "traits": {"socialEnergy": 3, "emotionalExpression": 3, "conflictStyle": "mixed", "planningStyle": "mixed", "attachmentSignal": "unknown"},
              "preferences": [], "dealbreakers": [], "flexibleAreas": [],
              "summaryForMatching": "", "riskFlags": []}
    base_p.update(kw)
    return base_p

def pref(topic, group, pol="like", tgt="self", s=3, f=3):
    return {"topic": topic, "topicGroup": group, "polarity": pol, "target": tgt, "strength": s, "flexibility": f, "evidence": topic}

JUDGE_CASES = [
    ("认真长期 vs 只想玩玩",
     "S2: seriousness 5 vs 1 是价值冲突不是互补 -> 应识别为 hard/软冲突、低 longTermPlan，别当互补加分",
     P(relationshipIntent={"mode":"romantic","seriousness":5,"longTermOrientation":5,"opennessToDifferentBackground":3},
       summaryForMatching="想找能结婚的认真对象"),
     P(relationshipIntent={"mode":"romantic","seriousness":1,"longTermOrientation":1,"opennessToDifferentBackground":3},
       summaryForMatching="随便玩玩不想负责"),
     {"ageDiff": 2, "sameSchool": False, "sameCity": True, "sharedInterests": []}),

    ("猫党 vs 狗党",
     "S3: 都爱宠物只是猫/狗不同 -> 中等正向，绝不能判成冲突",
     P(preferences=[pref("猫","pet",s=4)], summaryForMatching="超爱猫"),
     P(preferences=[pref("狗","pet",s=4)], summaryForMatching="狗狗控"),
     {"ageDiff": 1, "sameSchool": True, "sameCity": True, "sharedInterests": []}),

    ("一方对伴侣硬拒抽烟 vs 另一方是烟民",
     "规则2: A 对 partner reject 抽烟 flexibility=1，B self 强 like 抽烟 -> hardConflict severity≈5",
     P(dealbreakers=[pref("抽烟","smoking",pol="reject",tgt="partner",s=5,f=1)], summaryForMatching="绝对不能接受抽烟的对象"),
     P(preferences=[pref("抽烟","smoking",pol="like",tgt="self",s=5,f=4)], summaryForMatching="老烟枪一枚"),
     {"ageDiff": 3, "sameSchool": False, "sameCity": True, "sharedInterests": []}),

    ("社交能量互补",
     "S2: 组织者(socialEnergy5) vs 参与者(1) 是良性互补 -> complementarity 加分，不是冲突",
     P(traits={"socialEnergy":5,"emotionalExpression":4,"conflictStyle":"direct","planningStyle":"structured","attachmentSignal":"secure"},
       summaryForMatching="喜欢张罗聚会的社牛"),
     P(traits={"socialEnergy":1,"emotionalExpression":2,"conflictStyle":"avoidant","planningStyle":"flexible","attachmentSignal":"secure"},
       summaryForMatching="安静的倾听者"),
     {"ageDiff": 2, "sameSchool": True, "sameCity": True, "sharedInterests": []}),

    ("焦虑依恋 vs 回避依恋",
     "S2 反例: 极度需要安全感 vs 强回避 = 冲突不是互补 -> emotionalNeeds/conflictRisk 要体现",
     P(traits={"socialEnergy":3,"emotionalExpression":5,"conflictStyle":"direct","planningStyle":"mixed","attachmentSignal":"anxious"},
       summaryForMatching="很需要频繁联系和安全感"),
     P(traits={"socialEnergy":3,"emotionalExpression":1,"conflictStyle":"avoidant","planningStyle":"mixed","attachmentSignal":"avoidant"},
       summaryForMatching="需要很多个人空间，不喜欢黏"),
     {"ageDiff": 1, "sameSchool": False, "sameCity": True, "sharedInterests": []}),

    ("跨国跨宗教但三观一致",
     "S4: 不得因国籍/宗教背景降权；三观/认真度一致应给较高分，把差异当 openness 而非扣分",
     P(relationshipIntent={"mode":"romantic","seriousness":4,"longTermOrientation":4,"opennessToDifferentBackground":5},
       preferences=[pref("家庭观念","values",s=4),pref("读书","hobby",s=3)], summaryForMatching="尼日利亚基督徒，重视家庭，想认真发展"),
     P(relationshipIntent={"mode":"romantic","seriousness":4,"longTermOrientation":4,"opennessToDifferentBackground":5},
       preferences=[pref("家庭观念","values",s=4),pref("读书","hobby",s=3)], summaryForMatching="中国无神论者，重视家庭，想认真发展"),
     {"ageDiff": 2, "sameSchool": False, "sameCity": True, "sharedInterests": ["读书"]}),
]
for title, kd, pa, pb, diff in JUDGE_CASES:
    out = gen(PAIR_JUDGE_SYSTEM, pair_judge_user_message("romantic", pa, pb, diff))
    show(title, kd, out)

print("\n\nDONE.", flush=True)
