from live_training import build_sampling_params, fallback_judgment, normalize_judgment


class FakePrompt:
    def __init__(self, length: int):
        self.length = length


class FakeSamplingParams:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def test_sampling_params_cap_generation_to_remaining_context():
    params = build_sampling_params(
        FakeSamplingParams,
        {"sampleMaxTokens": 32768, "modelContextTokens": 2048},
        FakePrompt(1500),
    )

    assert params.max_tokens == 548
    assert params.temperature == 0.8
    assert params.max_time == 120.0
    assert params.logprobs_max_tokens is None


def test_sampling_params_use_safe_default_without_job_override():
    params = build_sampling_params(FakeSamplingParams, {}, FakePrompt(128))

    assert params.max_tokens == 768
    assert params.logprobs_max_tokens is None


def test_normalize_judgment_unwraps_echoed_required_shape():
    judgment = normalize_judgment({
        "promptText": "p",
        "completionText": "c",
        "requiredShape": {
            "style_similarity": 0,
            "instruction_following": 1,
            "task_fulfillment": 0,
            "format_quality": 1,
            "final_score": 0.5,
            "reward": -0.99,
            "violations": [],
            "positive_style_evidence": [],
            "negative_style_evidence": [],
            "brief_rationale": "ok",
        },
    })

    assert judgment["reward"] == -0.99
    assert judgment["final_score"] == 0.5


def test_normalize_judgment_derives_missing_reward_from_scores():
    judgment = normalize_judgment({
        "style_similarity": 80,
        "instruction_following": 60,
        "task_fulfillment": 40,
        "format_quality": 50,
        "violations": [],
    })

    assert judgment["final_score"] == 69
    assert judgment["reward"] == 0.38


def test_normalize_judgment_falls_back_for_nan_scores():
    judgment = normalize_judgment({
        "style_similarity": "NaN",
        "instruction_following": float("nan"),
        "task_fulfillment": None,
        "format_quality": "not a number",
    })

    assert judgment["style_similarity"] == 0
    assert judgment["instruction_following"] == 0
    assert judgment["task_fulfillment"] == 0
    assert judgment["final_score"] == 0
    assert judgment["reward"] == -1


def test_fallback_judgment_uses_deterministic_style_evidence():
    judgment = fallback_judgment({"aggregate_similarity": 0.5}, "fallback")

    assert judgment["style_similarity"] == 50
    assert judgment["final_score"] == 30
    assert judgment["reward"] == -0.4
    assert judgment["violations"] == ["judge_api_failed"]
