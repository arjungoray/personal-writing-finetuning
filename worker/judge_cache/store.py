from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .keys import JudgeCacheInput, judge_cache_key


class JudgeCacheStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.hits = 0
        self.misses = 0

    def path_for(self, key: str) -> Path:
        return self.root / f"{key}.json"

    def get(self, cache_input: JudgeCacheInput) -> dict[str, Any] | None:
        key = judge_cache_key(cache_input)
        path = self.path_for(key)
        if not path.exists():
            self.misses += 1
            return None
        self.hits += 1
        return json.loads(path.read_text(encoding="utf-8"))

    def put(self, cache_input: JudgeCacheInput, judgment: dict[str, Any]) -> dict[str, Any]:
        key = judge_cache_key(cache_input)
        record = {
            "key": key,
            "cache_input": cache_input.__dict__,
            "judgment": judgment,
        }
        self.path_for(key).write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        return record

    def summary(self) -> dict[str, int]:
        return {
            "cacheRecords": len(list(self.root.glob("*.json"))),
            "cacheHits": self.hits,
            "cacheMisses": self.misses,
        }
