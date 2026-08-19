"""Interface outline: implementation bodies removed."""
from __future__ import annotations
from typing import Any
from ..config import Settings
from ..llm.client import LLMError, OllamaClient
from ..llm.prompts import EXTRACTOR_SYSTEM, extractor_user_message
from ..schemas import (
from . import lexicon
def _free_texts(c: CandidateProfile) -> list[str]:
def raw_profile_dict(c: CandidateProfile) -> dict[str, Any]:
class RuleBasedExtractor:
    def extract(self, c: CandidateProfile, mode: str) -> UserSemanticProfile:
class LlmExtractor:
    def __init__(self, client: OllamaClient, model: str, fallback: RuleBasedExtractor):
    async def extract(self, c: CandidateProfile, mode: str) -> UserSemanticProfile:
def build_extractor(settings: Settings, client: OllamaClient | None):
