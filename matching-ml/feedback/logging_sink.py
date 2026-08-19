"""Interface outline: implementation bodies removed."""
from __future__ import annotations
import json
from pathlib import Path
from typing import Iterable
from .schemas import BehaviorEvent, MatchExposure
class JsonlSink:
    def __init__(self, root: str | Path = "feedback/store"):
    def log_exposures(self, exposures: Iterable[MatchExposure]) -> int:
    def log_event(self, event: BehaviorEvent) -> None:
    def read_exposures(self) -> list[MatchExposure]:
    def read_events(self) -> list[BehaviorEvent]:
