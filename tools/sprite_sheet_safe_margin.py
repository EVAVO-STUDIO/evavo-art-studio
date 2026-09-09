#!/usr/bin/env python3
"""Translate grid-cell sprites away from crop edges without scaling or redrawing."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def matte_colour(cell: Image.Image) -> tuple[int, int, int]:
    rgb = cell.convert("RGB")
    samples = Image.new("RGB", (4, 1))
    points = ((0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1))
    for index, point in enumerate(points):
        samples.putpixel((index, 0), rgb.getpixel(point))
    return tuple(int(value) for value in ImageStat.Stat(samples).median)


def foreground_bbox(cell: Image.Image, matte: tuple[int, int, int], threshold: int):
    difference = ImageChops.difference(cell.convert("RGB"), Image.new("RGB", cell.size, matte))
    return difference.convert("L").point(lambda value: 255 if value >= threshold else 0).getbbox()


def required_shift(bbox: tuple[int, int, int, int], size: tuple[int, int], margin: int) -> tuple[int, int]:
    left, top, right, bottom = bbox
    width, height = size
    min_dx, max_dx = margin - left, width - margin - right
    min_dy, max_dy = margin - top, height - margin - bottom
    if min_dx > max_dx or min_dy > max_dy:
        raise RuntimeError(f"foreground cannot fit requested {margin}px margin without scaling: bbox={bbox} size={size}")
    return min(max(0, min_dx), max_dx), min(max(0, min_dy), max_dy)


def repair(source: Path, output: Path, columns: int, rows: int, gutter: int, margin: int, threshold: int) -> dict:
    image = Image.open(source).convert("RGB")
    if image.width % columns or image.height % rows:
        raise RuntimeError("sheet dimensions must divide evenly into the declared grid")
    cell_width, cell_height = image.width // columns, image.height // rows
    result, records = image.copy(), []
    for row in range(rows):
        for column in range(columns):
            outer = (column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height)
            cell = image.crop(outer)
            inner_box = (gutter, gutter, cell_width - gutter, cell_height - gutter)
            inner = cell.crop(inner_box)
            matte = matte_colour(inner)
            before = foreground_bbox(inner, matte, threshold)
            if before is None:
                raise RuntimeError(f"cell {row},{column} has no foreground")
            dx, dy = required_shift(before, inner.size, margin)
            shifted = inner.transform(inner.size, Image.Transform.AFFINE, (1, 0, -dx, 0, 1, -dy), fillcolor=matte)
            after = foreground_bbox(shifted, matte, threshold)
            if after is None or min(after[0], after[1], inner.width - after[2], inner.height - after[3]) < margin:
                raise RuntimeError(f"cell {row},{column} still violates requested margin: {after}")
            cell.paste(shifted, (gutter, gutter))
            result.paste(cell, outer[:2])
            records.append({"row": row, "column": column, "before_bbox": list(before), "after_bbox": list(after), "translation": [dx, dy], "matte_rgb": list(matte)})
    output.parent.mkdir(parents=True, exist_ok=True)
    result.save(output)
    report = {"schema": "evavo.sprite-sheet-safe-margin.v1", "source": str(source), "source_sha256": digest(source), "output": str(output), "output_sha256": digest(output), "grid": [columns, rows], "gutter_px": gutter, "required_inner_margin_px": margin, "foreground_difference_threshold": threshold, "operation": "cell_translation_only_no_scale_no_redraw_no_mirror", "cells": records}
    output.with_suffix(output.suffix + ".safe-margin.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--columns", required=True, type=int)
    parser.add_argument("--rows", required=True, type=int)
    parser.add_argument("--gutter", type=int, default=4)
    parser.add_argument("--margin", type=int, default=8)
    parser.add_argument("--threshold", type=int, default=30)
    args = parser.parse_args()
    report = repair(args.input, args.output, args.columns, args.rows, args.gutter, args.margin, args.threshold)
    moved = sum(record["translation"] != [0, 0] for record in report["cells"])
    print(f"SPRITE_SHEET_SAFE_MARGIN_OK {len(report['cells'])} CELLS {moved} MOVED {report['output']}")


if __name__ == "__main__":
    main()
