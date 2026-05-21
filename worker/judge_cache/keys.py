from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any


@dataclass(frozen=True)
class JudgeCacheInput:
    prompt_text: str
    completion_text: str
    profile_hash: str
    rubric_hash: str
    reference_excerpt_hashes: list[str]
    deterministic_evidence_hash: str
    judge_provider: str
    judge_model: str
    judge_prompt_version: str


def judge_cache_key(value: JudgeCacheInput) -> str:
    payload: dict[str, Any] = asdict(value)
    payload["reference_excerpt_hashes"] = sorted(payload["reference_excerpt_hashes"])
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
