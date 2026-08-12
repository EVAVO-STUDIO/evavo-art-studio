"""Deterministic, style-neutral pixel-font compiler for EVAVO Art Studio.

The compiler accepts existing Pixel Font Studio v2 binary masters and a broader
universal face schema with binary, indexed-colour, direct RGBA, layered and
component-composed glyphs.  Style profiles are data, not a closed style enum.
The library exposes a reviewed operation registry; the CLI and MCP never accept
arbitrary code or commands.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import shlex
import shutil
import struct
import tempfile
import sys
import unicodedata
import zlib
from typing import Any, Final

ENGINE_VERSION: Final = "3.0.0"
V2_FACE_SCHEMA: Final = "evavo.pixel-font-face-master.v2"
FACE_SCHEMA: Final = "evavo.pixel-font-universal-face.v1"
PROFILE_SCHEMA: Final = "evavo.pixel-font-style-profile.v1"
BUILD_SCHEMA: Final = "evavo.pixel-font-style-build.v1"
ATLAS_SCHEMA: Final = "evavo.pixel-font-style-atlas.v1"
VALIDATION_SCHEMA: Final = "evavo.pixel-font-style-validation.v1"
CATALOG_SCHEMA: Final = "evavo.pixel-font-style-catalog.v1"

MAX_INPUT_BYTES = 128 * 1024 * 1024
MAX_GLYPHS = 65_536
MAX_GLYPH_EDGE = 1_024
MAX_ATLAS_EDGE = 8_192
MAX_PAGES = 256
MAX_OPERATIONS = 64
MAX_STRIKES = 16
MAX_COMPONENTS = 64
MAX_LAYERS = 64
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
HEX_COLOUR = re.compile(r"^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
TRANSPARENT = (0, 0, 0, 0)
WHITE = (255, 255, 255, 255)
EMPTY_CODEPOINTS = frozenset({0x20, 0xA0, 0xAD, 0x200B, 0x200C, 0x200D, 0x2060})
RGBA = tuple[int, int, int, int]
PixelMap = dict[tuple[int, int], RGBA]
Operation = Callable[[PixelMap, Mapping[str, Any], "OperationContext"], PixelMap]


class PixelFontUniversalError(ValueError):
    """Fail-closed source, profile, output or authoring error."""


def fail(message: str) -> None:
    raise PixelFontUniversalError(message)


def canonical_json(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    ).encode("utf-8")


def pretty_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode(
        "utf-8"
    )


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_id(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SAFE_ID.fullmatch(value):
        fail(f"{label} must match {SAFE_ID.pattern}")
    return value


def text(value: Any, label: str, maximum: int = 4096, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or len(value) > maximum or (not allow_empty and not value):
        qualifier = "possibly-empty " if allow_empty else ""
        fail(f"{label} must be {qualifier}text no longer than {maximum} characters")
    return value


def bounded_int(value: Any, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        fail(f"{label} must be an integer from {minimum} through {maximum}")
    return value


def boolean(value: Any, label: str) -> bool:
    if not isinstance(value, bool):
        fail(f"{label} must be boolean")
    return value


def codepoint(value: Any, label: str) -> int:
    if isinstance(value, int) and not isinstance(value, bool):
        result = value
    elif isinstance(value, str):
        token = value.strip()
        if len(token) == 1:
            result = ord(token)
        elif token.upper().startswith("U+"):
            try:
                result = int(token[2:], 16)
            except ValueError:
                fail(f"{label} is not a Unicode codepoint")
        else:
            try:
                result = int(token, 0)
            except ValueError:
                fail(f"{label} is not a Unicode codepoint")
    else:
        fail(f"{label} is not a Unicode codepoint")
    if not 0 <= result <= 0x10FFFF or 0xD800 <= result <= 0xDFFF:
        fail(f"{label} is not a Unicode scalar")
    return result


def parse_colour(value: Any, label: str) -> RGBA:
    if isinstance(value, (list, tuple)) and len(value) in {3, 4}:
        channels = tuple(
            bounded_int(channel, f"{label}[{index}]", 0, 255)
            for index, channel in enumerate(value)
        )
        if len(channels) == 3:
            return channels[0], channels[1], channels[2], 255
        return channels  # type: ignore[return-value]
    if not isinstance(value, str) or not HEX_COLOUR.fullmatch(value):
        fail(f"{label} must be #RRGGBB, #RRGGBBAA, RGB or RGBA")
    token = value[1:]
    if len(token) == 6:
        token += "ff"
    return tuple(int(token[index : index + 2], 16) for index in range(0, 8, 2))  # type: ignore[return-value]


def colour_hex(value: RGBA) -> str:
    return "#" + "".join(f"{channel:02x}" for channel in value)


def alpha_composite(under: RGBA, over: RGBA) -> RGBA:
    """Integer-only source-over alpha composition for reproducible bytes."""
    if over[3] == 0:
        return under
    if over[3] == 255:
        return over
    oa = over[3]
    ua = under[3]
    alpha_numerator = oa * 255 + ua * (255 - oa)
    if alpha_numerator <= 0:
        return TRANSPARENT
    rgb = tuple(
        (
            over[index] * oa * 255
            + under[index] * ua * (255 - oa)
            + alpha_numerator // 2
        )
        // alpha_numerator
        for index in range(3)
    )
    alpha = (alpha_numerator + 127) // 255
    return rgb[0], rgb[1], rgb[2], alpha


def merge_maps(base: PixelMap, overlay: PixelMap) -> PixelMap:
    result = dict(base)
    for point in sorted(overlay):
        result[point] = alpha_composite(result.get(point, TRANSPARENT), overlay[point])
        if result[point][3] == 0:
            del result[point]
    return result


def normalise_binary_rows(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_GLYPH_EDGE:
        fail(f"{label} must contain 1..{MAX_GLYPH_EDGE} rows")
    if not all(isinstance(row, str) and 1 <= len(row) <= MAX_GLYPH_EDGE for row in value):
        fail(f"{label} rows must be non-empty strings no wider than {MAX_GLYPH_EDGE}")
    width = len(value[0])
    if any(len(row) != width or set(row) - {".", "#"} for row in value):
        fail(f"{label} must be rectangular and contain only '.' and '#'")
    return list(value)


def normalise_indexed_rows(value: Any, label: str, palette: Mapping[str, RGBA]) -> list[str]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_GLYPH_EDGE:
        fail(f"{label} must contain 1..{MAX_GLYPH_EDGE} rows")
    if not all(isinstance(row, str) and 1 <= len(row) <= MAX_GLYPH_EDGE for row in value):
        fail(f"{label} rows must be non-empty strings")
    width = len(value[0])
    if any(len(row) != width for row in value):
        fail(f"{label} must be rectangular")
    unknown = sorted((set("".join(value)) - {"."}) - set(palette))
    if unknown:
        fail(f"{label} uses palette symbols that are not declared: {unknown}")
    return list(value)


def normalise_rgba_rows(value: Any, label: str) -> list[list[RGBA]]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_GLYPH_EDGE:
        fail(f"{label} must contain 1..{MAX_GLYPH_EDGE} rows")
    width: int | None = None
    result: list[list[RGBA]] = []
    for y, raw_row in enumerate(value):
        if not isinstance(raw_row, list) or not 1 <= len(raw_row) <= MAX_GLYPH_EDGE:
            fail(f"{label}[{y}] must be a non-empty colour array")
        if width is None:
            width = len(raw_row)
        elif len(raw_row) != width:
            fail(f"{label} must be rectangular")
        row: list[RGBA] = []
        for x, pixel in enumerate(raw_row):
            if pixel is None or pixel == ".":
                row.append(TRANSPARENT)
            else:
                row.append(parse_colour(pixel, f"{label}[{y}][{x}]"))
        result.append(row)
    return result


def bitmap_to_pixels(rows: Sequence[str], colour: RGBA, *, symbol: str = "#") -> PixelMap:
    if colour[3] == 0:
        return {}
    return {
        (x, y): colour
        for y, row in enumerate(rows)
        for x, value in enumerate(row)
        if value == symbol
    }


def rgba_to_pixels(rows: Sequence[Sequence[RGBA]]) -> PixelMap:
    return {
        (x, y): colour
        for y, row in enumerate(rows)
        for x, colour in enumerate(row)
        if colour[3] > 0
    }


def normalise_metrics(value: Any, label: str) -> dict[str, int]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    line_height = bounded_int(value.get("lineHeight"), f"{label}.lineHeight", 1, 2048)
    baseline = bounded_int(
        value.get("baseline", value.get("ascent")),
        f"{label}.baseline",
        0,
        line_height,
    )
    ascent = bounded_int(value.get("ascent", baseline), f"{label}.ascent", 0, 2048)
    descent = bounded_int(
        value.get("descent", max(0, line_height - baseline)),
        f"{label}.descent",
        0,
        1024,
    )
    cap_height = bounded_int(
        value.get("capHeight", max(1, ascent)), f"{label}.capHeight", 1, 2048
    )
    x_height = bounded_int(
        value.get("xHeight", min(cap_height, max(1, cap_height * 2 // 3))),
        f"{label}.xHeight",
        1,
        2048,
    )
    space_advance = bounded_int(
        value.get("spaceAdvance"), f"{label}.spaceAdvance", 1, 2048
    )
    if ascent > line_height or baseline > line_height:
        fail(f"{label} ascent/baseline exceeds lineHeight")
    if ascent + descent > line_height + 256:
        fail(f"{label} ascent + descent exceeds supported line-box overhang")
    if not x_height <= cap_height <= max(1, ascent):
        fail(f"{label} must satisfy xHeight <= capHeight <= ascent")
    return {
        "baseline": baseline,
        "ascent": ascent,
        "descent": descent,
        "lineHeight": line_height,
        "capHeight": cap_height,
        "xHeight": x_height,
        "spaceAdvance": space_advance,
    }


def normalise_palette(value: Any, mode: str, label: str) -> dict[str, RGBA]:
    if value is None:
        value = {}
    if not isinstance(value, dict) or len(value) > 256:
        fail(f"{label} must be an object with at most 256 entries")
    palette: dict[str, RGBA] = {}
    for symbol, colour in value.items():
        if not isinstance(symbol, str) or len(symbol) != 1 or symbol == ".":
            fail(f"{label} keys must be single non-dot symbols")
        palette[symbol] = parse_colour(colour, f"{label}.{symbol}")
    if mode == "binary":
        palette.setdefault("#", WHITE)
    if mode == "indexed" and not palette:
        fail(f"{label} is required for indexed pixel mode")
    return palette


