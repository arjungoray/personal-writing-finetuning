from datasets import PromptRecord, stratified_split
from judge_cache import JudgeCacheInput, JudgeCacheStore, judge_cache_key
from scorer import score_style_evidence


def test_style_scorer_is_deterministic():
    completion = "I keep the note short. Then I add a warmer close."
    references = ["I keep updates short. Then I close with one practical next step."]
    first = score_style_evidence(completion, references).to_dict()
    second = score_style_evidence(completion, references).to_dict()
    assert first == second
    assert 0 <= first["aggregate_similarity"] <= 1


def test_judge_cache_key_is_stable_and_order_insensitive_for_references():
    base = JudgeCacheInput(
        prompt_text="rewrite this",
        completion_text="done",
        profile_hash="profile",
        rubric_hash="rubric",
        reference_excerpt_hashes=["b", "a"],
        deterministic_evidence_hash="metrics",
        judge_provider="google",
        judge_model="meta-llama/llama-4-scout-17b-16e-instruct",
        judge_prompt_version="v1",
    )
    changed_order = JudgeCacheInput(**{**base.__dict__, "reference_excerpt_hashes": ["a", "b"]})
    assert judge_cache_key(base) == judge_cache_key(changed_order)


def test_judge_cache_store_round_trips_records(tmp_path):
    cache_input = JudgeCacheInput(
        prompt_text="p",
        completion_text="c",
        profile_hash="profile",
        rubric_hash="rubric",
        reference_excerpt_hashes=["ref"],
        deterministic_evidence_hash="metrics",
        judge_provider="mock",
        judge_model="mock-judge",
        judge_prompt_version="v1",
    )
    store = JudgeCacheStore(tmp_path)
    assert store.get(cache_input) is None
    store.put(cache_input, {"reward": 0.25})
    cached = store.get(cache_input)
    assert cached is not None
    assert cached["judgment"]["reward"] == 0.25
    assert store.summary()["cacheRecords"] == 1


def test_stratified_split_keeps_task_types_in_eval():
    records = [
        PromptRecord(id=f"rewrite-{index}", task_type="rewrite", prompt_text="r")
        for index in range(10)
    ] + [
        PromptRecord(id=f"email-{index}", task_type="email", prompt_text="e")
        for index in range(10)
    ]
    train, eval_records = stratified_split(records, seed=7)
    assert len(train) == 16
    assert len(eval_records) == 4
    assert {record.task_type for record in eval_records} == {"rewrite", "email"}
