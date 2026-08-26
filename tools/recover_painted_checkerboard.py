#!/usr/bin/env python3
"""Recover real alpha from a confidently painted two-colour checkerboard.

This is a dependency-light repair path for provider previews that baked a
transparency grid.  It estimates the two matte colours from a clean border,
removes only matte-like pixels connected to the canvas edge, and writes a
separate RGBA working copy.  It never mutates the source.
"""
from __future__ import annotations

import argparse
import json
from collections import deque
from hashlib import sha256
from pathlib import Path

from PIL import Image


def distance_sq(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return sum((a[index] - b[index]) ** 2 for index in range(3))


def border_pixels(image: Image.Image, band: int) -> list[tuple[int, int, int]]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels: list[tuple[int, int, int]] = []
    # Sprite sheets commonly place feet close to the lower canvas edge. Sample
    # four disjoint corners instead of the full border so actor pixels cannot
    # become an accidental matte centroid.
    for left, top in ((0, 0), (width - band, 0), (0, height - band), (width - band, height - band)):
        for y in range(top, top + band):
            for x in range(left, left + band):
                pixels.append(rgb.getpixel((x, y)))
    return pixels


def two_means(samples: list[tuple[int, int, int]]) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    if not samples:
        raise ValueError("empty border sample")
    luminance = lambda colour: sum(colour)
    centres = [min(samples, key=luminance), max(samples, key=luminance)]
    for _ in range(12):
        groups = [[], []]
        for colour in samples:
            index = 0 if distance_sq(colour, centres[0]) <= distance_sq(colour, centres[1]) else 1
            groups[index].append(colour)
        if not groups[0] or not groups[1]:
            raise ValueError("border does not contain two separable checker colours")
        updated = [tuple(round(sum(c[channel] for c in group) / len(group)) for channel in range(3)) for group in groups]
        if updated == centres:
            break
        centres = updated
    return centres[0], centres[1]


def recover(
    image: Image.Image,
    border_band: int = 24,
    threshold: int = 22,
    fringe_threshold: int = 42,
    fringe_passes: int = 3,
) -> tuple[Image.Image, dict[str, object]]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    colours = two_means(border_pixels(rgb, min(border_band, width // 4, height // 4)))
    if distance_sq(colours[0], colours[1]) < 5 * 5:
        raise ValueError("estimated checker colours are not sufficiently distinct")
    limit = threshold * threshold
    matte_like = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            colour = rgb.getpixel((x, y))
            if min(distance_sq(colour, colours[0]), distance_sq(colour, colours[1])) <= limit:
                matte_like[y * width + x] = 1

    removed = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        queue.append((x, 0)); queue.append((x, height - 1))
    for y in range(1, height - 1):
        queue.append((0, y)); queue.append((width - 1, y))
    while queue:
        x, y = queue.popleft()
        offset = y * width + x
        if removed[offset] or not matte_like[offset]:
            continue
        removed[offset] = 1
        for next_y in range(max(0, y - 1), min(height, y + 2)):
            for next_x in range(max(0, x - 1), min(width, x + 2)):
                if next_x != x or next_y != y:
                    queue.append((next_x, next_y))

    fringe_limit = fringe_threshold * fringe_threshold
    fringe_removed = 0
    for _ in range(fringe_passes):
        additions: list[int] = []
        for y in range(height):
            for x in range(width):
                offset = y * width + x
                if removed[offset]:
                    continue
                colour = rgb.getpixel((x, y))
                if min(distance_sq(colour, colours[0]), distance_sq(colour, colours[1])) > fringe_limit:
                    continue
                touches_transparency = any(
                    removed[next_y * width + next_x]
                    for next_y in range(max(0, y - 1), min(height, y + 2))
                    for next_x in range(max(0, x - 1), min(width, x + 2))
                    if next_x != x or next_y != y
                )
                if touches_transparency:
                    additions.append(offset)
        if not additions:
            break
        for offset in additions:
            removed[offset] = 1
        fringe_removed += len(additions)

    rgba = rgb.convert("RGBA")
    data = bytearray(rgba.tobytes())
    removed_count = 0
    for index, value in enumerate(removed):
        if value:
            data[index * 4:index * 4 + 4] = b"\x00\x00\x00\x00"
            removed_count += 1
    output = Image.frombytes("RGBA", (width, height), bytes(data))
    visible = width * height - removed_count
    if not removed_count or not visible:
        raise ValueError("checkerboard recovery did not produce meaningful alpha")
    evidence = {
        "schema": "evavo.painted-checkerboard-recovery.v1",
        "method": "two-colour-border-model-plus-edge-connected-removal",
        "checker_colours": ["#" + "".join(f"{channel:02x}" for channel in colour) for colour in colours],
        "distance_threshold": threshold,
        "fringe_distance_threshold": fringe_threshold,
        "fringe_passes": fringe_passes,
        "fringe_removed_pixels": fringe_removed,
        "removed_pixels": removed_count,
        "visible_pixels": visible,
        "transparent_fraction": removed_count / (width * height),
        "source_mutated": False,
    }
    return output, evidence


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--evidence", type=Path)
    parser.add_argument("--border-band", type=int, default=24)
    parser.add_argument("--threshold", type=int, default=22)
    parser.add_argument("--fringe-threshold", type=int, default=42)
    parser.add_argument("--fringe-passes", type=int, default=3)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve() or args.output.exists():
        raise SystemExit("output must be a new path separate from the immutable source")
    source = args.input.read_bytes()
    output, evidence = recover(
        Image.open(args.input), args.border_band, args.threshold,
        args.fringe_threshold, args.fringe_passes,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output, optimize=True)
    evidence["source_sha256"] = sha256(source).hexdigest()
    evidence["output_sha256"] = sha256(args.output.read_bytes()).hexdigest()
    evidence_path = args.evidence or args.output.with_suffix(".evidence.json")
    if evidence_path.exists():
        raise SystemExit("evidence output already exists")
    evidence_path.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, separators=(",", ":")))


if __name__ == "__main__":
    main()
