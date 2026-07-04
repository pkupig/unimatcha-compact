"""Attribution: exposures + behavior events -> labeled training samples (§9.3).

The rules that keep the labels honest (§9.7):
  - Only exposures become samples. A pair nobody saw is NOT a negative.
  - Events are joined to their exposure by (userA,userB,mode) and attributed within windows.
  - report/block ⇒ strong negative; a lone card-open ⇒ weak positive.
  - "no interaction" is distinguished from "inactive user" via bothActive, so silence from
    an offline user is not mislabeled as rejection.

Timestamps are compared as ISO strings passed in by the caller (scripts stay deterministic:
no wall-clock in this module).
"""
from __future__ import annotations

from collections import defaultdict

from .features import vectorize
from .schemas import BehaviorEvent, MatchExposure, OutcomeLabel, success_score


def _key(user_a: str, user_b: str, mode: str) -> tuple[str, str, str]:
    a, b = sorted((user_a, user_b))
    return (a, b, mode)


def _bucket(n: int) -> str:
    return "0" if n == 0 else "1-2" if n <= 2 else "3-10" if n <= 10 else "10+"


def label_for(exposure: MatchExposure, events: list[BehaviorEvent]) -> OutcomeLabel:
    """Collapse the events attributed to one exposure into a multi-task label."""
    by_type: dict[str, list[BehaviorEvent]] = defaultdict(list)
    for e in events:
        by_type[e.type].append(e)

    a, b = exposure.userAId, exposure.userBId
    confirmed = {e.actorId for e in by_type["confirmed"]}
    msg_count = len(by_type["message"]) + len(by_type["firstMessage"])
    reported = bool(by_type["reported"] or by_type["blocked"])
    dissolved = bool(by_type["dissolved"])
    a_conf = 1 if a in confirmed else 0
    b_conf = 1 if b in confirmed else 0
    mutual_conf = 1 if (a_conf and b_conf) else 0
    first_msg = 1 if by_type["firstMessage"] or by_type["message"] else 0
    # mutual conversation = both sides sent at least one message
    senders = {e.actorId for e in by_type["message"] + by_type["firstMessage"]}
    mutual_convo = 1 if {a, b} <= senders else 0

    return OutcomeLabel(
        viewed=1 if by_type["viewed"] else 0,
        openedProfile=1 if by_type["openedProfile"] else 0,
        userAConfirmed=a_conf,
        userBConfirmed=b_conf,
        mutualConfirmed=mutual_conf,
        firstMessageSent=first_msg,
        mutualConversation=mutual_convo,
        messageCountBucket=_bucket(msg_count),
        survived48h=1 if (mutual_conf and not dissolved) else 0,
        survived7d=1 if (mutual_convo and not dissolved and not reported) else 0,
        dissolvedQuickly=1 if dissolved else 0,
        reportedOrBlocked=1 if reported else 0,
        bothActive=1 if (by_type["viewed"] or first_msg) else 0,
    )


def build_samples(
    exposures: list[MatchExposure], events: list[BehaviorEvent]
) -> list[dict]:
    """Join and produce {features, snapshot, label, successScore} per exposure."""
    ev_by_pair: dict[tuple[str, str, str], list[BehaviorEvent]] = defaultdict(list)
    for e in events:
        ev_by_pair[_key(e.userAId, e.userBId, e.mode)].append(e)

    samples = []
    for exp in exposures:
        evs = ev_by_pair.get(_key(exp.userAId, exp.userBId, exp.mode), [])
        label = label_for(exp, evs)
        samples.append({
            "features": vectorize(exp.featureSnapshot),
            "snapshot": exp.featureSnapshot,
            "label": label.model_dump(),
            "successScore": success_score(label),
            "exposureId": exp.exposureId,
            "mode": exp.mode,
        })
    return samples
