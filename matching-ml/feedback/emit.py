"""Turn a MatchResult into MatchExposure records to log (§9.3).

The backend calls this right after a match job and hands the list to a sink
(logging_sink.JsonlSink now, DB later). One exposure per emitted pair, carrying the
frozen featureSnapshot the pipeline stored in metadata.
"""
from __future__ import annotations

from typing import Any

from .schemas import MatchExposure


def exposures_from_result(
    result: Any,          # app.schemas.MatchResult
    mode: str,
    shown_at: str,
    id_prefix: str = "exp",
) -> list[MatchExposure]:
    out: list[MatchExposure] = []
    for i, p in enumerate(result.pairs):
        meta = p.metadata or {}
        out.append(MatchExposure(
            exposureId=f"{id_prefix}-{i}-{p.userAId}-{p.userBId}",
            mode=mode,
            userAId=p.userAId,
            userBId=p.userBId,
            shownToUserId=p.userAId,      # backend may log one per side; pair-level is enough for training
            position=i,
            algorithmVersion=meta.get("algorithm", ""),
            constitutionVersion=meta.get("constitutionVersion", ""),
            modelVersions=meta.get("modelVersions", {}),
            featureSnapshot=meta.get("featureSnapshot", {}),
            finalScore=p.score,
            shownAt=shown_at,
        ))
    return out
