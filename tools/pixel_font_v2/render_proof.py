"""Exact pixel binding for Pixel Font Studio native Godot evidence."""
from __future__ import annotations

import json
import re
from pathlib import Path
from types import ModuleType
from typing import Any, Mapping, Sequence

from .common import fail, glyph_pixel_set, load_json, require_regular_file, sha256_bytes
from .formats import render_text_pixels

EVIDENCE_WIDTH = 320
EVIDENCE_HEIGHT = 200
EVIDENCE_MARGIN = 8
EVIDENCE_ROW_GAP = 14
SAMPLE_SUFFIX = "  HOn0O1Ilgqmr  0123"
_FACE_IDS_PATTERN = re.compile(r"(?m)^const FACE_IDS := (.+)$")
_SAMPLE_LINE = '        label.text = "%s  CHECKMATE  ÀČŁŒ  ♔♛  0123456789" % face_id'
_REPLACEMENT_SAMPLE_LINE = f'        label.text = "%s{SAMPLE_SUFFIX}" % face_id'


def _records(face: Mapping[str, Any]) -> tuple[dict[int, Mapping[str, Any]], dict[tuple[int, int], int]]:
    return (
        {int(glyph["codepoint"]): glyph for glyph in face["glyphs"]},
        {
            (int(item["first"]), int(item["second"])): int(item["amount"])
            for item in face["kerning"]
        },
    )


def _face_ids(script_path: Path) -> list[str]:
    source = require_regular_file(script_path, "Godot verification script").read_text(encoding="utf-8")
    match = _FACE_IDS_PATTERN.search(source)
    if match is None:
        fail("Godot verification script is missing its retained FACE_IDS specification")
    try:
        value = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        fail(f"Godot verification FACE_IDS specification is invalid: {exc}")
    if not isinstance(value, list) or not value or not all(isinstance(item, str) and item for item in value):
        fail("Godot verification FACE_IDS specification must be a non-empty string array")
    if len(value) != len(set(value)):
        fail("Godot verification FACE_IDS specification contains duplicate faces")
    return value


def _pixel_digest(pixels: set[tuple[int, int]]) -> str:
    payload = json.dumps(sorted([list(item) for item in pixels]), separators=(",", ":")).encode("ascii")
    return sha256_bytes(payload)


def _expected_from_evidence(evidence_root: Path) -> tuple[list[dict[str, Any]], set[tuple[int, int]]]:
    fixture = evidence_root / "fixture"
    face_ids = _face_ids(fixture / "verify.gd")
    font_root = fixture / "delivery" / "fonts"
    y = EVIDENCE_MARGIN
    combined: set[tuple[int, int]] = set()
    samples: list[dict[str, Any]] = []
    for face_id in face_ids:
        master_path = font_root / face_id / f"{face_id}.master.json"
        face, _raw = load_json(master_path, f"{face_id} render-proof master")
        records, kerning = _records(face)
        text = f"{face_id}{SAMPLE_SUFFIX}"
        missing_characters = sorted({character for character in text if ord(character) not in records})
        if missing_characters:
            fail(f"face {face_id} render sample requires missing characters: {missing_characters}")
        pixels, end_x = render_text_pixels(text, records, kerning, EVIDENCE_MARGIN, y)
        if not pixels:
            fail(f"face {face_id} native render sample is empty")
        if end_x > EVIDENCE_WIDTH - EVIDENCE_MARGIN:
            fail(f"face {face_id} native render sample exceeds the 320-pixel evidence width")
        if any(x < 0 or yy < 0 or x >= EVIDENCE_WIDTH or yy >= EVIDENCE_HEIGHT for x, yy in pixels):
            fail(f"face {face_id} native render sample escapes the 320x200 evidence viewport")
        overlap = combined & pixels
        if overlap:
            fail(f"face {face_id} native render sample overlaps another face at {sorted(overlap)[:8]}")
        bounds = [
            min(x for x, _ in pixels),
            min(yy for _, yy in pixels),
            max(x for x, _ in pixels),
            max(yy for _, yy in pixels),
        ]
        samples.append(
            {
                "faceId": face_id,
                "text": text,
                "position": [EVIDENCE_MARGIN, y],
                "advance": end_x - EVIDENCE_MARGIN,
                "bounds": bounds,
                "whitePixelCount": len(pixels),
                "pixelSha256": _pixel_digest(pixels),
            }
        )
        combined.update(pixels)
        y += int(face["metrics"]["lineHeight"]) + EVIDENCE_ROW_GAP
    if y - EVIDENCE_ROW_GAP > EVIDENCE_HEIGHT - EVIDENCE_MARGIN:
        fail("native render evidence face layout exceeds the 320x200 viewport")
    return samples, combined


def _expected_rgba(pixels: set[tuple[int, int]]) -> bytes:
    rgba = bytearray(b"\x00\x00\x00\xff" * (EVIDENCE_WIDTH * EVIDENCE_HEIGHT))
    for x, y in pixels:
        offset = (y * EVIDENCE_WIDTH + x) * 4
        rgba[offset : offset + 4] = b"\xff\xff\xff\xff"
    return bytes(rgba)


def install(build_module: ModuleType, cli_module: ModuleType) -> None:
    """Install the bounded sample and exact decoded-raster validator once."""
    if getattr(cli_module, "_exact_pixel_render_proof_installed", False):
        return

    original_generate_fixture = build_module.generate_godot_fixture
    original_validate_screenshot = cli_module._validate_godot_screenshot
    original_catalog = cli_module.catalog

    def generate_fixture(
        output_root: Path,
        family: Mapping[str, Any],
        face_outputs: Sequence[Mapping[str, Any]],
    ) -> dict[str, str]:
        result = original_generate_fixture(output_root, family, face_outputs)
        script_path = output_root / result["script"]
        source = require_regular_file(script_path, "generated Godot verification script").read_text(encoding="utf-8")
        if source.count(_SAMPLE_LINE) != 1:
            fail("generated Godot verification script sample anchor changed unexpectedly")
        source = source.replace(_SAMPLE_LINE, _REPLACEMENT_SAMPLE_LINE)
        script_path.write_text(source, encoding="utf-8", newline="\n")
        face_ids = _face_ids(script_path)
        if face_ids != [str(item["faceId"]) for item in face_outputs]:
            fail("generated Godot verification face order does not match the family output")
        return result

    def validate_screenshot(path: Path) -> dict[str, Any]:
        base = original_validate_screenshot(path)
        samples, expected_pixels = _expected_from_evidence(path.parent)
        width, height, rgba = cli_module._decode_rgba_png(path, "Godot render proof")
        if (width, height) != (EVIDENCE_WIDTH, EVIDENCE_HEIGHT):
            fail("Godot render proof dimensions changed during exact-pixel validation")
        actual_pixels = {
            (index // 4 % width, index // 4 // width)
            for index in range(0, len(rgba), 4)
            if rgba[index : index + 4] == b"\xff\xff\xff\xff"
        }
        missing = expected_pixels - actual_pixels
        extra = actual_pixels - expected_pixels
        if missing or extra:
            fail(
                "Godot render proof does not match the exact retained glyph raster: "
                f"missing={len(missing)} first_missing={sorted(missing)[:12]}, "
                f"extra={len(extra)} first_extra={sorted(extra)[:12]}"
            )
        expected_hash = sha256_bytes(_expected_rgba(expected_pixels))
        actual_hash = sha256_bytes(rgba)
        if actual_hash != expected_hash:
            fail("Godot render proof decoded RGBA identity does not match the exact retained glyph raster")
        return {
            **base,
            "decodedRgbaSha256": actual_hash,
            "expectedDecodedRgbaSha256": expected_hash,
            "sampleCount": len(samples),
            "samples": samples,
            "exactPixelMatch": True,
        }

    def catalog() -> dict[str, Any]:
        result = original_catalog()
        supports = list(result.get("supports", []))
        capability = "pixel-for-pixel Godot evidence comparison against deterministic face-master rasters"
        if capability not in supports:
            supports.append(capability)
        result["supports"] = supports
        godot = dict(result.get("godot", {}))
        godot.update(
            {
                "boundedUnclippedSampleRequired": True,
                "exactDecodedRgbaMatchRequired": True,
                "perFaceRasterIdentityRequired": True,
            }
        )
        result["godot"] = godot
        return result

    build_module.generate_godot_fixture = generate_fixture
    cli_module._validate_godot_screenshot = validate_screenshot
    cli_module.catalog = catalog
    cli_module._exact_pixel_render_proof_installed = True
