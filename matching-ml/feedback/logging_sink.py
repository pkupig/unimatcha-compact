"""Where exposures and behavior events land.

JSONL sink now; the same interface backs a DB writer later (feedback/prisma_models.prisma
defines the tables). The matching service or backend calls `log_exposures(...)` right after
a match job, and `log_event(...)` on each user action.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .schemas import BehaviorEvent, MatchExposure


class JsonlSink:
    def __init__(self, root: str | Path = "feedback/store"):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.exposures = self.root / "exposures.jsonl"
        self.events = self.root / "events.jsonl"

    def log_exposures(self, exposures: Iterable[MatchExposure]) -> int:
        n = 0
        with self.exposures.open("a", encoding="utf-8") as f:
            for e in exposures:
                f.write(e.model_dump_json() + "\n")
                n += 1
        return n

    def log_event(self, event: BehaviorEvent) -> None:
        with self.events.open("a", encoding="utf-8") as f:
            f.write(event.model_dump_json() + "\n")

    def read_exposures(self) -> list[MatchExposure]:
        if not self.exposures.exists():
            return []
        return [MatchExposure.model_validate_json(l)
                for l in self.exposures.read_text(encoding="utf-8").splitlines() if l.strip()]

    def read_events(self) -> list[BehaviorEvent]:
        if not self.events.exists():
            return []
        return [BehaviorEvent.model_validate_json(l)
                for l in self.events.read_text(encoding="utf-8").splitlines() if l.strip()]
