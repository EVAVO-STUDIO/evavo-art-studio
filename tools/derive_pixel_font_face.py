#!/usr/bin/env python3
"""Derive a denser authored pixel-font face without raster resampling.

This utility operates on Pixel Font Studio v2 face masters. It scales complete
pixel cells, can add a controlled right-hand weight, and updates every metric.
The result remains an explicit bitmap master suitable for seal-face and the
normal deterministic build/QA pipeline.
"""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path


def parse_codepoint_ranges(value: str) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    for token in value.split(","):
        token = token.strip().upper()
        if not token:
            continue
        parts = token.split("-", 1)
        start = int(parts[0].removeprefix("U+"), 16)
        end = int(parts[-1].removeprefix("U+"), 16)
        if start > end or start < 0 or end > 0x10FFFF:
            raise argparse.ArgumentTypeError(f"invalid Unicode range: {token}")
        ranges.append((start, end))
    if not ranges:
        raise argparse.ArgumentTypeError("at least one Unicode range is required")
    return ranges


def is_selected(codepoint: int, ranges: list[tuple[int, int]] | None) -> bool:
    return ranges is None or any(start <= codepoint <= end for start, end in ranges)


def load(path: Path) -> dict:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def scale_bitmap(rows: list[str], scale_x: int, scale_y: int, weight: int) -> list[str]:
    source = [[cell == "#" for cell in row] for row in rows]
    width = len(source[0]) * scale_x + weight
    height = len(source) * scale_y
    target = [[False] * width for _ in range(height)]
    for y, row in enumerate(source):
        for x, active in enumerate(row):
            if not active:
                continue
            for yy in range(y * scale_y, (y + 1) * scale_y):
                for xx in range(x * scale_x, (x + 1) * scale_x + weight):
                    target[yy][xx] = True
    return ["".join("#" if cell else "." for cell in row) for row in target]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--family-id", required=True)
    parser.add_argument("--face-id", required=True)
    parser.add_argument("--display-name", required=True)
    parser.add_argument("--scale-x", type=int, default=1)
    parser.add_argument("--scale-y", type=int, default=1)
    parser.add_argument("--weight", type=int, default=0)
    parser.add_argument(
        "--codepoint-ranges",
        type=parse_codepoint_ranges,
        help="Optional comma-separated inclusive ranges such as U+0020-U+007E.",
    )
    args = parser.parse_args()
    if args.scale_x < 1 or args.scale_y < 1 or args.weight < 0:
        parser.error("scale values must be positive and weight must be non-negative")

    document = load(Path(args.input))
    document["familyId"] = args.family_id
    document["faceId"] = args.face_id
    document["displayName"] = args.display_name
    sx, sy, weight = args.scale_x, args.scale_y, args.weight
    selected_ranges = args.codepoint_ranges
    for glyph in document["glyphs"]:
        if not is_selected(glyph["codepoint"], selected_ranges):
            continue
        glyph["bitmap"] = scale_bitmap(glyph["bitmap"], sx, sy, weight)
        glyph["width"] = glyph["width"] * sx + weight
        glyph["height"] *= sy
        glyph["xOffset"] *= sx
        glyph["yOffset"] *= sy
        glyph["xAdvance"] = glyph["xAdvance"] * sx + weight
    metrics = document["metrics"]
    for key in ("ascent", "descent", "baseline", "lineHeight", "capHeight", "xHeight"):
        metrics[key] *= sy
    if is_selected(0x20, selected_ranges):
        metrics["spaceAdvance"] = metrics["spaceAdvance"] * sx + weight
    for pair in document.get("kerning", []):
        pair["amount"] *= sx

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise SystemExit(f"output already exists: {output}")
    output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
