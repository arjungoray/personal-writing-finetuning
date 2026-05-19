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

from scorer import score_style_evidence
from judge_cache import JudgeCacheInput, JudgeCacheStore


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
    with urlrequest.urlopen(req, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


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
    if not prompts:
        raise ValueError("No training prompts found in dataset.")

    service_client = ServiceClient(config=job["configPath"])
    try:
        training_client = await service_client.create_lora_training_client_async(base_model="qwen3.5-4b", rank=16)
        tokenizer = training_client.get_tokenizer()
        sampler = await training_client.create_live_sampling_client_async(name=f"{job['runId']}-live")
        sampling_params = SamplingParams(max_tokens=256, temperature=0.8, logprobs_max_tokens=256)
        adam_params = AdamParams(learning_rate=4e-5, beta1=0.9, beta2=0.95, max_grad_norm=1.0)
        group_size = int(job.get("groupSize", 4))

        for step in range(1, int(job["totalSteps"]) + 1):
            prompt_records = [prompts[(step + offset) % len(prompts)] for offset in range(1)]
            datums = []
            rewards: list[float] = []
            degenerate_groups = 0
            judge_calls = 0

            for record in prompt_records:
                prompt = encode_prompt(tokenizer, record.prompt_text)
                sample_result = await sampler.sample_async(prompt=prompt, num_samples=group_size, sampling_params=sampling_params)
                sequences = list(sample_result.sequences)
                group_rewards: list[float] = []
                group_payloads: list[tuple[Any, str, float]] = []
                for sequence in sequences:
                    tokens = list(sequence.tokens)
                    text = sequence.text or tokenizer.decode(tokens, skip_special_tokens=True)
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
                        judgment = post_judge(job["appBaseUrl"], record.prompt_text, text, evidence)
                        judge_cache.put(cache_input, judgment)
                    else:
                        judgment = cached["judgment"]
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
                fwdbwd_future = await training_client.forward_backward_async(datums, loss_fn="importance_sampling")
                optim_future = await training_client.optim_step_async(adam_params)
                fwdbwd_result = await fwdbwd_future.result_async()
                await optim_future.result_async()
                mean_logprob, mean_ratio = policy_loss_summary(fwdbwd_result.loss_fn_outputs)

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
                await training_client.save_sampler_with_download_url_async(name=f"{job['runId']}-step-{step}")
                emit_event("checkpointing", step, "Live checkpoint saved.", {"checkpoint_step": step})

        await training_client.save_sampler_with_download_url_async(name=f"{job['runId']}-final")
        emit_event("eval", int(job["totalSteps"]), "Final live eval placeholder completed.", {"eval_reward_mean": 0.0})
        Path(job["runDir"], "judge_cache_summary.json").write_text(json.dumps(judge_cache.summary(), indent=2) + "\n", encoding="utf-8")
        update_state(status="completed", finishedAt="now", currentPhase="completed")
    finally:
        service_client.close()
