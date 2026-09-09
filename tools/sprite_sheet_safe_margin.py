#!/usr/bin/env python3
"""Translate grid-cell sprites away from crop edges without scaling or redrawing."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from collections import Counter

from PIL import Image, ImageChops


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def matte_colour(cell: Image.Image) -> tuple[int, int, int]:
    rgb = cell.convert("RGB")
    # Generated sheets often wrap every cell in a solid white grid, so border
    # sampling can select the divider instead of the overwhelmingly larger matte.
    # Quantize the whole cell and recover the median colour from its dominant bin.
    pixels = list(rgb.getdata())
    bins = Counter((r >> 3, g >> 3, b >> 3) for r, g, b in pixels)
    dominant = bins.most_common(1)[0][0]
    members = [pixel for pixel in pixels if tuple(channel >> 3 for channel in pixel) == dominant]
    channels = [sorted(pixel[index] for pixel in members) for index in range(3)]
    return tuple(channel[len(channel) // 2] for channel in channels)


def foreground_bbox(cell: Image.Image, matte: tuple[int, int, int], threshold: int):
    difference = ImageChops.difference(cell.convert("RGB"), Image.new("RGB", cell.size, matte))
    return difference.convert("L").point(lambda value: 255 if value >= threshold else 0).getbbox()


def foreground_mask(cell: Image.Image, matte: tuple[int, int, int], threshold: int) -> Image.Image:
    if matte[1] >= 160 and matte[1] - max(matte[0], matte[2]) >= 70:
        # Chroma generators often paint a subtle green gradient instead of an
        # exact solid fill. Treat the complete green family as background so
        # those variations cannot become a false full-cell subject. White grid
        # separators remain in the mask for remove_edge_dividers(), which keeps
        # divider diagnostics accurate and removes only near-solid edge lines.
        rgb = cell.convert("RGB")
        mask = Image.new("L", cell.size)
        mask.putdata([
            0 if (g >= 120 and g - r >= 45 and g - b >= 45) else 255
            for r, g, b in rgb.getdata()
        ])
        return mask
    difference = ImageChops.difference(cell.convert("RGB"), Image.new("RGB", cell.size, matte))
    return difference.convert("L").point(lambda value: 255 if value >= threshold else 0)


def remove_edge_dividers(mask: Image.Image, maximum_width: int, cell: Image.Image | None = None) -> tuple[Image.Image, dict[str, int]]:
    """Remove only near-solid grid lines; retain partial silhouettes touching an edge."""
    cleaned = mask.copy()
    pixels = cleaned.load()
    removed = {"left": 0, "top": 0, "right": 0, "bottom": 0}
    removed_coordinates: dict[str, list[int]] = {edge: [] for edge in removed}

    def column_ratio(x: int) -> float:
        return sum(pixels[x, y] != 0 for y in range(cleaned.height)) / cleaned.height

    def row_ratio(y: int) -> float:
        return sum(pixels[x, y] != 0 for x in range(cleaned.width)) / cleaned.width

    for offset in range(min(maximum_width, cleaned.width // 2, cleaned.height // 2)):
        for edge, coordinate, ratio, vertical in (
            ("left", offset, column_ratio(offset), True),
            ("right", cleaned.width - 1 - offset, column_ratio(cleaned.width - 1 - offset), True),
            ("top", offset, row_ratio(offset), False),
            ("bottom", cleaned.height - 1 - offset, row_ratio(cleaned.height - 1 - offset), False),
        ):
            if ratio < 0.80:
                continue
            removed[edge] += 1
            removed_coordinates[edge].append(coordinate)
            if vertical:
                for y in range(cleaned.height):
                    pixels[coordinate, y] = 0
            else:
                for x in range(cleaned.width):
                    pixels[x, coordinate] = 0
    # Generated antialiased dividers can have a near-solid white core with one
    # sparse fringe row or column. Remove only a one-pixel low-occupancy fringe
    # beside a confirmed divider; this cannot erase a substantive edge-touching
    # silhouette and prevents isolated pale pixels from expanding the bbox.
    for edge, coordinates in removed_coordinates.items():
        for coordinate in coordinates:
            for neighbour in (coordinate - 1, coordinate + 1):
                if edge in ("left", "right") and 0 <= neighbour < cleaned.width and column_ratio(neighbour) <= 0.10:
                    for y in range(cleaned.height):
                        pixels[neighbour, y] = 0
                elif edge in ("top", "bottom") and 0 <= neighbour < cleaned.height and row_ratio(neighbour) <= 0.10:
                    for x in range(cleaned.width):
                        pixels[x, neighbour] = 0
    if cell is not None:
        source = cell.convert("RGB").load()
        for edge, coordinates in removed_coordinates.items():
            for coordinate in coordinates:
                for fringe in range(coordinate - 2, coordinate + 3):
                    if edge in ("left", "right") and 0 <= fringe < cleaned.width:
                        for y in range(cleaned.height):
                            r, g, b = source[fringe, y]
                            if min(r, g, b) >= 180 and max(r, g, b) - min(r, g, b) <= 60:
                                pixels[fringe, y] = 0
                    elif edge in ("top", "bottom") and 0 <= fringe < cleaned.height:
                        for x in range(cleaned.width):
                            r, g, b = source[x, fringe]
                            if min(r, g, b) >= 180 and max(r, g, b) - min(r, g, b) <= 60:
                                pixels[x, fringe] = 0
    return cleaned, removed


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
            matte = matte_colour(cell)
            mask, removed_dividers = remove_edge_dividers(foreground_mask(cell, matte, threshold), gutter, cell)
            before = mask.getbbox()
            if before is None:
                raise RuntimeError(f"cell {row},{column} has no foreground")
            dx, dy = required_shift(before, cell.size, margin)
            shifted_pixels = cell.transform(cell.size, Image.Transform.AFFINE, (1, 0, -dx, 0, 1, -dy), fillcolor=matte)
            shifted_mask = mask.transform(mask.size, Image.Transform.AFFINE, (1, 0, -dx, 0, 1, -dy), fillcolor=0)
            repaired = Image.new("RGB", cell.size, matte)
            repaired.paste(shifted_pixels, mask=shifted_mask)
            after = shifted_mask.getbbox()
            if after is None or min(after[0], after[1], cell.width - after[2], cell.height - after[3]) < margin:
                raise RuntimeError(f"cell {row},{column} still violates requested margin: {after}")
            result.paste(repaired, outer[:2])
            records.append({"row": row, "column": column, "before_bbox": list(before), "after_bbox": list(after), "translation": [dx, dy], "matte_rgb": list(matte), "removed_edge_divider_px": removed_dividers})
    output.parent.mkdir(parents=True, exist_ok=True)
    result.save(output)
    report = {"schema": "evavo.sprite-sheet-safe-margin.v2", "source": str(source), "source_sha256": digest(source), "output": str(output), "output_sha256": digest(output), "grid": [columns, rows], "maximum_detected_divider_width_px": gutter, "required_cell_margin_px": margin, "foreground_difference_threshold": threshold, "operation": "full_cell_subject_translation_no_scale_no_redraw_no_mirror", "cells": records}
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
