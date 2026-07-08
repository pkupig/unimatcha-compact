#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Compare rom-extractor v1 vs v2 on the previously-FAILING harsh cases (joke/empty).
Prints a compact PASS/FAIL per adapter. New inputs, not from training labels.
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
from app.llm.prompts import EXTRACTOR_SYSTEM, extractor_user_message

BASE = "/root/.cache/modelscope/hub/models/Qwen/Qwen2___5-7B-Instruct"
ADAPTERS = {"v1": "train_out/rom-extractor-lora", "v2": "train_out/rom-extractor-lora-v2"}

CASES = [
    ("玩笑+真底线", {"age":22,"gender":"female","school":"LSE","city":"London","interests":["露营"],
       "bio":"哈哈开玩笑啦我可受不了矮个子，不过说真的，异地我是绝对绝对没办法接受的"}),
    ("纯玩笑无底线", {"age":21,"gender":"male","school":"KCL","city":"London","interests":["篮球"],
       "bio":"月薪不过万勿扰~逗你玩的哈哈，其实随便啦"}),
    ("空资料", {"age":19,"gender":"male","school":"Bristol","city":"Bristol","interests":[],"bio":"。"}),
    ("极简寒暄", {"age":20,"gender":"female","school":"UCL","city":"London","interests":[],"bio":"在吗 看看"}),
    # regression guard: normal profile must STILL extract prefs + real dealbreaker
    ("常规(回归对照)", {"age":23,"gender":"male","school":"Imperial","city":"London","interests":["健身","猫"],
       "bio":"想认真长期发展，喜欢猫，平时健身，受不了对方抽烟"}),
]

def judge(bio_case, d):
    """Heuristic PASS/FAIL for each case's 考点."""
    prefs=d.get("preferences",[]); dbs=d.get("dealbreakers",[])
    db_topics=" ".join(x.get("topic","")+x.get("evidence","") for x in dbs)
    risk=[r.get("type") for r in d.get("riskFlags",[])]
    name=bio_case
    if name=="玩笑+真底线":
        joke_ok = not any(k in db_topics for k in ["矮","个子","身高"])
        real_ok = any("异地" in (x.get("topic","")+x.get("evidence","")) for x in dbs)
        return joke_ok and real_ok, f"玩笑未进底线={joke_ok} 异地底线保留={real_ok}"
    if name=="纯玩笑无底线":
        return len(dbs)==0, f"dealbreakers应为空 -> 实际{len(dbs)}"
    if name in ("空资料","极简寒暄"):
        ok = len(prefs)==0 and len(dbs)==0 and "low_information" in risk
        return ok, f"prefs={len(prefs)} db={len(dbs)} low_info={'low_information' in risk}"
    if name=="常规(回归对照)":
        ok = len(prefs)>=1 and any("烟" in (x.get("topic","")+x.get("evidence","")) for x in dbs)
        return ok, f"prefs={len(prefs)}(应>=1) 抽烟底线={any('烟' in (x.get('topic','')+x.get('evidence','')) for x in dbs)}"
    return None, ""

print(">> loading base…", flush=True)
tok = AutoTokenizer.from_pretrained(BASE, trust_remote_code=True)
base = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16, device_map="cuda", trust_remote_code=True)
base.eval()

def gen(model, user):
    msgs=[{"role":"system","content":EXTRACTOR_SYSTEM},{"role":"user","content":user}]
    text=tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    ids=tok(text, return_tensors="pt").to("cuda")
    with torch.no_grad():
        out=model.generate(**ids, max_new_tokens=768, do_sample=False, temperature=None, top_p=None, top_k=None, pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][ids.input_ids.shape[1]:], skip_special_tokens=True).strip()

results={}
for tag, path in ADAPTERS.items():
    if not os.path.exists(path):
        print(f"[skip] {tag}: {path} not found"); continue
    print(f"\n########## {tag}: {path} ##########", flush=True)
    model=PeftModel.from_pretrained(base, path); model.eval()
    passes=0
    for name, prof in CASES:
        out=gen(model, extractor_user_message("romantic", prof))
        try: d=json.loads(out)
        except Exception:
            print(f"  ❌ {name}: 非法JSON"); continue
        ok, detail = judge(name, d)
        passes += bool(ok)
        print(f"  {'✅' if ok else '❌'} {name}: {detail}")
        print(f"       db={[(x['topic'],x.get('polarity'),x.get('flexibility')) for x in d.get('dealbreakers',[])]} prefs={[x['topic'] for x in d.get('preferences',[])]} risk={[r['type'] for r in d.get('riskFlags',[])]}")
    results[tag]=passes
    del model; torch.cuda.empty_cache()

print("\n==== SUMMARY (通过数 / 共%d) ====" % len(CASES))
for tag,p in results.items(): print(f"  {tag}: {p}/{len(CASES)}")
print("DONE.")
