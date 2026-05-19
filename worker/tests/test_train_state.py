import json
from pathlib import Path

from train import run_mock_training


def test_mock_training_completes_and_writes_events(tmp_path: Path):
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    state = {
        "id": "run_test",
        "datasetId": "dataset_test",
        "status": "running",
        "pid": None,
        "mockMode": True,
        "startedAt": "2026-05-19T00:00:00Z",
        "finishedAt": None,
        "completedSteps": 0,
        "totalSteps": 2,
        "currentPhase": "starting",
        "trainingSeed": 1,
        "checkpointInterval": 2,
        "error": None,
    }
    (run_dir / "run_state.json").write_text(json.dumps(state), encoding="utf-8")

    run_mock_training({
        "runId": "run_test",
        "runDir": str(run_dir),
        "dataDir": str(tmp_path),
        "totalSteps": 2,
        "checkpointInterval": 2,
        "trainingSeed": 1,
    })

    final_state = json.loads((run_dir / "run_state.json").read_text(encoding="utf-8"))
    assert final_state["status"] == "completed"
    assert final_state["completedSteps"] == 2
    assert (run_dir / "run_events.jsonl").read_text(encoding="utf-8").count("\n") == 7
