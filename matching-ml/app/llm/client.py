"""LLM client abstraction.

Only used when LLM_BACKEND=ollama. Talks to the ollama `/api/chat` endpoint with
`format: json` so the fine-tuned model is forced to emit parseable JSON. Swapping to
an OpenAI-compatible endpoint later is a one-method change.

Until ollama is available (we deliberately do NOT pull a model locally yet), the
pipeline uses the rule-based path instead of this client — see pipeline/extractor.py
and pipeline/pair_judge.py.
"""
from __future__ import annotations

import json
from typing import Any

import httpx


class LLMError(RuntimeError):
    pass


class OllamaClient:
    def __init__(self, base_url: str, timeout: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=timeout)

    async def chat_json(self, model: str, system: str, user: str) -> dict[str, Any]:
        """Single-turn chat that must return a JSON object."""
        payload = {
            "model": model,
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.2},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        try:
            resp = await self._client.post(f"{self.base_url}/api/chat", json=payload)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise LLMError(f"ollama call failed for model={model}: {e}") from e

        content = resp.json().get("message", {}).get("content", "")
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            raise LLMError(f"model={model} returned non-JSON: {content[:200]!r}") from e

    async def aclose(self) -> None:
        await self._client.aclose()
