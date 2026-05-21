#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
python3 -m venv worker/.venv
worker/.venv/bin/python -m pip install --upgrade pip

echo "Worker virtual environment created at worker/.venv"
