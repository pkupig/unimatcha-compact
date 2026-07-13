"""FastAPI service exposing the hybrid LLM matcher.

Wire contract is identical to the NestJS `ai-match-model.provider.ts`:
POST /match  {candidates, constraints}  ->  MatchResult
so pointing the backend at this service is just setting AI_PROVIDER_URL
(the provider binding switches via MATCH_MODEL / AI_PROVIDER_URL, see
apps/api/src/matching/matching.module.ts).
"""
from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request

from .config import settings
from .llm.client import OllamaClient
from .pipeline.orchestrator import MatchingPipeline
from .schemas import GenerateMatchesRequest, MatchResult

logger = logging.getLogger("uvicorn.error")


_LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.match_api_key:
        # Fail closed (P0-5): an empty key on a non-loopback bind would silently expose an
        # unauthenticated /match to the network — refuse to start instead of just warning.
        if settings.host not in _LOOPBACK_HOSTS:
            raise RuntimeError(
                f"MATCH_API_KEY is empty but HOST={settings.host} is not loopback — refusing to "
                "start an unauthenticated /match on a non-local interface. Set MATCH_API_KEY "
                "(and AI_PROVIDER_API_KEY on the backend) or bind HOST=127.0.0.1."
            )
        logger.warning(
            "MATCH_API_KEY is empty — POST /match is UNAUTHENTICATED (allowed on loopback only). "
            "Set it (and AI_PROVIDER_API_KEY on the backend) before exposing beyond localhost (P0-5)."
        )
    client = OllamaClient(settings.ollama_base_url) if settings.llm_backend == "ollama" else None
    app.state.pipeline = MatchingPipeline(settings, client)
    app.state.llm_client = client
    yield
    if client is not None:
        await client.aclose()


async def require_api_key(request: Request) -> None:
    """P0-5: Bearer auth for /match. No-op when MATCH_API_KEY is unset (local dev)."""
    if not settings.match_api_key:
        return
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    # compare as bytes: a non-ASCII str token would make secrets.compare_digest raise
    # TypeError (→ 500) instead of returning False; encoding first keeps it a clean 401.
    expected = settings.match_api_key.encode("utf-8")
    provided = token.encode("utf-8", "ignore")
    if not token or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="invalid or missing API key")


app = FastAPI(title="U-Spark Matching ML", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "llm_backend": settings.llm_backend}


@app.post("/match", response_model=MatchResult, dependencies=[Depends(require_api_key)])
async def match(req: GenerateMatchesRequest) -> MatchResult:
    pipeline: MatchingPipeline = app.state.pipeline
    return await pipeline.run(req.candidates, req.constraints)


def main() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port,
                log_level=settings.log_level)


if __name__ == "__main__":
    main()
