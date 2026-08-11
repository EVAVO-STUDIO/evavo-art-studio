#!/usr/bin/env python3
"""EVAVO Pixel Font Studio v2.

Deterministic, create-only bitmap font authoring and delivery for game projects.
Canonical runtime output is AngelCode BMFont text + RGBA PNG. TrueType is an
optional convenience derivative generated from the same exact pixel master.
"""
from __future__ import annotations

import argparse
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

TOOL_VERSION = "2.1.0"
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
    raw = resolved.read_bytes()
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


def validate_metrics(face: Mapping[str, Any], label: str) -> dict[str, int]:
    raw = face.get("metrics")
    if not isinstance(raw, dict):
        fail(f"{label}.metrics must be an object")
    baseline = bounded_int(raw.get("baseline"), f"{label}.metrics.baseline", 1, 512)
    ascent = bounded_int(raw.get("ascent", baseline), f"{label}.metrics.ascent", 1, 512)
    descent = bounded_int(raw.get("descent", max(0, raw.get("lineHeight", baseline) - baseline)), f"{label}.metrics.descent", 0, 256)
    line_height = bounded_int(raw.get("lineHeight"), f"{label}.metrics.lineHeight", 1, 768)
    cap_height = bounded_int(raw.get("capHeight"), f"{label}.metrics.capHeight", 1, 512)
    x_height = bounded_int(raw.get("xHeight"), f"{label}.metrics.xHeight", 1, 512)
    space_advance = bounded_int(raw.get("spaceAdvance"), f"{label}.metrics.spaceAdvance", 1, 512)
    if baseline != ascent:
        fail(f"{label}.metrics.baseline must equal ascent for deterministic BMFont placement")
    if ascent + descent > line_height:
        fail(f"{label}.metrics ascent + descent exceeds lineHeight")
    if not x_height <= cap_height <= ascent:
        fail(f"{label}.metrics must satisfy xHeight <= capHeight <= ascent")
    return {
        "ascent": ascent,
        "descent": descent,
        "baseline": baseline,
        "lineHeight": line_height,
        "capHeight": cap_height,
        "xHeight": x_height,
        "spaceAdvance": space_advance,
    }


def parse_allowed_pairs(value: Any, label: str) -> set[tuple[int, int]]:
    if value is None:
        return set()
    if not isinstance(value, list):
        fail(f"{label} must be an array")
    result: set[tuple[int, int]] = set()
    for index, entry in enumerate(value):
        if not isinstance(entry, list) or len(entry) != 2 or not all(is_codepoint(item) for item in entry):
            fail(f"{label}[{index}] must contain two Unicode codepoints")
        result.add((entry[0], entry[1]))
    return result


def validate_face_document(face: Any, *, source_label: str = "face") -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(face, dict):
        fail(f"{source_label} must be an object")
    if face.get("schema") != FACE_MASTER_SCHEMA:
        fail(f"{source_label}.schema must be {FACE_MASTER_SCHEMA}")
    family_id = safe_id(face.get("familyId"), f"{source_label}.familyId")
    face_id = safe_id(face.get("faceId"), f"{source_label}.faceId")
    display_name = string(face.get("displayName"), f"{source_label}.displayName", 128)
    version = string(face.get("version", "1.0.0"), f"{source_label}.version", 64)
    metrics = validate_metrics(face, source_label)
    raw_glyphs = face.get("glyphs")
    if not isinstance(raw_glyphs, list) or not 1 <= len(raw_glyphs) <= MAX_GLYPHS:
        fail(f"{source_label}.glyphs must contain 1..{MAX_GLYPHS} entries")
    records: dict[int, dict[str, Any]] = {}
    for index, raw in enumerate(raw_glyphs):
        label = f"{source_label}.glyphs[{index}]"
        if not isinstance(raw, dict):
            fail(f"{label} must be an object")
        cp = raw.get("codepoint")
        if not is_codepoint(cp) or cp < 0x20:
            fail(f"{label}.codepoint is invalid or a control code")
        if cp in records:
            fail(f"{label}.codepoint U+{cp:04X} is duplicated")
        rows = normalise_bitmap(raw.get("bitmap"), label)
        width = bounded_int(raw.get("width"), f"{label}.width", 1, 512)
        height = bounded_int(raw.get("height"), f"{label}.height", 1, 512)
        if width != len(rows[0]) or height != len(rows):
            fail(f"{label} dimensions disagree with bitmap")
        x_offset = bounded_int(raw.get("xOffset"), f"{label}.xOffset", -128, 512)
        y_offset = bounded_int(raw.get("yOffset"), f"{label}.yOffset", -128, 768)
        x_advance = bounded_int(raw.get("xAdvance"), f"{label}.xAdvance", 1, 512)
        visible = any("#" in row for row in rows)
        if not visible and cp not in EMPTY_CODEPOINTS:
            fail(f"{label} is unexpectedly empty")
        if visible and cp in {0x20, 0xA0, 0x200B}:
            fail(f"{label} must be empty")
        canonical = {
            "codepoint": cp,
            "character": chr(cp),
            "width": width,
            "height": height,
            "xOffset": x_offset,
            "yOffset": y_offset,
            "xAdvance": x_advance,
            "bitmap": list(rows),
        }
        pixels = glyph_pixel_set(canonical)
        if pixels:
            min_y = min(y for _, y in pixels)
            max_y = max(y for _, y in pixels)
            if min_y < 0 or max_y >= metrics["lineHeight"]:
                fail(
                    f"{label} pixels escape line box 0..{metrics['lineHeight'] - 1}: "
                    f"observed {min_y}..{max_y}"
                )
            min_x = min(x for x, _ in pixels)
            max_x = max(x for x, _ in pixels)
            if min_x < -32 or max_x >= x_advance + 32:
                fail(f"{label} horizontal overhang is outside the supported boundary")
        records[cp] = canonical
    if 0x20 not in records:
        fail(f"{source_label} is missing U+0020 SPACE")
    if records[0x20]["xAdvance"] != metrics["spaceAdvance"]:
        fail(f"{source_label} SPACE xAdvance must equal metrics.spaceAdvance")

    raw_kerning = face.get("kerning", [])
    if not isinstance(raw_kerning, list) or len(raw_kerning) > MAX_KERNING_PAIRS:
        fail(f"{source_label}.kerning must contain no more than {MAX_KERNING_PAIRS} entries")
    kerning: dict[tuple[int, int], int] = {}
    canonical_kerning: list[dict[str, int]] = []
    for index, raw in enumerate(raw_kerning):
        label = f"{source_label}.kerning[{index}]"
        if not isinstance(raw, dict) or set(raw) != {"first", "second", "amount"}:
            fail(f"{label} must contain first, second and amount only")
        first = raw.get("first")
        second = raw.get("second")
        amount = raw.get("amount")
        if first not in records or second not in records:
            fail(f"{label} references a missing glyph")
        amount = bounded_int(amount, f"{label}.amount", -64, 64)
        if amount == 0:
            fail(f"{label}.amount must not be zero")
        key = (first, second)
        if key in kerning:
            fail(f"{label} duplicates kerning pair U+{first:04X}/U+{second:04X}")
        kerning[key] = amount
        canonical_kerning.append({"first": first, "second": second, "amount": amount})

    coverage = face.get("coverage", {})
    if not isinstance(coverage, dict):
        fail(f"{source_label}.coverage must be an object")
    required_profiles = coverage.get("requiredProfiles", ["printable-ascii"])
    if not isinstance(required_profiles, list) or not required_profiles or not all(isinstance(item, str) for item in required_profiles):
        fail(f"{source_label}.coverage.requiredProfiles must be a non-empty string array")
    required: set[int] = set()
    for profile in required_profiles:
        required.update(profile_codepoints(profile))
    extra_required = coverage.get("requiredCodepoints", [])
    if not isinstance(extra_required, list) or not all(is_codepoint(item) for item in extra_required):
        fail(f"{source_label}.coverage.requiredCodepoints must be a codepoint array")
    required.update(extra_required)
    missing = sorted(required - set(records))
    if missing:
        preview = ", ".join(f"U+{cp:04X}" for cp in missing[:24])
        fail(f"{source_label} is missing {len(missing)} required glyphs: {preview}")

    qa = face.get("qa", {})
    if not isinstance(qa, dict):
        fail(f"{source_label}.qa must be an object")
    allowed_collisions = parse_allowed_pairs(qa.get("allowedCollisions"), f"{source_label}.qa.allowedCollisions")
    allowed_duplicates = parse_allowed_pairs(qa.get("allowedExactDuplicates"), f"{source_label}.qa.allowedExactDuplicates")

    duplicate_groups: list[list[int]] = []
    signatures: dict[tuple[Any, ...], list[int]] = defaultdict(list)
    for cp, glyph in records.items():
        if cp not in EMPTY_CODEPOINTS:
            signatures[glyph_visual_signature(glyph)].append(cp)
    for group in signatures.values():
        if len(group) > 1:
            duplicate_groups.append(sorted(group))

    duplicate_violations: list[tuple[int, int]] = []
    letter_or_number = lambda cp: unicodedata.category(chr(cp))[0] in {"L", "N"}
    for group in duplicate_groups:
        for index, first in enumerate(group):
            for second in group[index + 1 :]:
                pair = (first, second)
                reverse = (second, first)
                if pair in allowed_duplicates or reverse in allowed_duplicates:
                    continue
                if letter_or_number(first) and letter_or_number(second):
                    duplicate_violations.append(pair)

    confusable_violations: list[list[str]] = []
    for group in DEFAULT_CONFUSABLE_SEQUENCES:
        available: list[tuple[str, frozenset[tuple[int, int]]]] = []
        for sequence in group:
            pixels = sequence_pixel_set(sequence, records, kerning)
            if pixels is not None:
                available.append((sequence, pixels))
        for index, (left_name, left_pixels) in enumerate(available):
            for right_name, right_pixels in available[index + 1 :]:
                if left_pixels == right_pixels:
                    confusable_violations.append([left_name, right_name])

    collisions: list[dict[str, Any]] = []
    sorted_items = sorted(records.items())
    pixel_cache = {cp: glyph_pixel_set(glyph) for cp, glyph in sorted_items}
    for first_cp, first_glyph in sorted_items:
        first_pixels = pixel_cache[first_cp]
        if not first_pixels:
            continue
        for second_cp, _second_glyph in sorted_items:
            second_pixels = pixel_cache[second_cp]
            if not second_pixels:
                continue
            shift = first_glyph["xAdvance"] + kerning.get((first_cp, second_cp), 0)
            if first_pixels.intersection((x + shift, y) for x, y in second_pixels):
                pair = (first_cp, second_cp)
                if pair not in allowed_collisions:
                    collisions.append(
                        {
                            "first": first_cp,
                            "second": second_cp,
                            "amount": kerning.get(pair, 0),
                        }
                    )
                    if len(collisions) >= 64:
                        break
        if len(collisions) >= 64:
            break

    if duplicate_violations:
        preview = ", ".join(f"U+{a:04X}/U+{b:04X}" for a, b in duplicate_violations[:16])
        fail(f"{source_label} has identical letter/number glyphs: {preview}")
    if confusable_violations:
        preview = ", ".join("/".join(item) for item in confusable_violations[:16])
        fail(f"{source_label} has indistinguishable confusable forms: {preview}")
    if collisions:
        preview = ", ".join(
            f"U+{item['first']:04X}/U+{item['second']:04X}" for item in collisions[:16]
        )
        fail(f"{source_label} has glyph-pair pixel collisions: {preview}")

    canonical_face = {
        "schema": FACE_MASTER_SCHEMA,
        "familyId": family_id,
        "faceId": face_id,
        "displayName": display_name,
        "version": version,
        "metrics": metrics,
        "coverage": {
            "requiredProfiles": required_profiles,
            "requiredCodepoints": sorted(extra_required),
        },
        "qa": {
            "allowedCollisions": [list(item) for item in sorted(allowed_collisions)],
            "allowedExactDuplicates": [list(item) for item in sorted(allowed_duplicates)],
        },
        "glyphCount": len(records),
        "glyphs": [records[cp] for cp in sorted(records)],
        "kerning": sorted(canonical_kerning, key=lambda item: (item["first"], item["second"])),
    }
    report = {
        "schema": AUDIT_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "familyId": family_id,
        "faceId": face_id,
        "glyphCount": len(records),
        "kerningPairCount": len(kerning),
        "requiredCodepointCount": len(required),
        "coverage": {
            profile: {
                "required": len(profile_codepoints(profile)),
                "present": len(profile_codepoints(profile).intersection(records)),
            }
            for profile in required_profiles
        },
        "metrics": metrics,
        "offsets": {
            "minimumX": min(glyph["xOffset"] for glyph in records.values()),
            "maximumX": max(glyph["xOffset"] for glyph in records.values()),
            "minimumY": min(glyph["yOffset"] for glyph in records.values()),
            "maximumY": max(glyph["yOffset"] for glyph in records.values()),
            "nonZeroXCount": sum(1 for glyph in records.values() if glyph["xOffset"] != 0),
            "nonZeroYCount": sum(1 for glyph in records.values() if glyph["yOffset"] != 0),
        },
        "duplicateGroups": duplicate_groups,
        "confusableChecks": [list(group) for group in DEFAULT_CONFUSABLE_SEQUENCES],
        "collisionChecks": len(records) * len(records),
        "status": "passed",
    }
    return canonical_face, report


def resolve_child(parent: Path, relative: str, label: str) -> Path:
    if not isinstance(relative, str) or not relative or len(relative) > 4096:
        fail(f"{label} must be a non-empty relative path")
    candidate = (parent / relative).resolve()
    try:
        candidate.relative_to(parent.resolve())
    except ValueError:
        fail(f"{label} escapes the family master directory")
    return require_regular_file(candidate, label)


def validate_godot_policy(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    policy = {
        "targetVersion": string(value.get("targetVersion"), f"{label}.targetVersion", 32),
        "resourceBasePath": string(value.get("resourceBasePath"), f"{label}.resourceBasePath", 256),
        "textureFilter": value.get("textureFilter"),
        "integerScaleOnly": value.get("integerScaleOnly"),
        "subpixelPositioning": value.get("subpixelPositioning"),
        "mipmaps": value.get("mipmaps"),
        "systemFallback": value.get("systemFallback"),
    }
    if policy["targetVersion"] != EXPECTED_GODOT_VERSION:
        fail(f"{label}.targetVersion must be {EXPECTED_GODOT_VERSION}")
    if policy["textureFilter"] != "nearest":
        fail(f"{label}.textureFilter must be nearest")
    for field, expected in (
        ("integerScaleOnly", True),
        ("subpixelPositioning", False),
        ("mipmaps", False),
        ("systemFallback", False),
    ):
        if policy[field] is not expected:
            fail(f"{label}.{field} must be {str(expected).lower()}")
    resource_base = policy["resourceBasePath"].replace("\\", "/").strip("/")
    if resource_base.startswith("..") or "/../" in f"/{resource_base}/":
        fail(f"{label}.resourceBasePath must not escape res://")
    policy["resourceBasePath"] = resource_base
    return policy


def validate_family_document(
    family: Any,
    *,
    source_path: Path | None = None,
    source_label: str = "family",
    load_faces: bool = True,
) -> tuple[dict[str, Any], list[tuple[dict[str, Any], dict[str, Any], Path | None]], dict[str, Any]]:
    if not isinstance(family, dict):
        fail(f"{source_label} must be an object")
    if family.get("schema") != FAMILY_MASTER_SCHEMA:
        fail(f"{source_label}.schema must be {FAMILY_MASTER_SCHEMA}")
    family_id = safe_id(family.get("familyId"), f"{source_label}.familyId")
    display_name = string(family.get("displayName"), f"{source_label}.displayName", 128)
    version = string(family.get("version"), f"{source_label}.version", 64)
    godot = validate_godot_policy(family.get("godot"), f"{source_label}.godot")
    output_raw = family.get("output", {})
    if not isinstance(output_raw, dict):
        fail(f"{source_label}.output must be an object")
    output = {
        "includeTtf": boolean(output_raw.get("includeTtf", True), f"{source_label}.output.includeTtf"),
        "includeSpecimens": boolean(output_raw.get("includeSpecimens", True), f"{source_label}.output.includeSpecimens"),
        "atlasMaximumEdge": bounded_int(
            output_raw.get("atlasMaximumEdge", 2048),
            f"{source_label}.output.atlasMaximumEdge",
            64,
            MAX_ATLAS_EDGE,
        ),
        "atlasPadding": bounded_int(output_raw.get("atlasPadding", 1), f"{source_label}.output.atlasPadding", 1, 8),
        "ttfPixelUnits": bounded_int(output_raw.get("ttfPixelUnits", 64), f"{source_label}.output.ttfPixelUnits", 16, 256),
    }
    raw_faces = family.get("faces")
    if not isinstance(raw_faces, list) or not 1 <= len(raw_faces) <= 64:
        fail(f"{source_label}.faces must contain 1..64 entries")
    face_refs: list[dict[str, Any]] = []
    face_ids: set[str] = set()
    roles: set[str] = set()
    loaded: list[tuple[dict[str, Any], dict[str, Any], Path | None]] = []
    for index, raw in enumerate(raw_faces):
        label = f"{source_label}.faces[{index}]"
        if not isinstance(raw, dict):
            fail(f"{label} must be an object")
        role = safe_id(raw.get("role"), f"{label}.role")
        master = string(raw.get("master"), f"{label}.master", 4096)
        if role in roles:
            fail(f"{label}.role is duplicated: {role}")
        roles.add(role)
        face_refs.append({"role": role, "master": master})
        if load_faces:
            if source_path is None:
                fail("source_path is required when loading face masters")
            face_path = resolve_child(source_path.parent, master, f"{label}.master")
            face_value, _face_raw = load_json(face_path, f"{label}.master")
            canonical_face, audit = validate_face_document(face_value, source_label=f"face:{face_path.name}")
            if canonical_face["familyId"] != family_id:
                fail(f"{label}.master familyId does not match {family_id}")
            if canonical_face["faceId"] in face_ids:
                fail(f"{label}.master duplicates faceId {canonical_face['faceId']}")
            face_ids.add(canonical_face["faceId"])
            loaded.append((canonical_face, audit, face_path))
    specimens_raw = family.get("specimens", [])
    if not isinstance(specimens_raw, list) or len(specimens_raw) > 128:
        fail(f"{source_label}.specimens must be an array of at most 128 entries")
    specimens: list[dict[str, Any]] = []
    for index, raw in enumerate(specimens_raw):
        label = f"{source_label}.specimens[{index}]"
        if not isinstance(raw, dict):
            fail(f"{label} must be an object")
        face_id = safe_id(raw.get("faceId"), f"{label}.faceId")
        width = bounded_int(raw.get("width", 320), f"{label}.width", 64, MAX_SPECIMEN_EDGE)
        height = bounded_int(raw.get("height", 200), f"{label}.height", 64, MAX_SPECIMEN_EDGE)
        lines = raw.get("lines")
        if not isinstance(lines, list) or not 1 <= len(lines) <= 64:
            fail(f"{label}.lines must contain 1..64 strings")
        if not all(isinstance(line, str) and len(line) <= 1024 for line in lines):
            fail(f"{label}.lines contains an invalid string")
        specimens.append({"faceId": face_id, "width": width, "height": height, "lines": lines})
    if load_faces:
        unknown = sorted({item["faceId"] for item in specimens} - face_ids)
        if unknown:
            fail(f"{source_label}.specimens references unknown faces: {unknown}")
    license_info = family.get("license", {})
    if not isinstance(license_info, dict):
        fail(f"{source_label}.license must be an object")
    canonical_license = {
        "copyright": string(license_info.get("copyright", "Copyright EVAVO Studio"), f"{source_label}.license.copyright", 256),
        "text": string(license_info.get("text", "All rights reserved."), f"{source_label}.license.text", 2048),
        "url": str(license_info.get("url", ""))[:512],
    }
    canonical = {
        "schema": FAMILY_MASTER_SCHEMA,
        "familyId": family_id,
        "displayName": display_name,
        "version": version,
        "godot": godot,
        "output": output,
        "license": canonical_license,
        "faces": face_refs,
        "specimens": specimens,
    }
    report = {
        "schema": AUDIT_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "familyId": family_id,
        "version": version,
        "faceCount": len(face_refs),
        "faces": [audit for _, audit, _ in loaded],
        "godot": godot,
        "output": output,
        "status": "passed",
    }
    return canonical, loaded, report


def png_rgba(width: int, height: int, rgba: bytes) -> bytes:
    if len(rgba) != width * height * 4:
        fail("internal PNG buffer length mismatch")
    raw = b"".join(b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def decode_owned_png(data: bytes) -> tuple[int, int, bytes]:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        fail("PNG signature is invalid")
    offset = 8
    width = height = None
    compressed = bytearray()
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        crc = struct.unpack(">I", data[offset + 8 + length : offset + 12 + length])[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
            fail("PNG chunk CRC mismatch")
        offset += 12 + length
        if kind == b"IHDR":
            width, height, depth, colour, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if (depth, colour, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                fail("PNG is not owned 8-bit RGBA non-interlaced format")
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            break
    if width is None or height is None:
        fail("PNG is missing IHDR")
    raw = zlib.decompress(bytes(compressed))
    stride = width * 4
    expected = height * (stride + 1)
    if len(raw) != expected:
        fail("PNG decoded length mismatch")
    rows: list[bytes] = []
    for y in range(height):
        row = raw[y * (stride + 1) : (y + 1) * (stride + 1)]
        if row[0] != 0:
            fail("PNG uses an unsupported nonzero filter")
        rows.append(row[1:])
    return width, height, b"".join(rows)


def shelf_pack(records: Mapping[int, Mapping[str, Any]], max_edge: int, padding: int) -> tuple[int, int, list[tuple[int, Mapping[str, Any], int, int]]]:
    items = sorted(records.items(), key=lambda item: (-item[1]["height"], -item[1]["width"], item[0]))
    minimum_width = max(glyph["width"] + padding * 2 for _, glyph in items)
    candidates: list[tuple[int, int, list[tuple[int, Mapping[str, Any], int, int]]]] = []
    width = power_of_two_at_least(minimum_width, 64)
    while width <= max_edge:
        x = padding
        y = padding
        row_height = 0
        placed: list[tuple[int, Mapping[str, Any], int, int]] = []
        valid = True
        for cp, glyph in items:
            if x + glyph["width"] + padding > width:
                x = padding
                y += row_height + padding
                row_height = 0
            if y + glyph["height"] + padding > max_edge:
                valid = False
                break
            placed.append((cp, glyph, x, y))
            x += glyph["width"] + padding
            row_height = max(row_height, glyph["height"])
        if valid:
            height = power_of_two_at_least(y + row_height + padding, 32)
            if height <= max_edge:
                candidates.append((width, height, placed))
        width <<= 1
    if not candidates:
        fail(f"font atlas exceeds configured maximum edge {max_edge}")
    return min(candidates, key=lambda candidate: (candidate[0] * candidate[1], max(candidate[0], candidate[1]), candidate[0]))


def bmfont_escape(value: str) -> str:
    return value.replace('"', "").replace("\n", " ").replace("\r", " ")


def parse_bmfont(text: str) -> dict[str, Any]:
    result: dict[str, Any] = {"chars": {}, "kernings": {}}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = shlex.split(line)
        section = parts[0]
        values: dict[str, str] = {}
        for token in parts[1:]:
            if "=" in token:
                key, value = token.split("=", 1)
                values[key] = value
        if section in {"info", "common", "page"}:
            result[section] = values
        elif section == "chars":
            result["charsHeader"] = values
        elif section == "kernings":
            result["kerningsHeader"] = values
        elif section == "char":
            cp = int(values["id"])
            result["chars"][cp] = {key: int(value) for key, value in values.items() if key != "letter"}
        elif section == "kerning":
            key = (int(values["first"]), int(values["second"]))
            result["kernings"][key] = int(values["amount"])
    return result


def render_text_pixels(
    text: str,
    records: Mapping[int, Mapping[str, Any]],
    kerning: Mapping[tuple[int, int], int],
    start_x: int,
    start_y: int,
) -> tuple[set[tuple[int, int]], int]:
    cursor = start_x
    previous: int | None = None
    pixels: set[tuple[int, int]] = set()
    for character in text:
        cp = ord(character)
        glyph = records.get(cp)
        if glyph is None:
            fail(f"specimen text requires missing glyph U+{cp:04X}")
        if previous is not None:
            cursor += kerning.get((previous, cp), 0)
        pixels.update((cursor + x, start_y + y) for x, y in glyph_pixel_set(glyph))
        cursor += glyph["xAdvance"]
        previous = cp
    return pixels, cursor


def render_specimen(face: Mapping[str, Any], specimen: Mapping[str, Any]) -> bytes:
    width = specimen["width"]
    height = specimen["height"]
    rgba = bytearray(width * height * 4)
    for index in range(width * height):
        rgba[index * 4 + 3] = 255
    records = {glyph["codepoint"]: glyph for glyph in face["glyphs"]}
    kern = {(item["first"], item["second"]): item["amount"] for item in face["kerning"]}
    margin = 8
    for x in range(margin, width - margin):
        for y in (margin - 2, height - margin + 1):
            if 0 <= y < height:
                offset = (y * width + x) * 4
                rgba[offset : offset + 4] = b"\xff\xff\xff\xff"
    cursor_y = margin + 4
    for line in specimen["lines"]:
        if cursor_y + face["metrics"]["lineHeight"] >= height - margin:
            fail(f"specimen for {face['faceId']} exceeds {width}x{height}")
        pixels, end_x = render_text_pixels(line, records, kern, margin, cursor_y)
        if end_x > width - margin:
            fail(f"specimen line for {face['faceId']} exceeds width {width}: {line!r}")
        for x, y in pixels:
            if 0 <= x < width and 0 <= y < height:
                offset = (y * width + x) * 4
                rgba[offset : offset + 4] = b"\xff\xff\xff\xff"
        cursor_y += face["metrics"]["lineHeight"] + 2
    return png_rgba(width, height, bytes(rgba))


def nearest_scale_png(png: bytes, scale: int) -> bytes:
    width, height, rgba = decode_owned_png(png)
    out_width = width * scale
    out_height = height * scale
    if out_width > MAX_SPECIMEN_EDGE or out_height > MAX_SPECIMEN_EDGE:
        fail("scaled specimen exceeds maximum edge")
    out = bytearray(out_width * out_height * 4)
    for y in range(out_height):
        source_y = y // scale
        for x in range(out_width):
            source_x = x // scale
            source = (source_y * width + source_x) * 4
            target = (y * out_width + x) * 4
            out[target : target + 4] = rgba[source : source + 4]
    return png_rgba(out_width, out_height, bytes(out))


def glyph_name(cp: int) -> str:
    return f"uni{cp:04X}" if cp <= 0xFFFF else f"u{cp:06X}"


def build_ttf(face: Mapping[str, Any], destination: Path, pixel_units: int, license_info: Mapping[str, str]) -> dict[str, Any]:
    try:
        from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
        from fontTools.fontBuilder import FontBuilder
        from fontTools.pens.ttGlyphPen import TTGlyphPen
        from fontTools.ttLib import TTFont, newTable
        from fontTools.ttLib.tables._k_e_r_n import KernTable_format_0
    except ImportError as exc:
        fail("TTF output requires fontTools; install requirements/pixel-font-studio-v2.txt")

    records = {glyph["codepoint"]: glyph for glyph in face["glyphs"]}
    glyph_order = [".notdef"] + [glyph_name(cp) for cp in sorted(records)]
    units_per_em = power_of_two_at_least(face["metrics"]["lineHeight"] * pixel_units, 1024)
    fb = FontBuilder(units_per_em, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    cmap = {cp: glyph_name(cp) for cp in sorted(records)}
    fb.setupCharacterMap(cmap)

    glyphs: dict[str, Any] = {}
    horizontal_metrics: dict[str, tuple[int, int]] = {}
    pen = TTGlyphPen(None)
    glyphs[".notdef"] = pen.glyph()
    horizontal_metrics[".notdef"] = (face["metrics"]["spaceAdvance"] * pixel_units, 0)
    baseline = face["metrics"]["baseline"]
    for cp in sorted(records):
        record = records[cp]
        pen = TTGlyphPen(None)
        for y, row in enumerate(record["bitmap"]):
            for x, value in enumerate(row):
                if value != "#":
                    continue
                left = (record["xOffset"] + x) * pixel_units
                right = left + pixel_units
                top = (baseline - (record["yOffset"] + y)) * pixel_units
                bottom = top - pixel_units
                pen.moveTo((left, bottom))
                pen.lineTo((right, bottom))
                pen.lineTo((right, top))
                pen.lineTo((left, top))
                pen.closePath()
        name = glyph_name(cp)
        glyphs[name] = pen.glyph()
        horizontal_metrics[name] = (record["xAdvance"] * pixel_units, record["xOffset"] * pixel_units)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(horizontal_metrics)
    ascent = face["metrics"]["ascent"] * pixel_units
    descent = -face["metrics"]["descent"] * pixel_units
    line_gap = max(0, face["metrics"]["lineHeight"] * pixel_units - ascent + descent)
    fb.setupHorizontalHeader(ascent=ascent, descent=descent, lineGap=line_gap)
    fb.setupNameTable(
        {
            "familyName": face["displayName"],
            "styleName": "Regular",
            "uniqueFontIdentifier": f"EVAVO:{face['familyId']}:{face['faceId']}:{face['version']}",
            "fullName": face["displayName"],
            "psName": re.sub(r"[^A-Za-z0-9-]", "", face["displayName"].replace(" ", "-"))[:63],
            "version": f"Version {face['version']}",
            "copyright": license_info["copyright"],
            "licenseDescription": license_info["text"],
            "licenseInfoURL": license_info.get("url", ""),
        }
    )
    fb.setupOS2(
        sTypoAscender=ascent,
        sTypoDescender=descent,
        sTypoLineGap=line_gap,
        usWinAscent=max(0, ascent),
        usWinDescent=max(0, -descent),
        sxHeight=face["metrics"]["xHeight"] * pixel_units,
        sCapHeight=face["metrics"]["capHeight"] * pixel_units,
        usWeightClass=400,
        usWidthClass=5,
        fsSelection=0x40,
        fsType=0,
    )
    fb.setupPost(keepGlyphNames=True)
    fb.setupMaxp()
    font = fb.font
    # FontTools otherwise writes the current clock into head.modified, breaking exact builds.
    font.recalcTimestamp = False
    font["head"].created = 3786912000
    font["head"].modified = 3786912000

    kerning_pairs = {
        (glyph_name(item["first"]), glyph_name(item["second"])): item["amount"] * pixel_units
        for item in face["kerning"]
    }
    if kerning_pairs:
        feature_lines = ["languagesystem DFLT dflt;", "feature kern {"]
        feature_lines.extend(f"  pos {left} {right} {amount};" for (left, right), amount in sorted(kerning_pairs.items()))
        feature_lines.append("} kern;")
        addOpenTypeFeaturesFromString(font, "\n".join(feature_lines))
        kern_table = newTable("kern")
        kern_table.version = 0
        subtable = KernTable_format_0()
        subtable.version = 0
        subtable.coverage = 1
        subtable.kernTable = kerning_pairs
        kern_table.kernTables = [subtable]
        font["kern"] = kern_table

    destination.parent.mkdir(parents=True, exist_ok=True)
    font.save(destination)
    reopened = TTFont(destination, recalcBBoxes=False, recalcTimestamp=False)
    best_cmap = reopened.getBestCmap() or {}
    if set(best_cmap) != set(records):
        fail(f"TTF cmap mismatch for {face['faceId']}")
    if kerning_pairs and "kern" not in reopened and "GPOS" not in reopened:
        fail(f"TTF kerning tables missing for {face['faceId']}")
    if reopened["head"].unitsPerEm != units_per_em:
        fail(f"TTF unitsPerEm mismatch for {face['faceId']}")
    if reopened["OS/2"].fsType != 0:
        fail(f"TTF embedding bits must be unrestricted for authorised project use: {face['faceId']}")
    reopened.close()
    return {
        "format": "TrueType",
        "canonicalRuntime": False,
        "glyphCount": len(records),
        "kerningPairCount": len(kerning_pairs),
        "unitsPerEm": units_per_em,
        "pixelUnits": pixel_units,
        "embeddingFsType": 0,
        "sha256": sha256_file(destination),
    }


def build_face(
    face: Mapping[str, Any],
    audit: Mapping[str, Any],
    output_root: Path,
    family: Mapping[str, Any],
    role: str,
) -> dict[str, Any]:
    face_id = face["faceId"]
    face_root = output_root / "fonts" / face_id
    face_root.mkdir(parents=True, exist_ok=False)
    records = {glyph["codepoint"]: glyph for glyph in face["glyphs"]}
    width, height, placed = shelf_pack(
        records,
        family["output"]["atlasMaximumEdge"],
        family["output"]["atlasPadding"],
    )
    rgba = bytearray(width * height * 4)
    pixel_count = 0
    for _cp, glyph, atlas_x, atlas_y in placed:
        for y, row in enumerate(glyph["bitmap"]):
            for x, value in enumerate(row):
                if value == "#":
                    offset = ((atlas_y + y) * width + atlas_x + x) * 4
                    rgba[offset : offset + 4] = b"\xff\xff\xff\xff"
                    pixel_count += 1
    atlas_name = f"{face_id}.png"
    fnt_name = f"{face_id}.fnt"
    tres_name = f"{face_id}.tres"
    master_name = f"{face_id}.master.json"
    audit_name = f"{face_id}.audit.json"
    write_create_only(face_root / atlas_name, png_rgba(width, height, bytes(rgba)))
    metrics = face["metrics"]
    lines = [
        f'info face="{bmfont_escape(face["displayName"])}" size={metrics["lineHeight"]} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=0 padding=0,0,0,0 spacing=0,0',
        f'common lineHeight={metrics["lineHeight"]} base={metrics["baseline"]} scaleW={width} scaleH={height} pages=1 packed=0 alphaChnl=0 redChnl=4 greenChnl=4 blueChnl=4',
        f'page id=0 file="{atlas_name}"',
        f'chars count={len(placed)}',
    ]
    for cp, glyph, atlas_x, atlas_y in sorted(placed, key=lambda item: item[0]):
        lines.append(
            f"char id={cp} x={atlas_x} y={atlas_y} width={glyph['width']} height={glyph['height']} "
            f"xoffset={glyph['xOffset']} yoffset={glyph['yOffset']} xadvance={glyph['xAdvance']} page=0 chnl=15"
        )
    lines.append(f"kernings count={len(face['kerning'])}")
    for item in face["kerning"]:
        lines.append(f"kerning first={item['first']} second={item['second']} amount={item['amount']}")
    write_create_only(face_root / fnt_name, ("\n".join(lines) + "\n").encode("utf-8"))
    resource_path = f"res://{family['godot']['resourceBasePath']}/fonts/{face_id}/{fnt_name}"
    tres = (
        '[gd_resource type="FontVariation" load_steps=2 format=3]\n\n'
        f'[ext_resource type="FontFile" path="{resource_path}" id="1_font"]\n\n'
        "[resource]\n"
        'base_font = ExtResource("1_font")\n'
        "spacing_glyph = 0\n"
        "spacing_space = 0\n"
        "spacing_top = 0\n"
        "spacing_bottom = 0\n"
    )
    write_create_only(face_root / tres_name, tres.encode("utf-8"))
    write_json_create_only(face_root / master_name, face)
    write_json_create_only(face_root / audit_name, audit)

    ttf_report: dict[str, Any] | None = None
    if family["output"]["includeTtf"]:
        ttf_name = f"{face_id}.ttf"
        ttf_report = build_ttf(
            face,
            face_root / ttf_name,
            family["output"]["ttfPixelUnits"],
            family["license"],
        )

    files = {
        path.name: sha256_file(path)
        for path in sorted(face_root.iterdir())
        if path.is_file()
    }
    return {
        "role": role,
        "faceId": face_id,
        "displayName": face["displayName"],
        "version": face["version"],
        "glyphCount": len(records),
        "kerningPairCount": len(face["kerning"]),
        "metrics": metrics,
        "atlas": {
            "width": width,
            "height": height,
            "padding": family["output"]["atlasPadding"],
            "pixelCount": pixel_count,
        },
        "coverage": audit["coverage"],
        "qa": {
            "collisionChecks": audit["collisionChecks"],
            "duplicateGroupCount": len(audit["duplicateGroups"]),
            "status": "passed",
        },
        "ttf": ttf_report,
        "files": files,
    }


def generate_godot_fixture(output_root: Path, family: Mapping[str, Any], face_outputs: Sequence[Mapping[str, Any]]) -> dict[str, str]:
    fixture = output_root / "godot_fixture"
    fixture.mkdir(parents=True, exist_ok=False)
    project = """[application]
config/name="EVAVO Pixel Font Studio v2 Verification"
run/main_scene="res://verify.tscn"

[display]
window/size/viewport_width=320
window/size/viewport_height=200
window/size/window_width_override=320
window/size/window_height_override=200
window/stretch/mode="canvas_items"

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
textures/default_filters/use_nearest_mipmap_filter=false
textures/canvas_textures/default_texture_filter=0

environment/defaults/default_clear_color=Color(0, 0, 0, 1)
"""
    scene = """[gd_scene load_steps=2 format=3]

[ext_resource path="res://verify.gd" type="Script" id="1"]

[node name="PixelFontVerifier" type="Node2D"]
script = ExtResource("1")
"""
    # Required codepoints are embedded from copied masters at runtime, avoiding a giant GDScript literal.
    script = f'''extends Node2D

const EXPECTED_VERSION := "{EXPECTED_GODOT_VERSION}"
const FACE_IDS := {json.dumps([item["faceId"] for item in face_outputs])}
var failures: Array[String] = []
var labels: Array[Label] = []

func _ready() -> void:
    var version := Engine.get_version_info()
    var observed := "%s.%s.%s" % [version.get("major", -1), version.get("minor", -1), version.get("patch", -1)]
    if observed != EXPECTED_VERSION:
        failures.append("Expected Godot %s, observed %s" % [EXPECTED_VERSION, observed])
    var y := 8
    for face_id in FACE_IDS:
        var master_path := "res://delivery/fonts/%s/%s.master.json" % [face_id, face_id]
        var master_file := FileAccess.open(master_path, FileAccess.READ)
        if master_file == null:
            failures.append("Could not read " + master_path)
            continue
        var parsed = JSON.parse_string(master_file.get_as_text())
        if typeof(parsed) != TYPE_DICTIONARY:
            failures.append("Invalid master JSON for " + face_id)
            continue
        var font_path := "res://delivery/fonts/%s/%s.fnt" % [face_id, face_id]
        var font = load(font_path)
        if font == null or not (font is FontFile):
            failures.append("Could not import FontFile " + font_path)
            continue
        font.allow_system_fallback = false
        font.generate_mipmaps = false
        font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
        for glyph in parsed.get("glyphs", []):
            var cp := int(glyph.get("codepoint", -1))
            if cp >= 0 and not font.has_char(cp):
                failures.append("%s missing U+%04X" % [face_id, cp])
                if failures.size() >= 64:
                    break
        var label := Label.new()
        label.text = "%s  CHECKMATE  ÀČŁŒ  ♔♛  0123456789" % face_id
        label.position = Vector2(8, y)
        label.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
        label.add_theme_font_override("font", font)
        label.add_theme_font_size_override("font_size", int(parsed.get("metrics", {{}}).get("lineHeight", 10)))
        label.add_theme_color_override("font_color", Color.WHITE)
        add_child(label)
        labels.append(label)
        y += int(parsed.get("metrics", {{}}).get("lineHeight", 10)) + 14
    await get_tree().process_frame
    await RenderingServer.frame_post_draw
    var image := get_viewport().get_texture().get_image()
    var non_binary := 0
    for yy in range(image.get_height()):
        for xx in range(image.get_width()):
            var pixel := image.get_pixel(xx, yy)
            for channel in [pixel.r, pixel.g, pixel.b, pixel.a]:
                if not is_equal_approx(channel, 0.0) and not is_equal_approx(channel, 1.0):
                    non_binary += 1
                    break
    if non_binary > 0:
        failures.append("Rendered image contains %d non-binary pixels" % non_binary)
    var evidence_root := OS.get_environment("EVAVO_PIXEL_FONT_EVIDENCE_ROOT")
    if evidence_root.is_empty():
        evidence_root = "user://"
    DirAccess.make_dir_recursive_absolute(evidence_root)
    var screenshot_path := evidence_root.path_join("godot-4.6.2-render.png")
    var save_error := image.save_png(screenshot_path)
    if save_error != OK:
        failures.append("Could not save render proof: %s" % save_error)
    var report := {{
        "schema": "{GODOT_REPORT_SCHEMA}",
        "expectedVersion": EXPECTED_VERSION,
        "observedVersion": observed,
        "faceCount": FACE_IDS.size(),
        "nonBinaryPixelCount": non_binary,
        "screenshot": screenshot_path,
        "failures": failures,
        "status": "passed" if failures.is_empty() else "failed"
    }}
    var report_path := evidence_root.path_join("godot-4.6.2-report.json")
    var report_file := FileAccess.open(report_path, FileAccess.WRITE)
    if report_file != null:
        report_file.store_string(JSON.stringify(report, "  "))
    print(JSON.stringify(report))
    get_tree().quit(0 if failures.is_empty() else 1)
'''
    write_create_only(fixture / "project.godot", project.encode("utf-8"))
    write_create_only(fixture / "verify.tscn", scene.encode("utf-8"))
    write_create_only(fixture / "verify.gd", script.encode("utf-8"))
    # Verification copies the immutable font delivery into an isolated fixture.
    link_mode = "copy-required"
    return {
        "project": "godot_fixture/project.godot",
        "scene": "godot_fixture/verify.tscn",
        "script": "godot_fixture/verify.gd",
        "deliveryLinkMode": link_mode,
    }


def tree_hashes(root: Path, *, exclude: Iterable[str] = ()) -> dict[str, str]:
    excluded = set(exclude)
    return {
        path.relative_to(root).as_posix(): sha256_file(path)
        for path in sorted(root.rglob("*"))
        if path.is_file() and path.relative_to(root).as_posix() not in excluded
    }


def build_family(master_path: Path, output_root: Path) -> dict[str, Any]:
    master_path = require_regular_file(master_path, "family master")
    family_value, family_raw = load_json(master_path, "family master")
    family, loaded_faces, family_audit = validate_family_document(
        family_value,
        source_path=master_path,
        source_label="family master",
        load_faces=True,
    )
    if output_root.exists():
        fail(f"output root must not already exist: {output_root}")
    output_root.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output_root.name}.staging-", dir=output_root.parent))
    try:
        face_outputs: list[dict[str, Any]] = []
        source_faces: list[dict[str, str]] = []
        for (face, audit, source), reference in zip(loaded_faces, family["faces"], strict=True):
            relative_source = source.relative_to(master_path.parent).as_posix() if source else ""
            role = reference["role"]
            face_outputs.append(build_face(face, audit, staging, family, role))
            source_faces.append(
                {
                    "faceId": face["faceId"],
                    "path": relative_source,
                    "sha256": sha256_file(source),
                }
            )
        specimens: list[dict[str, Any]] = []
        if family["output"]["includeSpecimens"]:
            specimen_root = staging / "specimens"
            specimen_root.mkdir(parents=True, exist_ok=False)
            face_map = {face[0]["faceId"]: face[0] for face in loaded_faces}
            for spec in family["specimens"]:
                face = face_map[spec["faceId"]]
                native = render_specimen(face, spec)
                base_name = f"{face['faceId']}-{spec['width']}x{spec['height']}"
                native_path = specimen_root / f"{base_name}-1x.png"
                write_create_only(native_path, native)
                entries = {"1x": native_path.name}
                for scale in (2, 4):
                    scaled = nearest_scale_png(native, scale)
                    scaled_path = specimen_root / f"{base_name}-{scale}x.png"
                    write_create_only(scaled_path, scaled)
                    entries[f"{scale}x"] = scaled_path.name
                specimens.append(
                    {
                        "faceId": face["faceId"],
                        "native": [spec["width"], spec["height"]],
                        "files": entries,
                    }
                )
        fixture = generate_godot_fixture(staging, family, face_outputs)
        write_json_create_only(staging / "family.master.json", family)
        write_json_create_only(staging / "family.audit.json", family_audit)
        write_create_only(
            staging / "LICENSE.txt",
            (family["license"]["copyright"] + "\n\n" + family["license"]["text"] + "\n").encode("utf-8"),
        )
        face_lines = "\n".join(
            f"- **{item['displayName']}** (`{item['role']}`): {item['glyphCount']} glyphs, "
            f"{item['kerningPairCount']} kerning pairs, {item['metrics']['lineHeight']} px line height."
            for item in face_outputs
        )
        readme = f"""# {family['displayName']}\n\n""" \
            + "This directory is a deterministic Pixel Font Studio v2 delivery.\n\n" \
            + "## Canonical game runtime\n\n" \
            + "Use each AngelCode BMFont `.fnt` beside its matching RGBA `.png` atlas. " \
            + "The `.tres` files are Godot `FontVariation` wrappers.\n\n" \
            + f"Copy the delivery into `res://{family['godot']['resourceBasePath'].rstrip('/')}/`.\n\n" \
            + "Required rendering policy: nearest filtering, integer scaling, no mipmaps, " \
            + "no subpixel positioning and no system fallback during QA.\n\n" \
            + "## Faces\n\n" + face_lines + "\n\n" \
            + "## TrueType derivatives\n\n" \
            + ("The `.ttf` files are verified convenience derivatives generated from the same "
               "pixel masters. Their OS/2 `fsType` is `0`, so authorised installation and game "
               "embedding are not technically blocked; the family licence remains authoritative. "
               "Host applications can antialias scalable outlines, so `.fnt + .png` remains the "
               "pixel-perfect Godot source.\n\n"
               if family['output']['includeTtf'] else "No TrueType derivative was requested for this build.\n\n") \
            + "## Evidence\n\n" \
            + "`family.audit.json`, per-face audits, native specimens, `pixel-font-family.json`, " \
            + "`CHECKSUMS.sha256` and `build-receipt.json` retain the exact production evidence.\n"
        write_create_only(staging / "README.md", readme.encode("utf-8"))
        source = {
            "familyMaster": {
                "path": master_path.name,
                "sha256": sha256_bytes(family_raw),
            },
            "faces": source_faces,
        }
        manifest_without_files = {
            "schema": FAMILY_OUTPUT_SCHEMA,
            "toolVersion": TOOL_VERSION,
            "familyId": family["familyId"],
            "displayName": family["displayName"],
            "version": family["version"],
            "canonicalRuntime": ["AngelCode BMFont text .fnt", "RGBA PNG atlas"],
            "optionalDerivatives": ["TrueType .ttf"] if family["output"]["includeTtf"] else [],
            "godot": family["godot"],
            "source": source,
            "faces": face_outputs,
            "specimens": specimens,
            "godotFixture": fixture,
            "license": family["license"],
        }
        write_json_create_only(staging / "pixel-font-family.json", manifest_without_files)
        checksum_hashes = tree_hashes(staging)
        checksum_text = "".join(
            f"{digest}  {relative}\n" for relative, digest in sorted(checksum_hashes.items())
        )
        write_create_only(staging / "CHECKSUMS.sha256", checksum_text.encode("utf-8"))
        file_hashes = tree_hashes(staging)
        receipt = {
            "schema": "evavo.pixel-font-build-receipt.v2",
            "toolVersion": TOOL_VERSION,
            "familyId": family["familyId"],
            "fileCount": len(file_hashes),
            "files": file_hashes,
            "deterministic": True,
            "createOnly": True,
        }
        write_json_create_only(staging / "build-receipt.json", receipt)
        os.replace(staging, output_root)
        return {**manifest_without_files, "buildReceipt": receipt}
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def validate_ttf(path: Path, face_master: Mapping[str, Any]) -> dict[str, Any]:
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        fail("TTF validation requires fontTools")
    font = TTFont(path, recalcBBoxes=False, recalcTimestamp=False)
    cmap = font.getBestCmap() or {}
    expected = {glyph["codepoint"] for glyph in face_master["glyphs"]}
    missing = sorted(expected - set(cmap))
    unexpected = sorted(set(cmap) - expected)
    has_kern = "kern" in font or "GPOS" in font
    expected_kern = bool(face_master["kerning"])
    report = {
        "glyphCount": len(cmap),
        "missing": missing,
        "unexpected": unexpected,
        "kerningPresent": has_kern,
        "expectedKerning": expected_kern,
        "unitsPerEm": font["head"].unitsPerEm,
        "embeddingFsType": font["OS/2"].fsType,
    }
    font.close()
    if missing or unexpected:
        fail(f"TTF cmap mismatch in {path}")
    if expected_kern and not has_kern:
        fail(f"TTF is missing kerning in {path}")
    if report["embeddingFsType"] != 0:
        fail(f"TTF embedding bits are not suitable for authorised project use in {path}")
    return report


def validate_output(manifest_path: Path) -> dict[str, Any]:
    manifest_path = require_regular_file(manifest_path, "family manifest")
    value, _raw = load_json(manifest_path, "family manifest")
    if not isinstance(value, dict) or value.get("schema") != FAMILY_OUTPUT_SCHEMA:
        fail(f"family manifest schema must be {FAMILY_OUTPUT_SCHEMA}")
    root = manifest_path.parent.resolve()
    receipt_value, _ = load_json(root / "build-receipt.json", "build receipt")
    expected_hashes = receipt_value.get("files")
    if not isinstance(expected_hashes, dict):
        fail("build receipt files must be an object")
    observed_hashes = tree_hashes(root, exclude={"build-receipt.json"})
    if expected_hashes != observed_hashes:
        missing = sorted(set(expected_hashes) - set(observed_hashes))
        unexpected = sorted(set(observed_hashes) - set(expected_hashes))
        changed = sorted(path for path in expected_hashes.keys() & observed_hashes.keys() if expected_hashes[path] != observed_hashes[path])
        fail(f"family identity mismatch: missing={missing}, unexpected={unexpected}, changed={changed}")

    checksum_path = require_regular_file(root / "CHECKSUMS.sha256", "checksum manifest")
    checksum_records: dict[str, str] = {}
    for line_number, line in enumerate(checksum_path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        parts = line.split("  ", 1)
        if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            fail(f"CHECKSUMS.sha256 line {line_number} is invalid")
        relative = parts[1]
        if relative in checksum_records or relative in {"CHECKSUMS.sha256", "build-receipt.json"}:
            fail(f"CHECKSUMS.sha256 line {line_number} has a prohibited or duplicate path")
        candidate = (root / relative).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            fail(f"CHECKSUMS.sha256 line {line_number} escapes the delivery")
        checksum_records[relative] = parts[0]
    checksum_observed = tree_hashes(root, exclude={"CHECKSUMS.sha256", "build-receipt.json"})
    if checksum_records != checksum_observed:
        fail("CHECKSUMS.sha256 does not match the retained delivery files")

    face_reports: list[dict[str, Any]] = []
    for face in value.get("faces", []):
        face_id = safe_id(face.get("faceId"), "manifest faceId")
        face_root = root / "fonts" / face_id
        master, _ = load_json(face_root / f"{face_id}.master.json", f"{face_id} master")
        canonical_master, audit = validate_face_document(master, source_label=f"output:{face_id}")
        fnt_path = require_regular_file(face_root / f"{face_id}.fnt", f"{face_id} BMFont")
        parsed = parse_bmfont(fnt_path.read_text(encoding="utf-8"))
        if set(parsed["chars"]) != {glyph["codepoint"] for glyph in canonical_master["glyphs"]}:
            fail(f"{face_id} BMFont character coverage mismatch")
        if len(parsed["kernings"]) != len(canonical_master["kerning"]):
            fail(f"{face_id} BMFont kerning count mismatch")
        png_path = require_regular_file(face_root / f"{face_id}.png", f"{face_id} atlas")
        width, height, rgba = decode_owned_png(png_path.read_bytes())
        binary_violations = 0
        for index in range(0, len(rgba), 4):
            pixel = rgba[index : index + 4]
            if pixel not in {b"\x00\x00\x00\x00", b"\xff\xff\xff\xff"}:
                binary_violations += 1
        if binary_violations:
            fail(f"{face_id} atlas contains {binary_violations} non-binary pixels")
        for cp, char in parsed["chars"].items():
            if char["x"] < 0 or char["y"] < 0 or char["x"] + char["width"] > width or char["y"] + char["height"] > height:
                fail(f"{face_id} BMFont glyph U+{cp:04X} escapes atlas")
        ttf_path = face_root / f"{face_id}.ttf"
        ttf_report = validate_ttf(ttf_path, canonical_master) if ttf_path.exists() else None
        face_reports.append(
            {
                "faceId": face_id,
                "glyphCount": len(canonical_master["glyphs"]),
                "kerningPairCount": len(canonical_master["kerning"]),
                "atlas": [width, height],
                "audit": audit["status"],
                "ttf": ttf_report,
                "status": "passed",
            }
        )

    for specimen in value.get("specimens", []):
        native_name = specimen["files"]["1x"]
        native_path = root / "specimens" / native_name
        native_width, native_height, native_rgba = decode_owned_png(native_path.read_bytes())
        for scale in (2, 4):
            scaled_path = root / "specimens" / specimen["files"][f"{scale}x"]
            scaled_width, scaled_height, scaled_rgba = decode_owned_png(scaled_path.read_bytes())
            if (scaled_width, scaled_height) != (native_width * scale, native_height * scale):
                fail(f"scaled specimen dimensions are invalid: {scaled_path}")
            for y in range(scaled_height):
                for x in range(scaled_width):
                    source = ((y // scale) * native_width + (x // scale)) * 4
                    target = (y * scaled_width + x) * 4
                    if scaled_rgba[target : target + 4] != native_rgba[source : source + 4]:
                        fail(f"scaled specimen is not exact nearest-neighbour output: {scaled_path}")
    return {
        "schema": VALIDATION_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "familyId": value["familyId"],
        "faceCount": len(face_reports),
        "faces": face_reports,
        "identityFileCount": len(expected_hashes),
        "systemFallback": False,
        "status": "passed",
    }


def inspect_glyph(face_path: Path, codepoint: int) -> dict[str, Any]:
    face_value, _ = load_json(face_path, "face master")
    face, _audit = validate_face_document(face_value, source_label="face master")
    record = next((glyph for glyph in face["glyphs"] if glyph["codepoint"] == codepoint), None)
    if record is None:
        fail(f"face {face['faceId']} has no glyph U+{codepoint:04X}")
    pairs = [item for item in face["kerning"] if item["first"] == codepoint or item["second"] == codepoint]
    return {
        "schema": "evavo.pixel-font-glyph-inspection.v2",
        "faceId": face["faceId"],
        "glyph": record,
        "pixels": len(glyph_pixel_set(record)),
        "kerning": pairs,
    }


def compare_builds(first: Path, second: Path) -> dict[str, Any]:
    first_hashes = tree_hashes(first)
    second_hashes = tree_hashes(second)
    if first_hashes != second_hashes:
        changed = sorted(path for path in first_hashes.keys() & second_hashes.keys() if first_hashes[path] != second_hashes[path])
        fail(
            f"builds are not reproducible: missing={sorted(set(first_hashes)-set(second_hashes))}, "
            f"unexpected={sorted(set(second_hashes)-set(first_hashes))}, changed={changed}"
        )
    return {
        "schema": "evavo.pixel-font-reproducibility.v2",
        "fileCount": len(first_hashes),
        "treeSha256": sha256_bytes(canonical_json_bytes(first_hashes)),
        "status": "passed",
    }


def verify_godot(manifest_path: Path, godot_executable: Path, evidence_root: Path, expected_sha256: str | None) -> dict[str, Any]:
    manifest_path = require_regular_file(manifest_path, "family manifest")
    godot_executable = require_regular_file(godot_executable, "Godot executable", max_bytes=512 * 1024 * 1024)
    if expected_sha256 and sha256_file(godot_executable) != expected_sha256:
        fail("Godot executable SHA-256 does not match the configured digest")
    version = subprocess.run(
        [str(godot_executable), "--version"],
        text=True,
        capture_output=True,
        shell=False,
        timeout=60,
        check=False,
    )
    observed_version = (version.stdout or version.stderr).strip()
    if version.returncode != 0 or not observed_version.startswith(EXPECTED_GODOT_VERSION):
        fail(f"expected Godot {EXPECTED_GODOT_VERSION}, observed {observed_version!r}")
    root = manifest_path.parent.resolve()
    source_fixture = root / "godot_fixture"
    evidence_root = evidence_root.resolve()
    if evidence_root.exists():
        fail(f"Godot evidence root must not already exist: {evidence_root}")
    evidence_root.mkdir(parents=True, exist_ok=False)
    runtime_fixture = evidence_root / "fixture"
    shutil.copytree(source_fixture, runtime_fixture, symlinks=False, ignore=shutil.ignore_patterns("delivery"))
    shutil.copytree(root / "fonts", runtime_fixture / "delivery" / "fonts")
    env = {
        **os.environ,
        "EVAVO_PIXEL_FONT_EVIDENCE_ROOT": str(evidence_root),
    }
    import_run = subprocess.run(
        [str(godot_executable), "--headless", "--editor", "--path", str(runtime_fixture), "--quit"],
        text=True,
        capture_output=True,
        shell=False,
        timeout=180,
        check=False,
        env=env,
    )
    if import_run.returncode != 0:
        fail(f"Godot import failed: {(import_run.stderr or import_run.stdout)[-4000:]}")
    render_run = subprocess.run(
        [
            str(godot_executable),
            "--headless",
            "--rendering-method",
            "gl_compatibility",
            "--path",
            str(runtime_fixture),
        ],
        text=True,
        capture_output=True,
        shell=False,
        timeout=180,
        check=False,
        env=env,
    )
    report_path = evidence_root / "godot-4.6.2-report.json"
    if render_run.returncode != 0 or not report_path.is_file():
        fail(f"Godot render verification failed: {(render_run.stderr or render_run.stdout)[-4000:]}")
    report, _ = load_json(report_path, "Godot report")
    if report.get("status") != "passed":
        fail(f"Godot report failed: {report.get('failures')}")
    result = {
        "schema": GODOT_REPORT_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "familyId": json.loads(manifest_path.read_text(encoding="utf-8"))["familyId"],
        "godotExecutableSha256": sha256_file(godot_executable),
        "observedVersion": observed_version,
        "importExitCode": import_run.returncode,
        "renderExitCode": render_run.returncode,
        "engineReport": report,
        "logs": {
            "importStdout": import_run.stdout[-8000:],
            "importStderr": import_run.stderr[-8000:],
            "renderStdout": render_run.stdout[-8000:],
            "renderStderr": render_run.stderr[-8000:],
        },
        "status": "passed",
    }
    write_json_create_only(evidence_root / "verification-summary.json", result)
    return result


def seal_document(kind: str, document: Any, output: Path) -> dict[str, Any]:
    if output.exists():
        fail(f"seal output already exists: {output}")
    if kind == "face":
        canonical, audit = validate_face_document(document, source_label="candidate face")
        write_json_create_only(output, canonical)
        return {"kind": kind, "faceId": canonical["faceId"], "sha256": sha256_file(output), "audit": audit}
    canonical, _loaded, audit = validate_family_document(document, source_label="candidate family", load_faces=False)
    write_json_create_only(output, canonical)
    return {"kind": kind, "familyId": canonical["familyId"], "sha256": sha256_file(output), "audit": audit}


def catalog() -> dict[str, Any]:
    return {
        "schema": FAMILY_MASTER_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "canonicalRuntime": ["AngelCode BMFont text .fnt", "RGBA PNG atlas"],
        "optionalDerivatives": ["TrueType .ttf with cmap, legacy kern and OpenType GPOS kerning"],
        "profiles": available_profiles(),
        "supports": [
            "independent per-face explicit glyph masters",
            "arbitrary rectangular glyph matrices",
            "per-glyph x/y offsets and advances",
            "ascent, descent, baseline, cap height, x-height and line height",
            "face-specific kerning",
            "Western Latin and game-specific Unicode coverage profiles",
            "confusable, duplicate, clipping and exhaustive pair-collision QA",
            "deterministic packed RGBA atlases",
            "native 320x200 and exact integer-scaled specimens",
            "optional pixel-outline TrueType derivatives",
            "no-system-fallback Godot fixture",
            "pinned Godot 4.6.2 import and render verification",
            "create-only builds and sealed masters",
        ],
        "godot": {
            "targetVersion": EXPECTED_GODOT_VERSION,
            "officialLinuxArchiveSha256": EXPECTED_GODOT_LINUX_ARCHIVE_SHA256,
            "textureFilter": "nearest",
            "integerScaleOnly": True,
            "subpixelPositioning": False,
            "mipmaps": False,
            "systemFallback": False,
        },
    }


def read_stdin_json() -> Any:
    raw = sys.stdin.buffer.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        fail("stdin JSON exceeds maximum size")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"stdin is not valid UTF-8 JSON: {exc}")


def command_main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="EVAVO Pixel Font Studio v2")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("catalog")
    audit_parser = sub.add_parser("audit")
    audit_parser.add_argument("--face")
    audit_parser.add_argument("--family")
    inspect_parser = sub.add_parser("inspect")
    inspect_parser.add_argument("--face", required=True)
    inspect_parser.add_argument("--codepoint", required=True)
    build_parser = sub.add_parser("build")
    build_parser.add_argument("--master", required=True)
    build_parser.add_argument("--output", required=True)
    validate_parser = sub.add_parser("validate")
    validate_parser.add_argument("--family", required=True)
    compare_parser = sub.add_parser("compare")
    compare_parser.add_argument("--first", required=True)
    compare_parser.add_argument("--second", required=True)
    seal_face_parser = sub.add_parser("seal-face")
    seal_face_parser.add_argument("--output", required=True)
    seal_family_parser = sub.add_parser("seal-family")
    seal_family_parser.add_argument("--output", required=True)
    godot_parser = sub.add_parser("verify-godot")
    godot_parser.add_argument("--family", required=True)
    godot_parser.add_argument("--godot", required=True)
    godot_parser.add_argument("--evidence", required=True)
    godot_parser.add_argument("--sha256")
    arguments = parser.parse_args(argv)

    if arguments.command == "catalog":
        result = catalog()
    elif arguments.command == "audit":
        if bool(arguments.face) == bool(arguments.family):
            fail("audit requires exactly one of --face or --family")
        if arguments.face:
            value, _ = load_json(Path(arguments.face), "face master")
            _face, result = validate_face_document(value, source_label="face master")
        else:
            path = Path(arguments.family).resolve()
            value, _ = load_json(path, "family master")
            _family, _loaded, result = validate_family_document(value, source_path=path, source_label="family master")
    elif arguments.command == "inspect":
        token = arguments.codepoint.strip()
        if token.upper().startswith("U+"):
            codepoint = int(token[2:], 16)
        elif len(token) == 1:
            codepoint = ord(token)
        else:
            codepoint = int(token, 0)
        if not is_codepoint(codepoint):
            fail("inspect codepoint is invalid")
        result = inspect_glyph(Path(arguments.face), codepoint)
    elif arguments.command == "build":
        result = build_family(Path(arguments.master).resolve(), Path(arguments.output).resolve())
    elif arguments.command == "validate":
        result = validate_output(Path(arguments.family).resolve())
    elif arguments.command == "compare":
        result = compare_builds(Path(arguments.first).resolve(), Path(arguments.second).resolve())
    elif arguments.command == "seal-face":
        result = seal_document("face", read_stdin_json(), Path(arguments.output).resolve())
    elif arguments.command == "seal-family":
        result = seal_document("family", read_stdin_json(), Path(arguments.output).resolve())
    else:
        result = verify_godot(
            Path(arguments.family).resolve(),
            Path(arguments.godot).resolve(),
            Path(arguments.evidence).resolve(),
            arguments.sha256,
        )
    sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return 0


def main() -> None:
    try:
        raise SystemExit(command_main())
    except PixelFontError as exc:
        sys.stderr.write(f"PIXEL_FONT_V2_ERROR: {exc}\n")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
