"""Interface outline: implementation bodies removed."""
from __future__ import annotations
import json
from typing import Any
from ..constitution import system_prompt
def extractor_user_message(mode: str, profile: dict[str, Any]) -> str:
def pair_judge_user_message(
