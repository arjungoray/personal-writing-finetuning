# Personal Writing Fine-Tuning

Local single-user app for building a writing style profile, generating RL fine-tuning datasets, running `ray-unsloth` training, and monitoring progress.

## Quick Start

```bash
npm install
npm run dev
```

The app binds to `127.0.0.1` by default. Runtime data is stored under `.voice-lab/`, which is ignored by git.

## Environment

Copy `.env.example` to `.env.local` and fill in values as needed:

```bash
GROQ_API_KEY=
GENERATOR_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
JUDGE_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
RAY_UNSLOTH_PATH=/Users/arjungoray/Developer/ray-unsloth
```

Mock mode is available for local UI flows and tests without calling Groq.
