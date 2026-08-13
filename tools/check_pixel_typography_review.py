#!/usr/bin/env python3
"""Adversarial and integration checks for native-resolution typography review kits."""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from pixel_typography_review_engine import (
    BUILTIN_PROFILES,
    PixelTypographyReviewError,
    PROFILE_SCHEMA,
    build_review,
    compare_reviews,
    normalise_profile,
    validate_review,
)

ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
REPORT = ROOT / "pixel-typography-review-check-report.json"


def expect_error(fn, fragment: str) -> None:
    try:
        fn()
    except PixelTypographyReviewError as exc:
        if fragment not in str(exc):
            raise AssertionError(f"expected {fragment!r}, observed {exc!r}") from exc
    else:
        raise AssertionError(f"expected failure containing {fragment!r}")


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
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, shell=False, check=False)
    if result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    fonts = sorted((destination / "runtime").glob("*.fnt"))
    if len(fonts) != 1:
        raise AssertionError(f"expected one BMFont fixture, observed {fonts}")
    return fonts[0]


def style() -> dict:
    return {
        "schema": "evavo.pixel-text-style.v1",
        "styleId": "review-check-style",
        "displayName": "Review Check Style",
        "description": "Bounded two-colour animated review test style.",
        "background": "#00000000",
        "padding": 1,
        "layout": {
            "align": "left",
            "tracking": 0,
            "lineGap": 0,
            "tabSpaces": 4,
            "missingGlyph": "error",
            "replacementCodepoint": 65533,
        },
        "canvas": {"width": 0, "height": 0, "anchor": "center"},
        "operations": [
            {"op": "recolour", "colour": "#f4d58dff"},
            {"op": "outline", "radius": 1, "connectivity": 8, "colour": "#1a0b12ff"},
        ],
        "animation": {
            "frames": 4,
            "fps": 8,
            "loop": True,
            "motions": [{"op": "blink", "pattern": [255, 220, 255, 200]}],
        },
        "output": {
            "individualFrames": True,
            "sheet": True,
            "webBundle": False,
            "godotResourceRoot": "",
        },
    }


def profile() -> dict:
    return {
        "schema": PROFILE_SCHEMA,
        "profileId": "integration-160x100",
        "displayName": "Integration 160x100",
        "description": "Exercises native, display-aspect, animated, palette and integer-scale review evidence.",
        "eraProfile": "vga-dos-era",
        "nativeResolution": {"width": 160, "height": 100},
        "displayPreview": {"width": 160, "height": 120, "integerScales": [2]},
        "background": "#090611ff",
        "padding": 6,
        "gap": 4,
        "paletteBudget": 8,
        "integerScales": [2, 3],
        "pages": [
            {
                "id": "alphabet",
                "align": "left",
                "samples": [
                    {"id": "upper", "role": "alphabet-uppercase", "text": "ABC"},
                    {"id": "lower", "role": "alphabet-lowercase", "text": "abc"},
                    {"id": "digits", "role": "numerals", "text": "101"},
                ],
            },
            {
                "id": "motion",
                "align": "center",
                "samples": [
                    {
                        "id": "motion-grid",
                        "role": "animation-strip",
                        "text": "ABC 101",
                        "renderMode": "animation-grid",
                        "frameColumns": 2,
                        "frameGap": 1,
                    }
                ],
            },
        ],
    }


def main() -> int:
    temporary = Path(tempfile.mkdtemp(prefix="evavo-pixel-review-check-"))
    try:
        assert len(BUILTIN_PROFILES) >= 3
        normalised = normalise_profile(profile())
        assert normalised["nativeResolution"] == {"width": 160, "height": 100}
        assert normalised["displayPreview"] == {"width": 160, "height": 120, "integerScales": [2]}
        assert normalised["eraProfile"] == "vga-dos-era"
        assert normalised["integerScales"] == [2, 3]

        invalid_role = deepcopy(profile())
        invalid_role["pages"][0]["samples"][0]["role"] = "invented-role"
        expect_error(lambda: normalise_profile(invalid_role), "role must be one of")

        missing_height = deepcopy(profile())
        del missing_height["nativeResolution"]["height"]
        expect_error(lambda: normalise_profile(missing_height), "exactly width and height")

        invalid_budget = deepcopy(profile())
        invalid_budget["paletteBudget"] = 1
        expect_error(lambda: normalise_profile(invalid_budget), "0 or at least 2")

        style_path = temporary / "review.style.json"
        style_path.write_text(json.dumps(style(), indent=2) + "\n", "utf-8")
        font = compile_fixture(temporary / "font-build")
        first = temporary / "review-first"
        second = temporary / "review-second"
        first_manifest = build_review(font, style_path, profile(), first)
        build_review(font, style_path, profile(), second)
        first_validation = validate_review(first)
        assert first_validation["status"] == "passed"
        assert first_validation["pageCount"] == 2
        assert first_validation["sampleCount"] == 4
        assert first_validation["paletteCount"] <= 8
        assert (first / "pages" / "alphabet.png").is_file()
        assert (first / "pages" / "motion.png").is_file()
        assert (first / "previews" / "alphabet-3x.png").is_file()
        assert (first / "display" / "alphabet.png").is_file()
        assert (first / "display-previews" / "alphabet-2x.png").is_file()
        assert first_validation["displayPreview"] == {"width": 160, "height": 120, "integerScales": [2]}
        assert first_validation["displayCorrectedPageCount"] == 2
        assert (first / "palette" / "palette.png").is_file()
        assert (first / "review-map.json").is_file()
        comparison = compare_reviews(first, second)
        assert comparison["identical"] is True

        overflow = deepcopy(profile())
        overflow["profileId"] = "overflow"
        overflow["nativeResolution"] = {"width": 8, "height": 8}
        expect_error(lambda: build_review(font, style_path, overflow, temporary / "overflow"), "allows")

        over_budget = deepcopy(profile())
        over_budget["profileId"] = "over-budget"
        over_budget["paletteBudget"] = 2
        expect_error(lambda: build_review(font, style_path, over_budget, temporary / "over-budget"), "exceeding paletteBudget")

        tampered = temporary / "tampered"
        shutil.copytree(first, tampered)
        preview = tampered / "display-previews" / "alphabet-2x.png"
        preview.write_bytes(preview.read_bytes() + b"tamper")
        expect_error(lambda: validate_review(tampered), "identity mismatch")

        report = {
            "schema": "evavo.pixel-typography-review-check.v1",
            "engineVersion": "1.1.0",
            "status": "passed",
            "profilePresetCount": len(BUILTIN_PROFILES),
            "pageCount": first_validation["pageCount"],
            "sampleCount": first_validation["sampleCount"],
            "paletteCount": first_validation["paletteCount"],
            "displayCorrectedPageCount": first_validation["displayCorrectedPageCount"],
            "pixelWidthToHeightRatio": first_manifest["pages"][0]["displayPreview"]["pixelWidthToHeightRatio"],
            "buildSha256": first_manifest["buildSha256"],
            "deterministicTreeSha256": comparison["treeSha256"],
        }
        REPORT.write_text(json.dumps(report, indent=2) + "\n", "utf-8")
        print("EVAVO_PIXEL_TYPOGRAPHY_REVIEW_CHECK_OK")
        print(json.dumps(report, indent=2))
        return 0
    finally:
        shutil.rmtree(temporary, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
