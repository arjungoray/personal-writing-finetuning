from __future__ import annotations

import argparse
import json
from pathlib import Path

from extraction import extract_text


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    args = parser.parse_args()
    result = extract_text(Path(args.path))
    print(json.dumps({"text": result.text, "warnings": result.warnings}))


if __name__ == "__main__":
    main()
