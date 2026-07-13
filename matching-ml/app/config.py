"""Runtime configuration, loaded from environment / .env.

Mirrors .env.example. Everything the pipeline needs to run without ollama is
covered by defaults, so the service boots in "mock" mode out of the box.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM backend
    llm_backend: str = "mock"  # "mock" | "ollama"
    ollama_base_url: str = "http://localhost:11434"
    extractor_model: str = "uspark-profile-extractor"
    pair_judge_model: str = "uspark-pair-judge"

    # Pipeline
    recall_top_k: int = 50
    # Calibrate per backend: the fused hybrid scale is more compressed than the old
    # pure-rule 0-100, so 60 here ≈ the old 75. Re-tune once the fine-tuned LLM is live.
    score_threshold: float = 60.0
    judge_min_prefilter: float = 40.0

    # Matching layer
    matching_objective: str = "stable"  # "stable" (Gale-Shapley) | "greedy"
    fairness_wait_rounds: int = 2        # users waiting >= this get matching priority

    # Learned ranker (§9.5). If this file exists, it replaces the hand-written fusion
    # weights; otherwise the pipeline uses fusion.py. Retrain weekly on feedback.
    ranker_model_path: str = ""

    # Security (P0-5). Shared secret required as `Authorization: Bearer <key>` on
    # POST /match; the NestJS side sends AI_PROVIDER_API_KEY — the two MUST match.
    # Empty = auth disabled (local dev only; never expose beyond localhost like that).
    match_api_key: str = ""

    # Service
    host: str = "0.0.0.0"
    port: int = 8100
    log_level: str = "info"


settings = Settings()
