"""Exact RGBA raster helpers for native-resolution typography review."""
from __future__ import annotations

from math import ceil
from typing import Sequence

from pixel_font_universal.common import RGBA, alpha_composite
from pixel_font_universal.formats import png_rgba
from pixel_text_studio_engine import decode_rgba_png

from .common import MAX_CANVAS_EDGE, MAX_PALETTE_COLOURS, MAX_PIXELS, fail


def blit(target: bytearray, target_width: int, target_height: int, source: bytes, source_width: int, source_height: int, x: int, y: int) -> None:
    if x < 0 or y < 0 or x + source_width > target_width or y + source_height > target_height:
        fail("internal review blit escaped the native page")
    for source_y in range(source_height):
        for source_x in range(source_width):
            source_offset = (source_y * source_width + source_x) * 4
            over: RGBA = tuple(source[source_offset : source_offset + 4])  # type: ignore[assignment]
            if over[3] == 0:
                continue
            target_offset = ((y + source_y) * target_width + x + source_x) * 4
            under: RGBA = tuple(target[target_offset : target_offset + 4])  # type: ignore[assignment]
            target[target_offset : target_offset + 4] = bytes(alpha_composite(under, over))


def animation_grid(frame_data: Sequence[bytes], columns: int, gap: int) -> tuple[int, int, bytes]:
    if not frame_data:
        fail("animation-grid sample contains no frames")
    decoded = [decode_rgba_png(data, f"animation frame {index}") for index, data in enumerate(frame_data)]
    frame_width, frame_height = decoded[0][0], decoded[0][1]
    if any((width, height) != (frame_width, frame_height) for width, height, _ in decoded):
        fail("animation-grid frames have inconsistent dimensions")
    columns = min(columns, len(decoded))
    rows = ceil(len(decoded) / columns)
    width = columns * frame_width + (columns - 1) * gap
    height = rows * frame_height + (rows - 1) * gap
    if width > MAX_CANVAS_EDGE or height > MAX_CANVAS_EDGE or width * height > MAX_PIXELS:
        fail("animation-grid exceeds supported bounds")
    target = bytearray(width * height * 4)
    for index, (_, _, rgba) in enumerate(decoded):
        column = index % columns
        row = index // columns
        blit(target, width, height, rgba, frame_width, frame_height, column * (frame_width + gap), row * (frame_height + gap))
    return width, height, png_rgba(width, height, bytes(target))


def integer_scale_png(data: bytes, scale: int, label: str) -> bytes:
    width, height, rgba = decode_rgba_png(data, label)
    scaled_width, scaled_height = width * scale, height * scale
    if scaled_width > MAX_CANVAS_EDGE or scaled_height > MAX_CANVAS_EDGE or scaled_width * scaled_height > MAX_PIXELS:
        fail(f"{label} integer-scale preview exceeds supported bounds")
    output = bytearray()
    for y in range(height):
        source_row = rgba[y * width * 4 : (y + 1) * width * 4]
        expanded = bytearray()
        for x in range(width):
            expanded.extend(source_row[x * 4 : (x + 1) * 4] * scale)
        output.extend(expanded * scale)
    return png_rgba(scaled_width, scaled_height, bytes(output))


def palette(page_data: Sequence[bytes]) -> list[RGBA]:
    colours: set[RGBA] = set()
    for index, data in enumerate(page_data):
        _, _, rgba = decode_rgba_png(data, f"review page {index}")
        for offset in range(0, len(rgba), 4):
            colour: RGBA = tuple(rgba[offset : offset + 4])  # type: ignore[assignment]
            if colour[3]:
                colours.add(colour)
                if len(colours) > MAX_PALETTE_COLOURS:
                    fail(f"review pages exceed the {MAX_PALETTE_COLOURS}-colour evidence limit")
    return sorted(colours)


def palette_png(colours: Sequence[RGBA]) -> bytes:
    swatch = 8
    columns = max(1, min(16, len(colours)))
    rows = max(1, ceil(max(1, len(colours)) / columns))
    width, height = columns * swatch, rows * swatch
    rgba = bytearray(width * height * 4)
    for index, colour in enumerate(colours):
        left, top = (index % columns) * swatch, (index // columns) * swatch
        for y in range(top, top + swatch):
            for x in range(left, left + swatch):
                offset = (y * width + x) * 4
                rgba[offset : offset + 4] = bytes(colour)
    return png_rgba(width, height, bytes(rgba))
