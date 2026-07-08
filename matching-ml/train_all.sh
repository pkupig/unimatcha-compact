#!/usr/bin/env bash
# Fine-tune 4 LoRAs (恋爱/交友 × 抽取/判断) on Qwen2.5-7B-Instruct.
# Env: py3.9 + torch2.0.1 + LLaMA-Factory 0.9.1, single RTX 3090 (24GB).
# Model auto-downloads from ModelScope on first run (~15GB, once).
set -e
export USE_MODELSCOPE_HUB=1        # 走 ModelScope 下载 (hf-mirror 文件接口不稳)
export DISABLE_VERSION_CHECK=1
BASE=Qwen/Qwen2.5-7B-Instruct
DDIR=/root/autodl-tmp/unipia/matching-ml/data
ODIR=/root/autodl-tmp/unipia/matching-ml/train_out

train () {  # $1=dataset  $2=output-subdir
  echo "==================== TRAIN $1 -> $2 ===================="
  llamafactory-cli train \
    --stage sft --do_train \
    --model_name_or_path "$BASE" \
    --dataset_dir "$DDIR" --dataset "$1" --template qwen \
    --finetuning_type lora --lora_target all --lora_rank 16 --lora_alpha 32 \
    --output_dir "$ODIR/$2" \
    --per_device_train_batch_size 1 --gradient_accumulation_steps 8 \
    --lr_scheduler_type cosine --learning_rate 1e-4 --num_train_epochs 3 \
    --warmup_ratio 0.03 --cutoff_len 4096 \
    --logging_steps 10 --save_steps 500 --save_total_limit 2 \
    --gradient_checkpointing --bf16 --report_to none --overwrite_output_dir
}

train uspark_rom_extractor     rom-extractor-lora
train uspark_rom_judge         rom-judge-lora
train uspark_friend_extractor  friend-extractor-lora
train uspark_friend_judge      friend-judge-lora
echo "ALL DONE -> $ODIR/*-lora"
