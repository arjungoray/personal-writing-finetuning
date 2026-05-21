from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import random


@dataclass(frozen=True)
class PromptRecord:
    id: str
    task_type: str
    prompt_text: str


def stratified_split(records: list[PromptRecord], *, eval_ratio: float = 0.2, seed: int = 1729) -> tuple[list[PromptRecord], list[PromptRecord]]:
    by_task: dict[str, list[PromptRecord]] = defaultdict(list)
    for record in records:
        by_task[record.task_type].append(record)

    rng = random.Random(seed)
    train: list[PromptRecord] = []
    eval_records: list[PromptRecord] = []
    for task_records in by_task.values():
        shuffled = task_records[:]
        rng.shuffle(shuffled)
        eval_count = max(1, round(len(shuffled) * eval_ratio)) if len(shuffled) > 1 else 0
        eval_records.extend(shuffled[:eval_count])
        train.extend(shuffled[eval_count:])

    return sorted(train, key=lambda record: record.id), sorted(eval_records, key=lambda record: record.id)
