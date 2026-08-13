"""Deterministic display-aspect correction for pixel typography review."""
from __future__ import annotations

from math import gcd
from typing import Any

from pixel_font_universal.formats import png_rgba
from pixel_text_studio_engine import decode_rgba_png

from .common import MAX_CANVAS_EDGE, MAX_PIXELS, fail


def reduced_ratio(numerator: int, denominator: int) -> dict[str, int]:
    if numerator <= 0 or denominator <= 0:
        fail("display ratio components must be positive")
    divisor = gcd(numerator, denominator)
    return {
        "numerator": numerator // divisor,
        "denominator": denominator // divisor,
    }


def display_metadata(
    native_width: int,
    native_height: int,
    display_width: int,
    display_height: int,
) -> dict[str, Any]:
    return {
        "nativeAspectRatio": reduced_ratio(native_width, native_height),
        "displayAspectRatio": reduced_ratio(display_width, display_height),
        "pixelWidthToHeightRatio": reduced_ratio(
            display_width * native_height,
            display_height * native_width,
        ),
    }


def nearest_resize_png(data: bytes, target_width: int, target_height: int, label: str) -> bytes:
    if (
        not 1 <= target_width <= MAX_CANVAS_EDGE
        or not 1 <= target_height <= MAX_CANVAS_EDGE
        or target_width * target_height > MAX_PIXELS
    ):
        fail(f"{label} display-corrected preview exceeds supported bounds")
    source_width, source_height, source = decode_rgba_png(data, label)
    output = bytearray(target_width * target_height * 4)
    for target_y in range(target_height):
        source_y = min(
            source_height - 1,
            ((2 * target_y + 1) * source_height) // (2 * target_height),
        )
        for target_x in range(target_width):
            source_x = min(
                source_width - 1,
                ((2 * target_x + 1) * source_width) // (2 * target_width),
            )
            source_offset = (source_y * source_width + source_x) * 4
            target_offset = (target_y * target_width + target_x) * 4
            output[target_offset : target_offset + 4] = source[source_offset : source_offset + 4]
    return png_rgba(target_width, target_height, bytes(output))
