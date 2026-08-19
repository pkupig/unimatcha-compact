"""Interface outline: implementation bodies removed."""
from __future__ import annotations
from dataclasses import dataclass, field
@dataclass(frozen=True)
class ModeProfile:
def get_profile(mode: str) -> ModeProfile:
