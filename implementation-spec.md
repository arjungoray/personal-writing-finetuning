# Personal Writing Fine-Tuning App Implementation Spec

## Purpose

Build a local single-user app that lets a user upload examples of their writing, infer and approve a style profile, generate an RL fine-tuning dataset, run RL training through `ray-unsloth`, and monitor training progress in a polished UI.

The app trains a writing coach model that can respond to tasks such as:

- rewrite this better
- make this sound like me
- write an email with these points
- generate a paragraph with these requirements
- improve clarity while preserving meaning

The hardest and highest-priority pieces are dataset generation, LLM-as-judge reward design, RL training integration, and detailed progress observability.

## V1 Scope

V1 is a standalone local app built from scratch in this repository:

```text
/Users/arjungoray/Developer/personal-writing-finetuning
```

The app imports `ray-unsloth` as the training backend from:

```text
~/Developer/Ray-Unsloth
```

Active v1 training support is limited to the `qwen3.5-4b` model using the Ray-Unsloth 4B/L4 config:

```text
~/Developer/Ray-Unsloth/configs/qwen3_5_4b_1x_l4.yaml
```

The UI should be built with an obvious model/config selector so future configs can be added cleanly, but only the 4B option is active in v1.

## Architecture

Use this split:

```text
Next.js app
  UI
  local API routes
  upload and artifact management
  Mastra AI orchestration
  run/process control

Mastra AI layer
  Gemini-backed profile generation
  Gemini-backed dataset generation
  Gemini-backed LLM judge calls
  configurable generator_model and judge_model

Python worker
  text extraction helpers where Python is better
  canonical deterministic style scorer
  RL training loop
  ray_unsloth import and training client calls
  run event emission
```

The Python worker is launched as a per-job spawned process, not a long-running worker service.

The Next.js API writes a job spec JSON, spawns something equivalent to:

```bash
python worker/train.py --job .voice-lab/runs/<run_id>/job.json
```

and captures logs/events for the UI.

## Local Data Storage

App data lives under `.voice-lab/` by default and must be gitignored.

Suggested shape:

```text
.voice-lab/
  uploads/
  writings/
  profiles/
  datasets/
  runs/
  models/
  judge-cache/
  playground/
  settings.json
  index.json
```

The app should include a settings option to move the data directory later.

No database is required for v1. Use filesystem JSON/JSONL artifacts as the source of truth, plus lightweight metadata indexes for UI listing.

## Git And Secrets

This is a public project. Include a strict `.gitignore`.

At minimum ignore:

```text
.env*
!.env.example
.voice-lab/
.next/
node_modules/
__pycache__/
*.pyc
.venv/
dist/
build/
coverage/
.DS_Store
```

Include `.env.example` with placeholders:

```text
GEMINI_API_KEY=
GENERATOR_MODEL=gemini-3-flash-preview
JUDGE_MODEL=gemini-3-flash-preview
RAY_UNSLOTH_PATH=/Users/arjungoray/Developer/Ray-Unsloth
```

API keys must come from environment variables only. Do not persist API keys in `.voice-lab/settings.json`.

Non-secret settings such as model names, data directory, and active config can be stored locally.

## First-Run Setup Checklist

The UI should include a first-run setup checklist:

- Gemini API key detected
- Mastra model config validated
- Ray-Unsloth path found/importable
- Modal configured
- 4B config available
- data directory initialized
- mock mode available

Gemini validation should happen when the user opens Settings or starts an AI job, not on every app boot.

## AI Provider Defaults

Use Mastra for AI orchestration so model switching is easy.

Default both generator and judge to:

```text
gemini-3-flash-preview
```

Expose separate editable settings:

```text
generator_model
judge_model
```

## Input And Text Extraction

Allow uploaded writing samples in multiple formats:

- pasted text
- `.txt`
- `.md`
- accessible-text PDFs
- DOCX or other rich formats if clean readable text can be extracted

For PDFs:

- support PDFs with accessible text
- no OCR required
- ignore images and unreadable content

For rich documents:

- extract readable text only
- preserve paragraph breaks when reliable
- ignore layout, images, and tables unless they produce clean text
- surface extraction warnings such as unreadable pages or skipped tables

All extracted writing must be shown back to the user for review/editing before style profile generation.

## Corpus Size Policy

Word count thresholds:

- below 1,000 words: block RL training unless the user explicitly enables an unsafe small-sample override
- 1,000+ words: allow dataset generation
- below 3,000 words: warn that style estimates may be unstable
- 5,000+ words: preferred for better style confidence

## Style Profile Workflow

The flow is:

```text
uploaded writings
  -> extracted/reviewed text
  -> style profile generation
  -> user review/edit/approval
  -> dataset generation
  -> dataset review/approval
  -> RL training
```

Generate a style profile before dataset generation. The approved profile is the source of truth for prompts, rubrics, reference selection, and reward judging.

The profile has two separated sections.

### Analytic Style Profile

Capture measurable traits:

- sentence length distribution
- punctuation habits
- paragraph structure
- function-word patterns
- diction
- syntax/POS patterns
- readability
- sample excerpts
- modes/registers such as email, essay, technical note, casual message

### Actionable Coaching Rules

Translate analysis into training guidance:

- prefer X
- avoid Y
- when rewriting, preserve Z
- transition patterns to use
- bad formatting examples
- style violations that should receive negative reward

The profile must be directly editable. Regeneration should be available per section. Approved profile versions must be hashed/versioned so downstream datasets know exactly which profile version they used.

## User Directives

Support explicit user style preferences as first-class inputs, stored separately from inferred analysis.

Examples:

- Never use em dashes.
- Prefer short paragraphs.
- Make emails warmer than essays.
- Do not mimic typos from source writing.
- Avoid sounding corporate.

User directives feed profile generation, dataset generation, and reward judging.

## Writing Modes

Support multiple writing modes as auto-detected and editable tags in v1.

Examples:

- email
- essay
- technical note
- casual message

V1 still trains one adapter per training run. Do not split separate adapters per mode yet.

Mode tags should influence reference excerpt selection and dataset stratification.

## Dataset Generation

Generated datasets are explicit reusable frozen dataset versions.

Each dataset version freezes:

- style profile hash
- generator model
- prompt mix
- prompt count
- reference excerpt selections
- rubric version
- train/eval split
- seed
- generation timestamp

Each training run selects a dataset version. Do not silently regenerate prompts per run.

Use JSONL artifacts with full provenance as the source of truth, plus lightweight metadata indexes for the UI.

V1 dataset files:

```text
rl_prompts.jsonl
eval_prompts.jsonl
metadata.json
```

No SFT anchors in v1. Use RL only.

## Dataset Review

Dataset generation requires user approval before training.

The UI should allow:

- inspect prompt records by task type
- bulk approve
- regenerate selected records
- delete selected records
- approve/freeze the dataset version

## Prompt Record Design

Train prompts should not include hidden reference excerpts.

Each record stores reference excerpts for reward/provenance, but the trainable model does not see those excerpts in the prompt.

Reason: the model should learn the user voice as policy behavior, not depend on nearby examples or copy references.

Each prompt record should include:

- id
- split
- task type
- writing mode tags
- prompt text shown to the trainable model
- selected reference excerpt ids/hashes
- expected traits
- negative criteria
- profile version hash
- generator model
- generation seed
- generation timestamp

## Task Mix

Default v1 task mix:

```text
35% rewrite in my voice
25% write from bullets/requirements
15% improve clarity while preserving meaning
10% change tone/intensity while staying in my style
10% email/message generation
5% summarize or expand in my style
```

Default prompt count:

```text
Small: 80 prompts
Default: 200 prompts
Large: 500 prompts
Custom
```

Default is 200 prompts total:

```text
160 train
40 eval
```

Use an 80/20 train/eval split stratified by task type.

## Reward Design

Use LLM judge for every rollout completion in the hot RL reward loop. This is not optional in v1.

The reward combines:

```text
style similarity as largest component
instruction following
task fulfillment/content preservation
format quality
deterministic hard negative gates
```

Recommended judge-facing composition:

```text
0.60 * style_similarity
+ 0.25 * instruction_following
+ 0.15 * task_fulfillment
```

Format quality can either be a reported subscore or folded into final score/violations.

Use deterministic style metrics as evidence supplied to the LLM judge. The deterministic scorer does not independently own the final reward.

Canonical final reward:

```text
reward = normalized_llm_judge_score - penalties
```

The LLM judge returns 0-100 scores. The app maps final score to `[-1, 1]`:

```text
reward = (final_score / 50) - 1
```

Then apply deterministic hard gates.

## Deterministic Style Evidence

The Python scorer computes the canonical style metrics:

- function-word similarity
- character 3/4/5-gram similarity
- punctuation profile
- sentence rhythm
- lexical profile
- syntax/POS n-grams
- readability and density
- paragraph structure
- semantic similarity separately as a control

Style similarity should compare each completion against:

```text
70% selected relevant reference excerpts
30% aggregate approved style profile targets
```

The selected excerpts should match task type, writing mode, length, and formality where possible.

## LLM Judge Record

Store structured JSON judgment for every sampled completion:

```json
{
  "style_similarity": 0,
  "instruction_following": 0,
  "task_fulfillment": 0,
  "format_quality": 0,
  "final_score": 0,
  "reward": 0,
  "violations": [],
  "positive_style_evidence": [],
  "negative_style_evidence": [],
  "brief_rationale": ""
}
```

The training loop uses `reward`. The UI uses the full judgment record for observability.

## Hard Negative Gates

Apply these deterministic gates outside the judge:

```text
empty output: -1
refusal/meta-commentary: -1
not in requested format when required: -1
copies hidden reference excerpt too closely: -0.3
contains training/debug chatter: -1
invalid JSON/structured format when requested: -1
```

Do not include a severe-length hard penalty. Length can be part of the LLM judge rubric, but should not force a deterministic cap.

## Judge Cache

Exact-hash judge caching is required in v1.

Cache key must include at least:

- prompt text
- completion text
- approved style profile hash
- rubric version/hash
- selected reference excerpt ids/hashes
- deterministic metric evidence hash
- judge provider/model
- judge prompt version

Caching supports reproducibility, resume, duplicate avoidance, and debugging.

## RL Training Loop

Keep the training shape close to `Ray-Unsloth/examples/tinker_first_rl_training.py`.

For each step:

1. Stratified random sample prompts by task type.
2. Use live policy sampler.
3. Sample a group of completions per prompt.
4. Compute deterministic style evidence.
5. Call LLM judge for every completion.
6. Apply hard negative gates.
7. Map judge score to reward.
8. Compute group-relative advantages.
9. Skip or retry degenerate groups.
10. Build RL `Datum` records with:
    - `target_tokens`
    - old policy `logprobs`
    - `advantages`
    - `weights`
11. Call `forward_backward_async(..., loss_fn="importance_sampling")`.
12. Call `optim_step_async`.
13. Emit events and metrics.
14. Save checkpoint on interval.

Default group size:

```text
4 completions per prompt
```

Use stratified random prompt sampling for v1. Later, add weighting by weak eval areas.

Only one active training run is allowed at a time in v1.

## Resume And Cancellation

Support resume only from completed step checkpoints.

After each completed optimizer step:

- save checkpoint when interval requires it
- save run state
- flush judge cache
- flush events

Support cancellation:

- graceful cancellation first
- force kill fallback

The API marks a run as `cancel_requested`. The worker finishes the current atomic operation if possible, flushes state, and exits. If it does not respond within a timeout, kill the spawned process.

## Checkpoints And Export

Checkpoint interval is configurable.

Default:

```text
every 5 completed optimizer steps plus final checkpoint
```

Allow export of a complete run bundle:

```text
approved_style_profile.json
dataset_version/
training_config.json
judge_cache_summary.json
run_events.jsonl
eval_report.json
final_lora_adapter/
README.md
```

## Evaluation

Run eval both periodically during training and at the end.

Default periodic eval:

```text
every 5 optimizer steps
```

Eval uses held-out `eval_prompts.jsonl`, samples completions, judges with the same LLM judge, logs subscore trends, and never updates model weights.

## Progress UI

Expose detailed RL internals in a polished UI.

Minimum panels:

- run timeline
- current phase: sampling, judging, training, checkpointing, eval
- reward mean/min/max/std
- style/instruction/task subscore trends
- judge calls
- judge cache hits
- generator/judge token usage
- degenerate group rate
- advantage distribution
- policy mean logprob and ratio
- sampled completions with judge rationales
- eval prompt results
- checkpoint/artifact list
- Modal cost estimate

This should be visually refined, but it must not hide the RL mechanics behind only a spinner.

## Cost UI

Show GPU estimate and LLM usage separately.

Panels should include:

- Modal GPU estimate
- generator model token usage
- judge model token usage
- total judge calls
- cache hit rate

Modal pricing should be manually maintained in v1 with a source URL and last-verified date shown in the UI.

Last verified:

```text
2026-05-19
```

Source:

```text
https://modal.com/pricing
```

Current relevant rates:

```text
Nvidia L4: $0.000222/sec = about $0.7992/hr
Nvidia A100 40 GB: $0.000583/sec = about $2.0988/hr
Nvidia A100 80 GB: $0.000694/sec = about $2.4984/hr
```

Also note:

- Starter includes $30/month free compute
- region selection can be 1.5-1.75x base prices
- non-preemptible execution can be 3x base prices

The UI should frame this as estimated Modal GPU cost and link to Modal pricing.

## Playground

Include a narrow post-training playground in v1.

It should compare:

- base model output
- trained adapter output
- optional user reference excerpt
- judge/style score report

Support prompts like:

- rewrite this better
- make this sound like me
- write an email
- custom prompt

Playground results can be saved optionally under `.voice-lab/playground/`.

Saved data may include:

- prompt
- outputs
- scores
- selected model/run id

Include delete controls.

## Reproducibility

Include seed controls:

- dataset generation seed
- training seed

Store seeds in every relevant dataset/run artifact.

LLM outputs are not perfectly reproducible, but deterministic sampling, prompt ordering, train/eval split, and mock mode should be reproducible.

## Security And Privacy Choices

V1 is local-only and single-user.

No auth/password protection in v1. Bind the dev server to localhost and do not expose it on the network by default.

No encryption at rest in v1. Storage is local under `.voice-lab/`, gitignored. Design storage so encryption can be added later if needed.

Do not add prominent privacy warning UI in v1.

## Python Environment

The worker owns a local `.venv`, documented through setup scripts.

The worker uses:

```text
RAY_UNSLOTH_PATH=/Users/arjungoray/Developer/Ray-Unsloth
```

and prepends:

```text
$RAY_UNSLOTH_PATH/src
```

to `PYTHONPATH` before importing `ray_unsloth`.

Do not assume `ray-unsloth` is installed globally.

## Mock Mode

Mock Gemini/Mastra mode is required.

Tests and demos should not call Gemini.

Mock mode should provide deterministic:

- style profile generation
- dataset record generation
- judge outputs
- usage counters

The whole UI should be explorable without API keys, except actual model training.

## Tests

Include automated tests from the start, focused on risky backend paths.

Minimum v1 tests:

- text extraction for txt/md/pdf/docx
- style scorer deterministic outputs
- reward mapping 0-100 to `[-1, 1]`
- hard penalty gates
- judge cache key stability
- dataset split stratification
- worker job state transitions

UI tests can be lighter initially.

## Recommended Initial File Structure

```text
.
  README.md
  docs/
    implementation-spec.md
  .gitignore
  .env.example
  package.json
  next.config.*
  src/
    app/
    components/
    lib/
      store/
      runs/
      datasets/
      pricing/
    ai/
      mastra/
      agents/
      workflows/
  worker/
    pyproject.toml
    train.py
    scorer/
    extraction/
    rewards/
    tests/
  scripts/
    setup-worker-venv.*
```

## V1 Done Criteria

V1 is done when the app can:

1. run locally as a Next.js app
2. initialize `.voice-lab/`
3. load env-based Gemini/Mastra config
4. validate settings on demand
5. upload/extract/review writing samples
6. enforce corpus size policy
7. generate an editable style profile
8. approve and version a style profile
9. generate a JSONL RL dataset version
10. review and approve dataset records
11. start a full UI-launched Ray-Unsloth RL training run
12. judge every rollout completion with Gemini through Mastra
13. cache structured judge records
14. show detailed training progress and cost/usage
15. run periodic and final eval
16. checkpoint and resume from completed steps
17. cancel runs gracefully with force kill fallback
18. export a complete run bundle
19. use the narrow post-training playground
20. pass focused backend tests and mock-mode flows

## Implementation Checklist

Status key:

- [x] Implemented in the current stack
- [~] Partially implemented; usable slice exists but spec coverage is incomplete
- [ ] Not implemented yet

### Foundation

- [x] Strict public-project `.gitignore`
- [x] `.env.example` with Gemini, model, and Ray-Unsloth placeholders
- [x] Next.js app scaffold bound to localhost by default
- [x] First-run checklist surface
- [x] Modal pricing reference with source and last-verified date
- [x] Mock mode available without API keys
- [~] Interactive UI for mock profile, dataset, and run flow

### Local Storage

- [x] `.voice-lab/` initialized on first write
- [x] Filesystem JSON artifacts as source of truth
- [x] Non-secret settings persisted locally
- [x] API keys read only from environment variables
- [x] Writing sample records with metadata and corpus policy
- [~] Settings option to move the data directory

### Writing Inputs And Extraction

- [x] Pasted-text writing sample creation
- [x] `.txt` and `.md` extraction helper in Python worker
- [x] PDF accessible-text extraction helper in Python worker
- [x] DOCX readable-text extraction helper in Python worker
- [x] Browser upload UI for txt/md/pdf/docx
- [x] Extraction API route that stores uploads and warnings
- [x] User review/edit screen before style profile generation

### Corpus Policy

- [x] Word count calculation
- [x] Block training below 1,000 words unless override is enabled
- [x] Warn below 3,000 words
- [x] Mark 5,000+ words as preferred
- [x] UI control for unsafe small-sample override

### Style Profile

- [x] Mock style profile generation
- [x] Separate analytic and coaching-rule sections in artifact shape
- [x] User directives stored separately in profile artifact
- [x] Profile hash/version metadata
- [x] Profile approval API
- [x] Profile edit UI
- [x] Per-section regeneration UI
- [x] Live Gemini/Mastra profile generation

### Dataset Generation And Review

- [x] Mock JSONL dataset generation
- [x] Frozen metadata with profile hash, generator model, count, mix, split, seed, timestamp
- [x] Train/eval JSONL artifacts
- [x] Default task mix
- [x] Dataset approval API
- [x] Dataset review UI by task type
- [x] Bulk approve/regenerate/delete selected records
- [x] Live Gemini/Mastra dataset generation

### Reward Design And Judge

- [x] Deterministic style evidence scorer
- [x] Reward mapping from 0-100 to `[-1, 1]`
- [x] Hard negative gates
- [x] Stable exact-hash judge cache key
- [x] Persistent judge cache records
- [~] Live Gemini/Mastra LLM judge
- [~] Structured judgment records for every sampled completion
- [~] Token usage accounting

### Training Runs

- [x] Per-job spawned Python worker process
- [x] Job spec JSON under `.voice-lab/runs/<run_id>/job.json`
- [x] Mock worker event emission
- [x] One active run enforced
- [x] Run cancellation signaling
- [~] Progress UI reads mock run events
- [x] Force-kill cancellation fallback
- [~] Resume from completed step checkpoints
- [~] Ray-Unsloth import and live training loop
- [~] LLM judge call for every rollout completion
- [x] Group-relative advantage computation
- [x] `forward_backward_async(..., loss_fn="importance_sampling")`
- [x] `optim_step_async`
- [~] Real checkpoint save interval
- [~] Periodic and final eval against held-out prompts

### Export And Playground

- [x] Complete run bundle export
- [x] Post-training playground UI
- [x] Base model vs trained adapter comparison
- [x] Optional saved playground results and delete controls

### Tests

- [x] Text extraction tests for txt/md/pdf/docx
- [x] Style scorer deterministic output tests
- [x] Reward mapping tests
- [x] Hard penalty gate tests
- [x] Judge cache key stability tests
- [x] Dataset split stratification tests
- [x] Worker job state transition tests
- [x] UI interaction tests
