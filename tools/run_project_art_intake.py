#!/usr/bin/env python3
"""Execute an exact, create-only project-art intake plan."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from project_art_intake_contract import MAXIMUM_PLAN_BYTES, fail
from project_art_intake_execution import execute

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()
    try:
        plan_path = args.plan.resolve(strict=True)
        if plan_path.is_symlink() or not plan_path.is_file():
            fail("Plan must be a regular non-symbolic file.")
        plan_bytes = plan_path.read_bytes()
        if len(plan_bytes) > MAXIMUM_PLAN_BYTES:
            fail("Plan exceeds the maximum byte length.")
        plan = json.loads(plan_bytes.decode("utf-8-sig"))
        output_root = Path(os.path.abspath(args.output_root))
        receipt = execute(plan, plan_bytes, output_root)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Project-art intake failed: {exc}", file=sys.stderr)
        return 2
    print(
        json.dumps(
            {
                "status": "passed",
                "schema": receipt["schema"],
                "sessionId": receipt["sessionId"],
                "sourceCount": receipt["sourceCount"],
                "receiptSha256": receipt["receiptSha256"],
                "outputRoot": receipt["outputRoot"],
                "storageWrite": False,
                "repositoryMutation": False,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
