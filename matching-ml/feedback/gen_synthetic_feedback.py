"""Interface outline: implementation bodies removed."""
from __future__ import annotations
import argparse
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np
from app.config import Settings
from app.pipeline.orchestrator import MatchingPipeline
from app.schemas import CandidateProfile, MatchConstraints
from feedback.emit import exposures_from_result
from feedback.logging_sink import JsonlSink
from feedback.schemas import BehaviorEvent
def _ts(minutes: int) -> str:
def _sigmoid(x: float) -> float:
def make_pool(rng: np.random.Generator, n: int) -> list[CandidateProfile]:
def simulate_events(pair, snapshot, rng) -> list[BehaviorEvent]:
    def add(actor, typ, minute, **meta):
def main() -> None:
