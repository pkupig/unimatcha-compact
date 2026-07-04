"""FastAPI service exposing the hybrid LLM matcher.

Wire contract is identical to the NestJS `ai-match-model.provider.example.ts`:
POST /match  {candidates, constraints}  ->  MatchResult
so pointing the backend at this service is just setting AI_PROVIDER_URL and switching
the provider binding in matching.module.ts from Scoring to AI.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import settings
from .llm.client import OllamaClient
from .pipeline.orchestrator import MatchingPipeline
from .schemas import GenerateMatchesRequest, MatchResult


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = OllamaClient(settings.ollama_base_url) if settings.llm_backend == "ollama" else None
    app.state.pipeline = MatchingPipeline(settings, client)
    app.state.llm_client = client
    yield
    if client is not None:
        await client.aclose()


app = FastAPI(title="U-Spark Matching ML", version="0.1.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "llm_backend": settings.llm_backend}


@app.post("/match", response_model=MatchResult)
async def match(req: GenerateMatchesRequest) -> MatchResult:
    pipeline: MatchingPipeline = app.state.pipeline
    return await pipeline.run(req.candidates, req.constraints)


def main() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port,
                log_level=settings.log_level)


if __name__ == "__main__":
    main()
