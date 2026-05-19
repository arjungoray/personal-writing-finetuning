from __future__ import annotations

import argparse
import json
from pathlib import Path
import random
import statistics
import time


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.{time.time_ns()}.tmp")
    temp_path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(path)


def append_event(run_dir: Path, event: dict) -> None:
    with (run_dir / "run_events.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event) + "\n")


def update_state(run_dir: Path, state: dict, **updates: object) -> dict:
    next_state = {**state, **updates}
    write_json(run_dir / "run_state.json", next_state)
    return next_state


def run_mock_training(job: dict) -> None:
    run_dir = Path(job["runDir"])
    state_path = run_dir / "run_state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    rng = random.Random(job["trainingSeed"])

    for step in range(1, job["totalSteps"] + 1):
        if (run_dir / "cancel_requested").exists():
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            append_event(run_dir, {
                "runId": job["runId"],
                "timestamp": now,
                "phase": "cancelled",
                "step": step - 1,
                "message": "Cancellation requested; stopping before next optimizer step.",
                "metrics": {},
            })
            update_state(run_dir, state, status="cancelled", finishedAt=now, currentPhase="cancelled")
            return

        rewards = [rng.uniform(-0.2, 0.9) for _ in range(4)]
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        for phase in ("sampling", "judging", "training"):
            append_event(run_dir, {
                "runId": job["runId"],
                "timestamp": now,
                "phase": phase,
                "step": step,
                "message": f"Mock {phase} completed for step {step}.",
                "metrics": {
                    "reward_mean": round(statistics.mean(rewards), 6),
                    "reward_min": round(min(rewards), 6),
                    "reward_max": round(max(rewards), 6),
                    "reward_std": round(statistics.pstdev(rewards), 6),
                    "judge_calls": 4,
                    "judge_cache_hits": 0,
                },
            })
            time.sleep(0.05)

        phase = "checkpointing" if step % job["checkpointInterval"] == 0 else "training"
        state = update_state(
            run_dir,
            state,
            status="running",
            completedSteps=step,
            currentPhase=phase,
        )

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    append_event(run_dir, {
        "runId": job["runId"],
        "timestamp": now,
        "phase": "eval",
        "step": job["totalSteps"],
        "message": "Mock final eval completed.",
        "metrics": {"eval_reward_mean": 0.42},
    })
    update_state(run_dir, state, status="completed", finishedAt=now, currentPhase="completed")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    args = parser.parse_args()
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    run_mock_training(job)


if __name__ == "__main__":
    main()
