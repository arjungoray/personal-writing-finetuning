# Worker

Python worker code is spawned per job by the Next.js API.

V1 training will run with:

```bash
python worker/train.py --job .voice-lab/runs/<run_id>/job.json
```

The worker prepends `$RAY_UNSLOTH_PATH/src` before importing `ray_unsloth`; it does not assume a global install.
