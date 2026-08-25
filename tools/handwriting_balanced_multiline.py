from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from tools import handwriting_multiline as multiline_tool
    from tools.handwriting_realistic_render import render_text as balanced_render_text
except ModuleNotFoundError:  # direct `python tools/handwriting_balanced_multiline.py`
    import handwriting_multiline as multiline_tool  # type: ignore
    from handwriting_realistic_render import render_text as balanced_render_text  # type: ignore

SCHEMA = multiline_tool.SCHEMA


def render_multiline(*args, **kwargs):
    receipt = kwargs.get("receipt")
    original = multiline_tool.render_text
    multiline_tool.render_text = balanced_render_text
    try:
        result = multiline_tool.render_multiline(*args, **kwargs)
    finally:
        multiline_tool.render_text = original
    result["variantSelection"] = {
        "mode": "deterministic-shuffled-genuine-variant-bag-v1",
        "balancedPerLine": True,
    }
    if receipt is not None:
        receipt_path = Path(receipt)
        receipt_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render multiline genuine handwriting with balanced captured-variant usage")
    parser.add_argument("atlas")
    parser.add_argument("text")
    parser.add_argument("output")
    parser.add_argument("--seed", required=True)
    parser.add_argument("--style")
    parser.add_argument("--line-spacing-factor", type=float, default=0.55)
    parser.add_argument("--proof")
    parser.add_argument("--receipt")
    args = parser.parse_args(argv)
    try:
        result = render_multiline(
            Path(args.atlas),
            args.text,
            Path(args.output),
            seed=args.seed,
            style=args.style or None,
            line_spacing_factor=args.line_spacing_factor,
            proof=Path(args.proof) if args.proof else None,
            receipt=Path(args.receipt) if args.receipt else None,
        )
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
