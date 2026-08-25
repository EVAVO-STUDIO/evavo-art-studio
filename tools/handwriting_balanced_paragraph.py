from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from tools import handwriting_paragraph as paragraph_tool
    from tools.handwriting_balanced_multiline import render_multiline as balanced_render_multiline
except ModuleNotFoundError:  # direct `python tools/handwriting_balanced_paragraph.py`
    import handwriting_paragraph as paragraph_tool  # type: ignore
    from handwriting_balanced_multiline import render_multiline as balanced_render_multiline  # type: ignore

SCHEMA = paragraph_tool.SCHEMA


def render_paragraph(*args, **kwargs):
    original = paragraph_tool.render_multiline
    paragraph_tool.render_multiline = balanced_render_multiline
    try:
        result = paragraph_tool.render_paragraph(*args, **kwargs)
    finally:
        paragraph_tool.render_multiline = original
    result["variantSelection"] = {
        "mode": "deterministic-shuffled-genuine-variant-bag-v1",
        "balancedAcrossEachWrappedLine": True,
    }
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Wrap and render genuine handwriting paragraphs with balanced captured-variant usage")
    parser.add_argument("atlas")
    parser.add_argument("text")
    parser.add_argument("output")
    parser.add_argument("--seed", required=True)
    parser.add_argument("--max-width-px", required=True, type=int)
    parser.add_argument("--style")
    parser.add_argument("--line-spacing-factor", type=float, default=0.55)
    parser.add_argument("--proof")
    parser.add_argument("--receipt")
    args = parser.parse_args(argv)
    try:
        result = render_paragraph(
            Path(args.atlas),
            args.text,
            Path(args.output),
            seed=args.seed,
            max_width_px=args.max_width_px,
            style=args.style or None,
            line_spacing_factor=args.line_spacing_factor,
            proof=Path(args.proof) if args.proof else None,
            receipt=Path(args.receipt) if args.receipt else None,
        )
        if args.receipt:
            Path(args.receipt).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
