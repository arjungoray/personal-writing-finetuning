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
GEMINI_API_KEY=
GENERATOR_MODEL=gemini-3-flash-preview
JUDGE_MODEL=gemini-3-flash-preview
RAY_UNSLOTH_PATH=/Users/arjungoray/Developer/Ray-Unsloth
```

Mock mode is available for local UI flows and tests without calling Gemini.
