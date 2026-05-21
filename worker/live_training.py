from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

from scorer import score_style_evidence
from judge_cache import JudgeCacheInput, JudgeCacheStore
from log import log, log_stage

DEFAULT_SAMPLE_MAX_TOKENS = 768
DEFAULT_SAMPLE_MAX_TIME_SECONDS = 120.0
DEFAULT_MODEL_CONTEXT_TOKENS = 2048
DEFAULT_GROUP_SIZE = 4
MAX_GROUP_SIZE = 4
DEFAULT_TRAINING_BASE_MODEL = "lfm2.5-1.2b-instruct"
DEFAULT_LORA_RANK = 16


@dataclass(frozen=True)
class PromptRecord:
    id: str
    task_type: str
    prompt_text: str
    reference_hashes: list[str]


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_completed_step(run_dir: Path) -> int:
    state_path = run_dir / "run_state.json"
    if not state_path.exists():
        return 0
    try:
        return int(json.loads(state_path.read_text(encoding="utf-8")).get("completedSteps", 0))
    except (ValueError, json.JSONDecodeError):
        return 0


def configure_ray_unsloth(ray_unsloth_path: str) -> None:
    import sys

    source_path = str(Path(ray_unsloth_path).expanduser().resolve() / "src")
    if source_path not in sys.path:
        sys.path.insert(0, source_path)


def token_ids_from_output(output: Any) -> list[int]:
    if isinstance(output, dict):
        output = output["input_ids"]
    elif hasattr(output, "input_ids"):
        output = output.input_ids
    if hasattr(output, "detach"):
        output = output.detach().cpu()
    if hasattr(output, "tolist"):
        output = output.tolist()
    if output and isinstance(output[0], list):
        output = output[0]
    return [int(token) for token in output]


def encode_prompt(tokenizer: Any, prompt_text: str):
    from ray_unsloth import ModelInput

    messages = [
        {"role": "system", "content": "You write in the user's approved voice while following the task exactly."},
        {"role": "user", "content": prompt_text},
    ]
    apply_chat_template = getattr(tokenizer, "apply_chat_template", None)
    if callable(apply_chat_template):
        tokens = token_ids_from_output(apply_chat_template(messages, tokenize=True, add_generation_prompt=True))
    else:
        encoded = tokenizer(f"System: {messages[0]['content']}\n\nUser: {prompt_text}\n\nAssistant:", add_special_tokens=True)
        tokens = token_ids_from_output(encoded)
    eos = getattr(tokenizer, "eos_token_id", None)
    if eos is not None and tokens and tokens[-1] == eos:
        tokens = tokens[:-1]
    return ModelInput.from_ints(tokens)


def assemble_sequence_text(sequence: Any, tokenizer: Any) -> str:
    tokens = list(sequence.tokens)
    text = sequence.text or tokenizer.decode(tokens, skip_special_tokens=True)
    thinking_fragments = []
    for attr in ("thinking", "thoughts", "reasoning"):
        value = getattr(sequence, attr, None)
        if value:
            thinking_fragments.append(str(value))
    if thinking_fragments:
        thinking_fragments.append(text or "")
        return "\n".join(thinking_fragments)
    return text or ""


def finite_logprobs(logprobs: list[float | None] | None, target_length: int) -> list[float]:
    values = [0.0 if value is None else float(value) for value in (logprobs or [])]
    if len(values) < target_length:
        values.extend([0.0] * (target_length - len(values)))
    return values[:target_length]


def build_policy_datum(prompt: Any, completion_tokens: list[int], logprobs: list[float | None] | None, advantage: float):
    from ray_unsloth import Datum, EncodedTextChunk, TensorData

    prompt_target_padding = max(prompt.length - 1, 0)
    model_input = prompt.append(EncodedTextChunk(tokens=completion_tokens[:-1]))
    target_tokens = [0] * prompt_target_padding + completion_tokens
    old_logprobs = [0.0] * prompt_target_padding + finite_logprobs(logprobs, len(completion_tokens))
    advantages = [0.0] * prompt_target_padding + [float(advantage)] * len(completion_tokens)
    weights = [0.0] * prompt_target_padding + [1.0] * len(completion_tokens)
    return Datum(
        model_input=model_input,
        loss_fn_inputs={
            "target_tokens": TensorData(data=target_tokens, dtype="int64", shape=[len(target_tokens)]),
            "logprobs": TensorData(data=old_logprobs, dtype="float32", shape=[len(old_logprobs)]),
            "advantages": TensorData(data=advantages, dtype="float32", shape=[len(advantages)]),
            "weights": TensorData(data=weights, dtype="float32", shape=[len(weights)]),
        },
    )


def group_relative_advantages(rewards: list[float]) -> list[float]:
    mean_reward = sum(rewards) / len(rewards) if rewards else 0.0
    return [reward - mean_reward for reward in rewards]


def post_judge(app_base_url: str, prompt_text: str, completion_text: str, evidence: dict[str, Any]) -> dict[str, Any]:
    payload = json.dumps({
        "promptText": prompt_text,
        "completionText": completion_text,
        "deterministicEvidence": evidence,
    }).encode("utf-8")
    req = urlrequest.Request(
        f"{app_base_url}/api/judge",
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as error:
        return fallback_judgment(evidence, f"Judge API failed; using deterministic fallback. {error}")


def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def clamp_float(value: Any, *, min_value: float, max_value: float, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    if not math.isfinite(parsed):
        parsed = default
    return max(min_value, min(parsed, max_value))


def fallback_judgment(evidence: dict[str, Any], rationale: str) -> dict[str, Any]:
    style_similarity = clamp_float(evidence.get("aggregate_similarity", 0.0), min_value=0.0, max_value=1.0) * 100.0
    final_score = clamp_float(0.60 * style_similarity, min_value=0.0, max_value=100.0)
    reward = round(clamp_float((final_score / 50.0) - 1.0, min_value=-1.0, max_value=1.0), 6)
    return {
        "style_similarity": style_similarity,
        "instruction_following": 0.0,
        "task_fulfillment": 0.0,
        "format_quality": 0.0,
        "final_score": final_score,
        "reward": reward,
        "violations": ["judge_api_failed"],
        "positive_style_evidence": [],
        "negative_style_evidence": [],
        "brief_rationale": rationale,
    }


def normalize_judgment(judgment: dict[str, Any]) -> dict[str, Any]:
    candidate = judgment.get("requiredShape") if isinstance(judgment.get("requiredShape"), dict) else judgment
    final_score_value = candidate.get("final_score")
    if final_score_value is None:
        final_score_value = (
            0.60 * clamp_float(candidate.get("style_similarity", 0.0), min_value=0.0, max_value=100.0)
            + 0.25 * clamp_float(candidate.get("instruction_following", 0.0), min_value=0.0, max_value=100.0)
            + 0.15 * clamp_float(candidate.get("task_fulfillment", 0.0), min_value=0.0, max_value=100.0)
        )
    final_score = clamp_float(final_score_value, min_value=0.0, max_value=100.0)
    reward_value = candidate.get("reward")
    reward = round(
        clamp_float(reward_value if reward_value is not None else (final_score / 50.0) - 1.0, min_value=-1.0, max_value=1.0),
        6,
    )
    return {
        "style_similarity": clamp_float(candidate.get("style_similarity", 0.0), min_value=0.0, max_value=100.0),
        "instruction_following": clamp_float(candidate.get("instruction_following", 0.0), min_value=0.0, max_value=100.0),
        "task_fulfillment": clamp_float(candidate.get("task_fulfillment", 0.0), min_value=0.0, max_value=100.0),
        "format_quality": clamp_float(candidate.get("format_quality", 0.0), min_value=0.0, max_value=100.0),
        "final_score": final_score,
        "reward": reward,
        "violations": list(candidate.get("violations") or []),
        "positive_style_evidence": list(candidate.get("positive_style_evidence") or []),
        "negative_style_evidence": list(candidate.get("negative_style_evidence") or []),
        "brief_rationale": str(candidate.get("brief_rationale") or ""),
    }


def bounded_int(value: Any, default: int, *, min_value: int, max_value: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(min_value, min(parsed, max_value))


def bounded_float(value: Any, default: float, *, min_value: float, max_value: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return max(min_value, min(parsed, max_value))


def prompt_token_length(prompt: Any) -> int:
    length = getattr(prompt, "length", None)
    if length is not None:
        return int(length)
    if hasattr(prompt, "to_ints"):
        return len(prompt.to_ints())
    return len(prompt)


def build_sampling_params(SamplingParams: Any, job: dict[str, Any], prompt: Any):
    configured_max_tokens = bounded_int(
        job.get("sampleMaxTokens", os.environ.get("VOICE_LAB_SAMPLE_MAX_TOKENS")),
        DEFAULT_SAMPLE_MAX_TOKENS,
        min_value=1,
        max_value=32768,
    )
    context_tokens = bounded_int(
        job.get("modelContextTokens", os.environ.get("VOICE_LAB_MODEL_CONTEXT_TOKENS")),
        DEFAULT_MODEL_CONTEXT_TOKENS,
        min_value=128,
        max_value=32768,
    )
    prompt_tokens = prompt_token_length(prompt)
    available_tokens = context_tokens - prompt_tokens
    if available_tokens <= 0:
        raise ValueError(
            "Prompt is too long for live training "
            f"({prompt_tokens} tokens >= {context_tokens} token context window)."
        )
    max_tokens = min(configured_max_tokens, available_tokens)
    max_time = bounded_float(
        job.get("sampleMaxTimeSeconds", os.environ.get("VOICE_LAB_SAMPLE_MAX_TIME_SECONDS")),
        DEFAULT_SAMPLE_MAX_TIME_SECONDS,
        min_value=1.0,
        max_value=600.0,
    )
    return SamplingParams(
        max_tokens=max_tokens,
        temperature=0.8,
        max_time=max_time,
        # Leave this unset so Ray-Unsloth does not retain per-step generate
        # score tensors; it computes completion logprobs after generation.
        logprobs_max_tokens=None,
    )


async def sample_sequences(
    sampler: Any,
    *,
    prompt: Any,
    num_samples: int,
    sampling_params: Any,
    run_id: str,
    step: int,
    prompt_id: str,
) -> list[Any]:
    sequences: list[Any] = []
    for sample_index in range(num_samples):
        with log_stage(
            "modal",
            "Sample completion",
            run_id=run_id,
            step=step,
            prompt_id=prompt_id,
            sample_index=sample_index + 1,
            sample_count=num_samples,
            max_tokens=sampling_params.max_tokens,
        ):
            sample_result = await sampler.sample_async(
                prompt=prompt,
                num_samples=1,
                sampling_params=sampling_params,
            )
        sequences.extend(list(sample_result.sequences))
    return sequences


def policy_loss_summary(loss_fn_outputs: list[dict[str, Any]]) -> tuple[float, float]:
    logprobs: list[float] = []
    ratios: list[float] = []
    for output in loss_fn_outputs or []:
        for value in output.get("logprobs", []).tolist():
            if float(value) != 0.0:
                logprobs.append(float(value))
        ratio_values = output.get("ratios")
        if ratio_values is not None:
            for value in ratio_values.tolist():
                if float(value) != 0.0:
                    ratios.append(float(value))
    return (
        sum(logprobs) / len(logprobs) if logprobs else 0.0,
        sum(ratios) / len(ratios) if ratios else 0.0,
    )


async def run_live_training(job: dict[str, Any], emit_event, update_state) -> None:
    run_id = job["runId"]
    log("run", "Live training worker entered.", run_id=run_id, config_path=job["configPath"])

    with log_stage("ray-unsloth", "Configure import path", run_id=run_id, ray_unsloth_path=job["rayUnslothPath"]):
        configure_ray_unsloth(job["rayUnslothPath"])
    from ray_unsloth import AdamParams, SamplingParams, ServiceClient

    dataset_dir = Path(job["datasetDir"])
    judge_cache = JudgeCacheStore(Path(job["dataDir"]) / "judge-cache")
    prompts = [
        PromptRecord(
            id=record["id"],
            task_type=record["taskType"],
            prompt_text=record["promptText"],
            reference_hashes=record["selectedReferenceExcerptIds"],
        )
        for record in load_jsonl(dataset_dir / "rl_prompts.jsonl")
    ]
    eval_prompts = [
        PromptRecord(
            id=record["id"],
            task_type=record["taskType"],
            prompt_text=record["promptText"],
            reference_hashes=record["selectedReferenceExcerptIds"],
        )
        for record in load_jsonl(dataset_dir / "eval_prompts.jsonl")
    ]
    if not prompts:
        raise ValueError("No training prompts found in dataset.")
    log(
        "dataset",
        "Loaded training and eval prompts.",
        run_id=run_id,
        train_prompts=len(prompts),
        eval_prompts=len(eval_prompts),
    )

    with log_stage("modal", "Start ServiceClient (build Modal app and runner)", run_id=run_id):
        service_client = ServiceClient(config=job["configPath"])
    try:
        with log_stage("modal", "Create LoRA training client (trainer actor handle)", run_id=run_id):
            training_client = await service_client.create_lora_training_client_async(
                base_model=job.get("trainingBaseModel", DEFAULT_TRAINING_BASE_MODEL),
                rank=int(job.get("loraRank", DEFAULT_LORA_RANK)),
            )
        tokenizer = training_client.get_tokenizer()
        log("ray-unsloth", "Tokenizer loaded locally.", run_id=run_id)

        with log_stage("modal", "Create live sampling client", run_id=run_id):
            sampler = await training_client.create_live_sampling_client_async(name=f"{job['runId']}-live")
        adam_params = AdamParams(learning_rate=4e-5, beta1=0.9, beta2=0.95, max_grad_norm=1.0)
        group_size = bounded_int(job.get("groupSize"), DEFAULT_GROUP_SIZE, min_value=1, max_value=MAX_GROUP_SIZE)
        log(
            "ray-unsloth",
            "Training loop configuration ready.",
            run_id=run_id,
            group_size=group_size,
            sample_max_tokens=job.get("sampleMaxTokens", DEFAULT_SAMPLE_MAX_TOKENS),
            model_context_tokens=job.get("modelContextTokens", DEFAULT_MODEL_CONTEXT_TOKENS),
        )

        async def run_eval(step: int) -> float:
            if not eval_prompts:
                return 0.0
            with log_stage("eval", "Run held-out eval", run_id=run_id, step=step):
                eval_rewards: list[float] = []
                for record in eval_prompts[: min(4, len(eval_prompts))]:
                    prompt = encode_prompt(tokenizer, record.prompt_text)
                    sampling_params = build_sampling_params(SamplingParams, job, prompt)
                    with log_stage("modal", "Eval sampler invoke", run_id=run_id, step=step, prompt_id=record.id):
                        sample_result = await sampler.sample_async(
                            prompt=prompt,
                            num_samples=1,
                            sampling_params=sampling_params,
                        )
                    for sequence in sample_result.sequences:
                        text = assemble_sequence_text(sequence, tokenizer)
                        evidence = score_style_evidence(text, [record.prompt_text]).to_dict()
                        judgment = normalize_judgment(post_judge(job["appBaseUrl"], record.prompt_text, text, evidence))
                        eval_rewards.append(float(judgment["reward"]))
            mean_eval = sum(eval_rewards) / len(eval_rewards) if eval_rewards else 0.0
            emit_event("eval", step, "Held-out eval prompts judged.", {"eval_reward_mean": mean_eval, "eval_prompt_count": len(eval_rewards)})
            return mean_eval

        start_step = load_completed_step(Path(job["runDir"])) + 1
        log("run", "Beginning training steps.", run_id=run_id, start_step=start_step, total_steps=job["totalSteps"])
        for step in range(start_step, int(job["totalSteps"]) + 1):
            log("run", "Training step started.", run_id=run_id, step=step)
            prompt_records = [prompts[(step + offset) % len(prompts)] for offset in range(1)]
            datums = []
            rewards: list[float] = []
            degenerate_groups = 0
            judge_calls = 0

            for record in prompt_records:
                prompt = encode_prompt(tokenizer, record.prompt_text)
                sampling_params = build_sampling_params(SamplingParams, job, prompt)
                with log_stage(
                    "modal",
                    "Sample completion group (first invoke may start GPU container)",
                    run_id=run_id,
                    step=step,
                    prompt_id=record.id,
                    group_size=group_size,
                    max_tokens=sampling_params.max_tokens,
                ):
                    sequences = await sample_sequences(
                        sampler,
                        prompt=prompt,
                        num_samples=group_size,
                        sampling_params=sampling_params,
                        run_id=run_id,
                        step=step,
                        prompt_id=record.id,
                    )
                group_rewards: list[float] = []
                group_payloads: list[tuple[Any, str, float]] = []
                for sequence in sequences:
                    text = assemble_sequence_text(sequence, tokenizer)
                    with log_stage("judge", "Score and judge completion", run_id=run_id, step=step, prompt_id=record.id):
                        evidence = score_style_evidence(text, [record.prompt_text]).to_dict()
                        cache_input = JudgeCacheInput(
                            prompt_text=record.prompt_text,
                            completion_text=text,
                            profile_hash="profile-from-dataset",
                            rubric_hash="rubric-v1",
                            reference_excerpt_hashes=record.reference_hashes,
                            deterministic_evidence_hash=stable_hash(evidence),
                            judge_provider="mastra",
                            judge_model="configured-judge",
                            judge_prompt_version="v1",
                        )
                        cached = judge_cache.get(cache_input)
                        if cached is None:
                            judgment = normalize_judgment(post_judge(job["appBaseUrl"], record.prompt_text, text, evidence))
                            judge_cache.put(cache_input, judgment)
                        else:
                            judgment = normalize_judgment(cached["judgment"])
                    reward = float(judgment["reward"])
                    group_rewards.append(reward)
                    group_payloads.append((sequence, text, reward))
                    judge_calls += 1

                advantages = group_relative_advantages(group_rewards)
                if all(math.isclose(advantage, 0.0) for advantage in advantages):
                    degenerate_groups += 1
                    continue

                for (sequence, _text, reward), advantage in zip(group_payloads, advantages):
                    rewards.append(reward)
                    tokens = list(sequence.tokens)
                    if tokens:
                        datums.append(build_policy_datum(prompt, tokens, sequence.logprobs, advantage))

            mean_logprob = 0.0
            mean_ratio = 0.0
            if datums:
                with log_stage("modal", "Forward/backward on trainer GPU", run_id=run_id, step=step, datum_count=len(datums)):
                    fwdbwd_future = await training_client.forward_backward_async(datums, loss_fn="importance_sampling")
                with log_stage("modal", "Optimizer step on trainer GPU", run_id=run_id, step=step):
                    optim_future = await training_client.optim_step_async(adam_params)
                with log_stage("modal", "Await forward/backward result", run_id=run_id, step=step):
                    fwdbwd_result = await fwdbwd_future.result_async()
                with log_stage("modal", "Await optimizer result", run_id=run_id, step=step):
                    await optim_future.result_async()
                mean_logprob, mean_ratio = policy_loss_summary(fwdbwd_result.loss_fn_outputs)
            else:
                log("run", "Skipped optimizer step (degenerate or empty group).", run_id=run_id, step=step)

            reward_mean = sum(rewards) / len(rewards) if rewards else 0.0
            emit_event("training", step, f"Live training step {step} completed.", {
                "reward_mean": reward_mean,
                "reward_min": min(rewards) if rewards else 0.0,
                "reward_max": max(rewards) if rewards else 0.0,
                "judge_calls": judge_calls,
                "judge_cache_hits": judge_cache.hits,
                "degenerate_group_rate": degenerate_groups / max(len(prompt_records), 1),
                "policy_mean_logprob": mean_logprob,
                "policy_mean_ratio": mean_ratio,
            })
            update_state(status="running", completedSteps=step, currentPhase="training")

            if step % int(job["checkpointInterval"]) == 0:
                with log_stage("modal", "Save checkpoint sampler weights", run_id=run_id, step=step):
                    await training_client.save_sampler_with_download_url_async(name=f"{job['runId']}-step-{step}")
                emit_event("checkpointing", step, "Live checkpoint saved.", {"checkpoint_step": step})
                await run_eval(step)
            log("run", "Training step finished.", run_id=run_id, step=step, reward_mean=reward_mean)

        with log_stage("modal", "Save final sampler weights", run_id=run_id):
            await training_client.save_sampler_with_download_url_async(name=f"{job['runId']}-final")
        await run_eval(int(job["totalSteps"]))
        Path(job["runDir"], "judge_cache_summary.json").write_text(json.dumps(judge_cache.summary(), indent=2) + "\n", encoding="utf-8")
        update_state(status="completed", finishedAt="now", currentPhase="completed")
        log("run", "Live training completed.", run_id=run_id)
    finally:
        with log_stage("modal", "Close ServiceClient and Modal runner", run_id=run_id):
            service_client.close()
