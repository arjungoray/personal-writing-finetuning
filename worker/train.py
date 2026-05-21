from __future__ import annotations

import argparse
import json
from pathlib import Path
import random
import statistics
import time

from judge_cache import JudgeCacheInput, JudgeCacheStore
from log import log, log_exception, log_stage


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.{time.time_ns()}.tmp")
    temp_path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(path)


def append_event(run_dir: Path, event: dict) -> None:
    with (run_dir / "run_events.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event) + "\n")


def update_state(run_dir: Path, state: dict, **updates: object) -> dict:
    if updates.get("finishedAt") == "now":
        updates["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    next_state = {**state, **updates}
    write_json(run_dir / "run_state.json", next_state)
    return next_state


def import_live_training():
    with log_stage("import", "Import live_training module"):
        from live_training import run_live_training

    return run_live_training


def run_mock_training(job: dict) -> None:
    log("run", "Mock training worker started.", run_id=job["runId"], total_steps=job["totalSteps"])
    run_dir = Path(job["runDir"])
    cache = JudgeCacheStore(Path(job["dataDir"]) / "judge-cache")
    state_path = run_dir / "run_state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    rng = random.Random(job["trainingSeed"])

    checkpoint_dir = run_dir / "checkpoints"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    start_step = int(state.get("completedSteps", 0)) + 1

    for step in range(start_step, job["totalSteps"] + 1):
        log("run", "Mock training step started.", run_id=job["runId"], step=step)
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
        for index, reward in enumerate(rewards):
            cache_input = JudgeCacheInput(
                prompt_text=f"mock prompt step {step}",
                completion_text=f"mock completion {index}",
                profile_hash="mock-profile",
                rubric_hash="rubric-v1",
                reference_excerpt_hashes=[f"ref-{index}"],
                deterministic_evidence_hash=f"metrics-{step}-{index}",
                judge_provider="mock",
                judge_model="mock-judge",
                judge_prompt_version="v1",
            )
            if cache.get(cache_input) is None:
                cache.put(cache_input, {
                    "style_similarity": round((reward + 1) * 50),
                    "instruction_following": 80,
                    "task_fulfillment": 80,
                    "format_quality": 80,
                    "final_score": round((reward + 1) * 50),
                    "reward": reward,
                    "violations": [],
                    "positive_style_evidence": ["mock positive evidence"],
                    "negative_style_evidence": [],
                    "brief_rationale": "Deterministic mock judgment.",
                })
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        for phase in ("sampling", "judging", "training"):
            log("mock", f"Mock {phase} phase completed.", run_id=job["runId"], step=step)
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
                    "judge_cache_hits": cache.hits,
                },
            })
            time.sleep(0.05)

        phase = "checkpointing" if step % job["checkpointInterval"] == 0 else "training"
        if step % job["checkpointInterval"] == 0:
            write_json(checkpoint_dir / f"step_{step}.json", {
                "runId": job["runId"],
                "step": step,
                "mock": True,
                "savedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
            append_event(run_dir, {
                "runId": job["runId"],
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "phase": "eval",
                "step": step,
                "message": "Mock periodic eval completed.",
                "metrics": {"eval_reward_mean": round(statistics.mean(rewards), 6)},
            })
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
    write_json(checkpoint_dir / "final.json", {
        "runId": job["runId"],
        "step": job["totalSteps"],
        "mock": True,
        "savedAt": now,
    })
    update_state(run_dir, state, status="completed", finishedAt=now, currentPhase="completed")
    write_json(run_dir / "judge_cache_summary.json", cache.summary())
    log("run", "Mock training completed.", run_id=job["runId"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    args = parser.parse_args()
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    mock_mode = bool(job.get("mockMode", True))
    log("worker", "Training worker process started.", run_id=job.get("runId"), mock_mode=mock_mode, job_path=args.job)
    if mock_mode:
        run_mock_training(job)
    else:
        run_dir = Path(job["runDir"])
        state = json.loads((run_dir / "run_state.json").read_text(encoding="utf-8"))

        def emit_event(phase: str, step: int, message: str, metrics: dict) -> None:
            log("event", message, run_id=job["runId"], phase=phase, step=step)
            append_event(run_dir, {
                "runId": job["runId"],
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "phase": phase,
                "step": step,
                "message": message,
                "metrics": metrics,
            })

        def update_live_state(**updates: object) -> dict:
            nonlocal state
            state = update_state(run_dir, state, **updates)
            log("state", "Run state updated.", run_id=job["runId"], **{key: value for key, value in updates.items() if key != "finishedAt"})
            return state

        try:
            run_live_training = import_live_training()
            with log_stage("run", "Execute live training pipeline", run_id=job["runId"]):
                asyncio_run = __import__("asyncio").run
                asyncio_run(run_live_training(job, emit_event, update_live_state))
        except Exception as error:
            log_exception("run", "Live training failed.", error=error, run_id=job["runId"])
            update_live_state(status="failed", finishedAt="now", currentPhase="failed", error=str(error))
            raise


if __name__ == "__main__":
    import sys

    try:
        main()
    except Exception as error:
        log_exception("worker", "Training worker crashed.", error=error)
        sys.exit(1)
