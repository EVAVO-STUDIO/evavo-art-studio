# Core contracts, utilities, profiles and bitmap geometry.
"""EVAVO Pixel Font Studio v2.

Deterministic, create-only bitmap font authoring and delivery for game projects.
Canonical runtime output is AngelCode BMFont text + RGBA PNG. BDF, an
engine-neutral atlas map, a review grid sheet and TrueType are deterministic
convenience derivatives generated from the same exact pixel master.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import re
import shlex
import shutil
import struct
import subprocess
import sys
import tempfile
import unicodedata
import zlib
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

TOOL_VERSION = "2.2.0"
FAMILY_MASTER_SCHEMA = "evavo.pixel-font-family-master.v2"
FACE_MASTER_SCHEMA = "evavo.pixel-font-face-master.v2"
FAMILY_OUTPUT_SCHEMA = "evavo.pixel-font-family.v2"
AUDIT_SCHEMA = "evavo.pixel-font-audit.v2"
VALIDATION_SCHEMA = "evavo.pixel-font-validation.v2"
GODOT_REPORT_SCHEMA = "evavo.pixel-font-godot-verification.v2"
EXPECTED_GODOT_VERSION = "4.6.2"
EXPECTED_GODOT_LINUX_ARCHIVE_SHA256 = "30e6b6d141f0cd5bebd629ad1d0ef1324e60091bb20662d026b402ba58c59937"
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_GLYPHS = 4096
MAX_KERNING_PAIRS = 100_000
MAX_ATLAS_EDGE = 4096
MAX_SPECIMEN_EDGE = 4096
SAFE_ID = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,95}$")
EMPTY_CODEPOINTS = frozenset({0x20, 0xA0, 0xAD, 0x200B})

DEFAULT_CONFUSABLE_SEQUENCES: tuple[tuple[str, ...], ...] = (
    ("0", "O"),
    ("1", "I", "l", "|"),
    ("2", "Z"),
    ("5", "S"),
    ("8", "B"),
    ("g", "q"),
    ("m", "rn"),
)

TYPOGRAPHIC_CODEPOINTS = frozenset(
    {
        0x2010,
        0x2011,
        0x2012,
        0x2013,
        0x2014,
        0x2015,
        0x2018,
        0x2019,
        0x201A,
        0x201B,
        0x201C,
        0x201D,
        0x201E,
        0x2020,
        0x2021,
        0x2022,
        0x2026,
        0x2030,
        0x2032,
        0x2033,
        0x2039,
        0x203A,
        0x2044,
    }
)
CURRENCY_CODEPOINTS = frozenset({0x24, 0xA2, 0xA3, 0xA4, 0xA5, 0x20AC})
ARROW_CODEPOINTS = frozenset(
    {
        0x2190,
        0x2191,
        0x2192,
        0x2193,
        0x2194,
        0x2195,
        0x21A9,
        0x21AA,
        0x21D0,
        0x21D2,
    }
)
CHESS_CODEPOINTS = frozenset(range(0x2654, 0x2660))
UI_CODEPOINTS = frozenset(
    {
        0x25A0,
        0x25A1,
        0x25B2,
        0x25B3,
        0x25B6,
        0x25B7,
        0x25BC,
        0x25BD,
        0x25C0,
        0x25C1,
        0x25C6,
        0x25C7,
        0x25CB,
        0x25CF,
        0x2605,
        0x2606,
        0x2713,
        0x2715,
        0x2716,
        0x2717,
    }
)
BOX_CODEPOINTS = frozenset(
    {
        0x2500,
        0x2502,
        0x250C,
        0x2510,
        0x2514,
        0x2518,
        0x251C,
        0x2524,
        0x252C,
        0x2534,
        0x253C,
        0x2550,
        0x2551,
        0x2554,
        0x2557,
        0x255A,
        0x255D,
        0x2560,
        0x2563,
        0x2566,
        0x2569,
        0x256C,
        0x2580,
        0x2584,
        0x2588,
        0x258C,
        0x2590,
        0x2591,
        0x2592,
        0x2593,
    }
)


class PixelFontError(RuntimeError):
    """Stable, user-facing validation error."""


def fail(message: str) -> None:
    raise PixelFontError(message)


def canonical_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_regular_file(path: Path, label: str, max_bytes: int = MAX_FILE_BYTES) -> Path:
    try:
        state = path.lstat()
    except FileNotFoundError:
        fail(f"{label} does not exist: {path}")
    if path.is_symlink() or not state.st_mode:
        fail(f"{label} must be a regular non-symbolic file: {path}")
    if not path.is_file():
        fail(f"{label} must be a regular file: {path}")
    if state.st_size < 1 or state.st_size > max_bytes:
        fail(f"{label} has invalid size: {state.st_size} bytes")
    return path.resolve()


def load_json(path: Path, label: str) -> tuple[Any, bytes]:
    resolved = require_regular_file(path, label)
    stored = resolved.read_bytes()
    try:
        raw = gzip.decompress(stored) if resolved.suffix.lower() == ".gz" else stored
    except (OSError, EOFError) as exc:
        fail(f"{label} is not valid deterministic gzip data: {exc}")
    if len(raw) > MAX_FILE_BYTES:
        fail(f"{label} expands beyond the {MAX_FILE_BYTES}-byte JSON boundary")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"{label} is not valid UTF-8 JSON: {exc}")
    return value, raw


def write_create_only(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(path, flags, 0o644)
    try:
        offset = 0
        while offset < len(data):
            offset += os.write(fd, data[offset:])
    finally:
        os.close(fd)


def write_json_create_only(path: Path, value: Any) -> None:
    write_create_only(path, canonical_json_bytes(value))


def safe_id(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SAFE_ID.fullmatch(value):
        fail(f"{label} must match {SAFE_ID.pattern}")
    return value


def bounded_int(value: Any, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum or value > maximum:
        fail(f"{label} must be an integer from {minimum} to {maximum}")
    return value


def boolean(value: Any, label: str) -> bool:
    if not isinstance(value, bool):
        fail(f"{label} must be boolean")
    return value


def string(value: Any, label: str, maximum: int = 512) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        fail(f"{label} must be a non-empty string no longer than {maximum} characters")
    return value


def is_codepoint(value: Any) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 <= value <= 0x10FFFF
        and not 0xD800 <= value <= 0xDFFF
    )


def power_of_two_at_least(value: int, minimum: int = 1) -> int:
    result = max(1, minimum)
    while result < value:
        result <<= 1
    return result


def profile_codepoints(profile: str) -> frozenset[int]:
    if profile == "printable-ascii":
        return frozenset(range(0x20, 0x7F))
    if profile == "latin-1-letters":
        return frozenset(cp for cp in range(0x00C0, 0x0100) if unicodedata.category(chr(cp)).startswith("L"))
    if profile == "latin-extended-a":
        return frozenset(cp for cp in range(0x0100, 0x0180) if unicodedata.category(chr(cp)).startswith("L"))
    if profile == "western-latin":
        return (
            profile_codepoints("printable-ascii")
            | profile_codepoints("latin-1-letters")
            | profile_codepoints("latin-extended-a")
            | frozenset({0x00A0, 0x00A1, 0x00A7, 0x00A9, 0x00AB, 0x00AD, 0x00AE, 0x00B0, 0x00B1, 0x00B7, 0x00BB, 0x00BF})
            | TYPOGRAPHIC_CODEPOINTS
            | CURRENCY_CODEPOINTS
        )
    if profile == "typography":
        return TYPOGRAPHIC_CODEPOINTS
    if profile == "currency":
        return CURRENCY_CODEPOINTS
    if profile == "arrows":
        return ARROW_CODEPOINTS
    if profile == "chess":
        return CHESS_CODEPOINTS
    if profile == "ui-symbols":
        return UI_CODEPOINTS
    if profile == "box-drawing-core":
        return BOX_CODEPOINTS
    fail(f"unknown coverage profile: {profile}")


def available_profiles() -> dict[str, int]:
    names = (
        "printable-ascii",
        "latin-1-letters",
        "latin-extended-a",
        "western-latin",
        "typography",
        "currency",
        "arrows",
        "chess",
        "ui-symbols",
        "box-drawing-core",
    )
    return {name: len(profile_codepoints(name)) for name in names}


def normalise_bitmap(rows: Any, label: str) -> tuple[str, ...]:
    if not isinstance(rows, list) or not rows:
        fail(f"{label}.bitmap must be a non-empty array")
    if not all(isinstance(row, str) for row in rows):
        fail(f"{label}.bitmap rows must be strings")
    width = len(rows[0])
    if width < 1 or width > 512 or len(rows) > 512:
        fail(f"{label}.bitmap dimensions are outside 1..512")
    if any(len(row) != width for row in rows):
        fail(f"{label}.bitmap must be rectangular")
    if any(character not in ".#" for row in rows for character in row):
        fail(f"{label}.bitmap may only contain '.' and '#'")
    return tuple(rows)


def glyph_pixel_set(glyph: Mapping[str, Any]) -> frozenset[tuple[int, int]]:
    return frozenset(
        (glyph["xOffset"] + x, glyph["yOffset"] + y)
        for y, row in enumerate(glyph["bitmap"])
        for x, value in enumerate(row)
        if value == "#"
    )


def glyph_visual_signature(glyph: Mapping[str, Any]) -> tuple[Any, ...]:
    # Exact output placement, not merely a translated silhouette. Translation-insensitive
    # ambiguity is handled separately by the confusable-sequence gate.
    return glyph["xAdvance"], tuple(sorted(glyph_pixel_set(glyph)))


def sequence_pixel_set(sequence: str, records: Mapping[int, Mapping[str, Any]], kerning: Mapping[tuple[int, int], int]) -> frozenset[tuple[int, int]] | None:
    cursor = 0
    previous: int | None = None
    pixels: set[tuple[int, int]] = set()
    for character in sequence:
        cp = ord(character)
        glyph = records.get(cp)
        if glyph is None:
            return None
        if previous is not None:
            cursor += kerning.get((previous, cp), 0)
        pixels.update((cursor + x, y) for x, y in glyph_pixel_set(glyph))
        cursor += glyph["xAdvance"]
        previous = cp
    if not pixels:
        return frozenset()
    min_x = min(x for x, _ in pixels)
    min_y = min(y for _, y in pixels)
    return frozenset((x - min_x, y - min_y) for x, y in pixels)
