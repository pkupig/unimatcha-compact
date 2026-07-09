#!/usr/bin/env bash
# Fine-tune 4 LoRAs (恋爱/交友 × 抽取/判断) on Qwen2.5-7B-Instruct.
# Env: py3.9 + torch2.0.1 + LLaMA-Factory 0.9.1, single RTX 3090 (24GB).
# Model auto-downloads from ModelScope on first run (~15GB, once).
#
# NEVER overwrites: each model trains into the next free "-vN" dir, so the last
# known-good LoRA stays intact for A/B compare and rollback.
#   rom-extractor-lora  ->  rom-extractor-lora-v4   (v2/v3 already exist)
#   rom-judge-lora      ->  rom-judge-lora-v2
#   friend-*-lora       ->  friend-*-lora-v2
#
# Usage:
#   bash train_all.sh --bg     # detach; survives SSH disconnect  (recommended)
#   bash train_all.sh          # run in the foreground
# Then:
#   tail -f  train_out/train-*.log            # watch progress
#   kill -- -$(cat train_out/train.pid)       # stop the whole run cleanly
set -e

ODIR=/root/autodl-tmp/unipia/matching-ml/train_out
DDIR=/root/autodl-tmp/unipia/matching-ml/data
mkdir -p "$ODIR"

# ---- background launcher: own session => immune to SSH SIGHUP --------------- #
if [[ "${1:-}" == "--bg" ]]; then
  LOG="$ODIR/train-$(date +%Y%m%d-%H%M%S).log"
  # setsid => new session, survives disconnect. NOTE: $! is the setsid wrapper,
  # NOT the worker — so the worker records its OWN pgid below (see _run).
  setsid nohup bash "$0" _run >"$LOG" 2>&1 </dev/null &
  echo "✅ training detached — safe to close SSH now."
  echo "   watch:  tail -f $LOG"
  echo "   stop :  kill -- -\$(cat $ODIR/train.pid)   # pid file appears within ~1s"
  exit 0
fi

# worker records its own process-group id ($$ == PGID under setsid) so the whole
# run — bash loop + the running llamafactory child — is killable as a group.
[[ "${1:-}" == "_run" ]] && echo $$ > "$ODIR/train.pid"

export USE_MODELSCOPE_HUB=1        # 走 ModelScope 下载 (hf-mirror 文件接口不稳)
export DISABLE_VERSION_CHECK=1
BASE=Qwen/Qwen2.5-7B-Instruct

# next free versioned dir: base -> base (first time) else base-v2, -v3, …
next_dir () {
  local base="$1"
  if [[ ! -e "$ODIR/$base" ]]; then echo "$ODIR/$base"; return; fi
  local n=2
  while [[ -e "$ODIR/$base-v$n" ]]; do n=$((n+1)); done
  echo "$ODIR/$base-v$n"
}

train () {  # $1=dataset  $2=base-name
  local out; out=$(next_dir "$2")
  echo "==================== TRAIN $1 -> $out ===================="
  llamafactory-cli train \
    --stage sft --do_train \
    --model_name_or_path "$BASE" \
    --dataset_dir "$DDIR" --dataset "$1" --template qwen \
    --finetuning_type lora --lora_target all --lora_rank 16 --lora_alpha 32 \
    --output_dir "$out" \
    --per_device_train_batch_size 1 --gradient_accumulation_steps 8 \
    --lr_scheduler_type cosine --learning_rate 1e-4 --num_train_epochs 3 \
    --warmup_ratio 0.03 --cutoff_len 4096 \
    --logging_steps 10 --save_steps 500 --save_total_limit 2 \
    --gradient_checkpointing --bf16 --report_to none
  echo "$out" >> "$ODIR/last_run_dirs.txt"
}

: > "$ODIR/last_run_dirs.txt"
train uspark_rom_extractor     rom-extractor-lora
train uspark_rom_judge         rom-judge-lora
train uspark_friend_extractor  friend-extractor-lora
train uspark_friend_judge      friend-judge-lora

echo "ALL DONE. new LoRAs:"
cat "$ODIR/last_run_dirs.txt"
mapfile -t D < "$ODIR/last_run_dirs.txt"
echo
echo "evaluate the NEW models (evals read \$EXT_LORA / \$JUDGE_LORA overrides):"
echo "  EXT_LORA=${D[0]} JUDGE_LORA=${D[1]} python eval_rom_harsh.py    2>/dev/null"
echo "  EXT_LORA=${D[2]} JUDGE_LORA=${D[3]} python eval_friend_harsh.py 2>/dev/null"
