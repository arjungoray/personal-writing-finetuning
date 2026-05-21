from __future__ import annotations

import sys
import time
import traceback
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator


def _format_details(details: dict[str, Any]) -> str:
    if not details:
        return ""
    return " " + " ".join(f"{key}={value}" for key, value in details.items())


def log(stage: str, message: str, **details: Any) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[voice-lab] {timestamp} [{stage}] {message}{_format_details(details)}", file=sys.stderr, flush=True)


def log_exception(stage: str, message: str, error: BaseException | None = None, **details: Any) -> None:
    log(stage, message, **details)
    if error is None:
        traceback.print_exc(file=sys.stderr)
    else:
        traceback.print_exception(type(error), error, error.__traceback__, file=sys.stderr)
    sys.stderr.flush()


@contextmanager
def log_stage(stage: str, message: str, **details: Any) -> Iterator[None]:
    log(stage, f"start: {message}", **details)
    started = time.monotonic()
    try:
        yield
    except Exception as error:
        elapsed_s = round(time.monotonic() - started, 2)
        log(stage, f"failed: {message}", error=error, elapsed_s=elapsed_s, **details)
        raise
    else:
        elapsed_s = round(time.monotonic() - started, 2)
        log(stage, f"finish: {message}", elapsed_s=elapsed_s, **details)
