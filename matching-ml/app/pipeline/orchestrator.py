"""Interface outline: implementation bodies removed."""
from __future__ import annotations
import inspect
import time
from typing import Any
from ..config import Settings
from ..constitution import CONSTITUTION_VERSION
from ..llm.client import OllamaClient
from ..mode_profile import get_profile
from ..schemas import (
from feedback import features
from . import fusion, pairscore, recall, rules
from .extractor import build_extractor
from .global_match import (
from .pair_judge import build_judge
async def _maybe_await(value: Any) -> Any:
class MatchingPipeline:
    def __init__(self, settings: Settings, client: OllamaClient | None):
        from feedback.ranker import build_ranker
    async def run(
