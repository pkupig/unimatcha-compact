"""Interface outline: implementation bodies removed."""
from __future__ import annotations
import json
from typing import Any
import httpx
class LLMError(RuntimeError):
class OllamaClient:
    def __init__(self, base_url: str, timeout: float = 60.0):
    async def chat_json(self, model: str, system: str, user: str) -> dict[str, Any]:
    async def aclose(self) -> None:
