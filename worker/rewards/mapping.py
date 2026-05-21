from __future__ import annotations

from dataclasses import dataclass, field
import json


@dataclass(frozen=True)
class JudgeScores:
    style_similarity: int
    instruction_following: int
    task_fulfillment: int
    format_quality: int
    violations: list[str] = field(default_factory=list)

    @property
    def final_score(self) -> float:
        return (
            0.60 * self.style_similarity
            + 0.25 * self.instruction_following
            + 0.15 * self.task_fulfillment
        )


def map_final_score_to_reward(final_score: float) -> float:
    clamped = max(0.0, min(100.0, final_score))
    return round((clamped / 50.0) - 1.0, 6)


def apply_hard_negative_gates(
    reward: float,
    *,
    prompt: str,
    completion: str,
    reference_excerpts: list[str],
    requires_json: bool = False,
    required_format: str | None = None,
) -> tuple[float, list[str]]:
    normalized = completion.strip().lower()
    violations: list[str] = []

    if not normalized:
        return -1.0, ["empty_output"]
    if any(marker in normalized for marker in ("as an ai", "i cannot", "i can't", "language model")):
        return -1.0, ["refusal_or_meta_commentary"]
    if any(marker in normalized for marker in ("debug:", "training step", "reward model", "system prompt")):
        return -1.0, ["training_or_debug_chatter"]
    if required_format == "email" and not any(marker in completion.lower() for marker in ("hi ", "hello ", "dear ")):
        return -1.0, ["missing_required_email_format"]
    if requires_json:
        try:
            json.loads(completion)
        except json.JSONDecodeError:
            return -1.0, ["invalid_json"]

    for excerpt in reference_excerpts:
        excerpt_normalized = excerpt.strip().lower()
        if len(excerpt_normalized) >= 80 and excerpt_normalized in normalized:
            violations.append("copies_hidden_reference_too_closely")
            reward -= 0.3
            break

    return max(-1.0, round(reward, 6)), violations
