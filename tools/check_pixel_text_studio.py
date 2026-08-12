#!/usr/bin/env python3
"""Adversarial and integration checks for EVAVO Pixel Text Studio."""
from __future__ import annotations

import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib

from pixel_font_universal.common import PixelFontUniversalError, sha256_file
from pixel_text_studio_engine import (
    BUILTIN_PRESETS,
    STYLE_SCHEMA,
    compare_builds,
    decode_rgba_png,
    normalise_style,
    render_build,
    style_from_preset,
    validate_build,
)

ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable


def expect_error(fn, fragment: str) -> None:
    try:
        fn()
    except PixelFontUniversalError as exc:
        if fragment not in str(exc):
            raise AssertionError(f"expected {fragment!r}, observed {exc!r}") from exc
    else:
        raise AssertionError(f"expected failure containing {fragment!r}")


def filtered_png(width: int, height: int, rgba: bytes) -> bytes:
    """Create an RGBA PNG using Sub filtering so the external decoder is exercised."""
    if len(rgba) != width * height * 4:
        raise AssertionError("fixture RGBA length mismatch")
    rows = []
    stride = width * 4
    for y in range(height):
        source = rgba[y * stride:(y + 1) * stride]
        encoded = bytearray(stride)
        for index, value in enumerate(source):
            left = source[index - 4] if index >= 4 else 0
            encoded[index] = (value - left) & 0xFF
        rows.append(b"\x01" + bytes(encoded))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )


def compile_fixture(destination: Path) -> Path:
    command = [
        PYTHON,
        str(ROOT / "tools" / "pixel_font_universal.py"),
        "compile",
        "--face",
        str(ROOT / "examples" / "pixel-font-universal" / "binary-proportional.face.json"),
        "--profile",
        str(ROOT / "examples" / "pixel-font-universal" / "dos-mono.profile.json"),
        "--output",
        str(destination),
    ]
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)
    if result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    fonts = sorted((destination / "runtime").glob("*.fnt"))
    if len(fonts) != 1:
        raise AssertionError(f"expected one BMFont fixture, observed {fonts}")
    return fonts[0]


def main() -> int:
    temporary = Path(tempfile.mkdtemp(prefix="evavo-pixel-text-check-"))
    try:
        # Standard PNG filter support is required for external BMFont inputs.
        raw = bytes([
            255, 255, 255, 255,
            0, 0, 0, 0,
            30, 60, 90, 255,
            220, 160, 80, 128,
        ])
        png = filtered_png(2, 2, raw)
        width, height, decoded = decode_rgba_png(png, "filtered fixture")
        assert (width, height, decoded) == (2, 2, raw)

        font_build = temporary / "font-build"
        font = compile_fixture(font_build)

        # Every built-in preset must normalise and keep pixel-safe defaults.
        for preset in sorted(BUILTIN_PRESETS):
            style = style_from_preset(preset)
            assert style["schema"] == STYLE_SCHEMA
            assert style["output"]["individualFrames"] is True
            example = json.loads((ROOT / "examples" / "pixel-text-studio" / f"{preset}.style.json").read_text("utf-8"))
            assert normalise_style(example) == style

        incomplete_output = style_from_preset("dos-brass-title")
        incomplete_output["output"]["individualFrames"] = False
        expect_error(lambda: normalise_style(incomplete_output), "individualFrames must remain true")

        static_style = style_from_preset("arcade-chrome-title")
        static_one = temporary / "static-one"
        result = render_build(font, "ABC 101", static_style, static_one)
        assert result["status"] == "passed"
        assert result["frameCount"] == 1
        assert (static_one / "title.png").is_file()
        assert (static_one / "sheet.png").is_file()
        assert "image-rendering: pixelated" in (static_one / "web" / "pixel-text.css").read_text("utf-8")
        assert validate_build(static_one)["status"] == "passed"

        # Create-only output policy must fail closed.
        expect_error(lambda: render_build(font, "ABC", static_style, static_one), "already exists")

        # Deterministic static build identity.
        static_two = temporary / "static-two"
        render_build(font, "ABC 101", static_style, static_two)
        comparison = compare_builds(static_one, static_two)
        assert comparison["identical"] is True

        # Animation, shine and sparkle produce multiple valid distinct frames.
        animated_style = style_from_preset("fantasy-fire-title")
        animated = temporary / "animated"
        animated_result = render_build(font, "ABC", animated_style, animated)
        assert animated_result["frameCount"] == 8
        hashes = [item["sha256"] for item in animated_result["frames"]]
        assert len(set(hashes)) > 1
        assert validate_build(animated)["frameCount"] == 8

        # Exercise taper, wave, jitter, type-on and optional Godot export together.
        advanced_style = {
            "schema": STYLE_SCHEMA,
            "styleId": "advanced-fixture",
            "displayName": "Advanced Fixture",
            "description": "Exercises title-only transforms and motion.",
            "background": "#00000000",
            "padding": 4,
            "layout": {"align": "center", "tracking": 1, "lineGap": 1, "tabSpaces": 4, "missingGlyph": "error", "replacementCodepoint": 65533},
            "canvas": {"width": 0, "height": 0, "anchor": "center"},
            "operations": [
                {"op": "bands", "axis": "vertical", "colours": ["#fff0a0ff", "#c06030ff", "#601828ff"]},
                {"op": "taper", "topPercent": 80, "bottomPercent": 120, "anchor": "center"},
                {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#100810ff"},
                {"op": "extrude", "depth": 2, "dx": 1, "dy": 1, "colours": ["#401830ff", "#180810ff"]},
            ],
            "animation": {
                "frames": 6,
                "fps": 6,
                "loop": True,
                "motions": [
                    {"op": "wave", "pattern": [0, 1, 0, -1], "glyphPhase": 1, "framePhase": 1},
                    {"op": "jitter", "x": 1, "y": 0, "seed": "fixture"},
                    {"op": "type-on", "startFrame": 0, "endFrame": 3},
                    {"op": "sparkle", "colour": "#ffffffff", "count": 1, "radius": 1, "seed": "spark"},
                ],
            },
            "output": {"individualFrames": True, "sheet": True, "webBundle": True, "godotResourceRoot": "res://assets/ui/titles/advanced-fixture"},
        }
        advanced = temporary / "advanced"
        render_build(font, "ABC", advanced_style, advanced)
        assert (advanced / "godot" / "pixel-text-spriteframes.tres").is_file()
        assert "res://assets/ui/titles/advanced-fixture/frames/frame-000.png" in (
            advanced / "godot" / "pixel-text-spriteframes.tres"
        ).read_text("utf-8")
        assert validate_build(advanced)["status"] == "passed"

        # Bad creative/control data must not silently coerce.
        invalid = style_from_preset("dos-brass-title")
        invalid["operations"] = [{"op": "gaussian-blur"}]
        expect_error(lambda: normalise_style(invalid), "not supported")
        tiny = style_from_preset("dos-brass-title")
        tiny["canvas"] = {"width": 1, "height": 1, "anchor": "center"}
        expect_error(lambda: render_build(font, "ABC", tiny, temporary / "tiny"), "smaller")
        expect_error(lambda: render_build(font, "Z", static_style, temporary / "missing"), "no glyph")

        # Retained build data must detect tampering.
        tampered = temporary / "tampered"
        shutil.copytree(static_one, tampered)
        frame = tampered / "frames" / "frame-000.png"
        frame.write_bytes(frame.read_bytes() + b"tamper")
        expect_error(lambda: validate_build(tampered), "identity mismatch")

        print("EVAVO_PIXEL_TEXT_STUDIO_CHECK_OK")
        print(json.dumps({
            "presetCount": len(BUILTIN_PRESETS),
            "staticBuildSha256": result["buildSha256"],
            "animatedFrameCount": animated_result["frameCount"],
            "deterministicTreeSha256": comparison["treeSha256"],
        }, indent=2))
        return 0
    finally:
        shutil.rmtree(temporary, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
