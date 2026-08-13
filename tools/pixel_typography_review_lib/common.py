"""Schemas and normalisation for EVAVO native-resolution typography review."""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from typing import Any

from pixel_font_universal.common import (
    PixelFontUniversalError,
    bounded_int,
    colour_hex,
    parse_colour,
    safe_id,
    text as bounded_text,
)

ENGINE_VERSION = "1.1.0"
PROFILE_SCHEMA = "evavo.pixel-typography-review-profile.v1"
BUILD_SCHEMA = "evavo.pixel-typography-review-build.v1"
VALIDATION_SCHEMA = "evavo.pixel-typography-review-validation.v1"
CATALOG_SCHEMA = "evavo.pixel-typography-review-catalog.v1"
MAP_SCHEMA = "evavo.pixel-typography-review-map.v1"
MAX_CANVAS_EDGE = 8192
MAX_PIXELS = 64 * 1024 * 1024
MAX_PAGES = 32
MAX_SAMPLES = 128
MAX_SCALES = 8
MAX_PALETTE_COLOURS = 4096

ERA_PROFILES = frozenset({
    "era-neutral",
    "cga-era",
    "ega-era",
    "vga-dos-era",
    "amiga-era",
    "sixteen-bit-console-era",
    "nineteen-nineties-arcade-era",
    "modern-pixel-era",
})
USAGE_ROLES = frozenset({
    "title",
    "logo",
    "heading",
    "alphabet-uppercase",
    "alphabet-lowercase",
    "numerals",
    "punctuation",
    "menu-label",
    "button-label",
    "hud-label",
    "status-text",
    "badge",
    "animation-strip",
    "decorative-text",
})
TEXT_PRESETS = {
    "uppercase": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "lowercase": "abcdefghijklmnopqrstuvwxyz",
    "digits": "0123456789",
    "punctuation": "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
    "menu": "NEW GAME  LOAD GAME  OPTIONS  QUIT",
    "hud": "SCORE 001250  TIME 09:42  HP 100",
    "status": "CHECK  READY  PAUSED  VICTORY",
}


class PixelTypographyReviewError(PixelFontUniversalError):
    """Fail-closed native-resolution review error."""


def fail(message: str) -> None:
    raise PixelTypographyReviewError(message)


def load_json(path: Path, label: str) -> Any:
    if not path.is_file() or path.is_symlink():
        fail(f"{label} must be a regular non-symlink file: {path}")
    if path.stat().st_size > 16 * 1024 * 1024:
        fail(f"{label} exceeds the 16 MiB limit")
    try:
        return json.loads(path.read_text("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"{label} is not valid UTF-8 JSON: {exc}")


def _sample(sample_id: str, role: str, *, value: str | None = None, preset: str | None = None, render_mode: str = "static") -> dict[str, Any]:
    result: dict[str, Any] = {"id": sample_id, "role": role, "renderMode": render_mode}
    if value is not None:
        result["text"] = value
    if preset is not None:
        result["textPreset"] = preset
    if render_mode == "animation-grid":
        result.update({"frameColumns": 2, "frameGap": 1})
    return result


def _profile(profile_id: str, display_name: str, description: str, era_profile: str, width: int, height: int, background: str, palette_budget: int, scales: list[int], display_preview: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "schema": PROFILE_SCHEMA,
        "profileId": profile_id,
        "displayName": display_name,
        "description": description,
        "eraProfile": era_profile,
        "nativeResolution": {"width": width, "height": height},
        "displayPreview": display_preview,
        "background": background,
        "padding": 8,
        "gap": 5,
        "paletteBudget": palette_budget,
        "integerScales": scales,
        "pages": [
            {"id": "title", "align": "center", "samples": [
                _sample("title-static", "title", value="CHESS LORD"),
                _sample("title-motion", "animation-strip", value="BATTLE CHESS", render_mode="animation-grid"),
            ]},
            {"id": "alphabet", "align": "left", "samples": [
                _sample("uppercase", "alphabet-uppercase", preset="uppercase"),
                _sample("lowercase", "alphabet-lowercase", preset="lowercase"),
                _sample("digits", "numerals", preset="digits"),
                _sample("punctuation", "punctuation", preset="punctuation"),
            ]},
            {"id": "ui", "align": "left", "samples": [
                _sample("menu", "menu-label", preset="menu"),
                _sample("hud", "hud-label", preset="hud"),
                _sample("status", "status-text", preset="status"),
            ]},
        ],
    }


BUILTIN_PROFILES: dict[str, dict[str, Any]] = {
    "vga-dos-320x200": _profile("vga-dos-320x200", "VGA DOS 320x200", "Native 320x200 review pages plus a 320x240 display-aspect preview for a restrained early-1990s DOS treatment.", "vga-dos-era", 320, 200, "#090611ff", 16, [2, 3], {"width": 320, "height": 240, "integerScales": [2, 3]}),
    "arcade-320x240": _profile("arcade-320x240", "1990s Arcade 320x240", "Native 320x240 review pages for an original 1990s arcade treatment.", "nineteen-nineties-arcade-era", 320, 240, "#05050aff", 32, [2, 3]),
    "web-pixel-640x360": _profile("web-pixel-640x360", "Web Pixel 640x360", "A 640x360 raster review target for game sites and web presentation.", "modern-pixel-era", 640, 360, "#090611ff", 64, [2]),
}


def catalog() -> dict[str, Any]:
    return {
        "schema": CATALOG_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "purpose": "Deterministic native-resolution review packages for pixel-font and Pixel Text output.",
        "profileSchema": PROFILE_SCHEMA,
        "buildSchema": BUILD_SCHEMA,
        "eraProfiles": sorted(ERA_PROFILES),
        "usageRoles": sorted(USAGE_ROLES),
        "profilePresets": sorted(BUILTIN_PROFILES),
        "textPresets": sorted(TEXT_PRESETS),
        "outputs": [
            "native-resolution RGBA review pages",
            "retained static specimens and animation grids",
            "exact integer-scale nearest-neighbour previews",
            "optional display-aspect-corrected previews with source/display/pixel ratio evidence",
            "observed palette swatches",
            "review rectangle map",
            "SHA-256 manifest and source evidence",
        ],
        "displayAspectCorrection": True,
        "pixelAspectEvidence": True,
        "policy": {
            "createOnly": True,
            "transactional": True,
            "nearestOnly": True,
            "integerCoordinates": True,
            "antialiasing": False,
            "fontMasterMutation": False,
            "creativeApproval": False,
            "targetRepositoryMutation": False,
            "gitCommit": False,
            "gitPush": False,
            "publication": False,
        },
    }


def profile_from_preset(preset: str, profile_id: str | None = None) -> dict[str, Any]:
    if preset not in BUILTIN_PROFILES:
        fail(f"unknown review profile preset {preset!r}")
    value = deepcopy(BUILTIN_PROFILES[preset])
    if profile_id is not None:
        value["profileId"] = safe_id(profile_id, "profileId")
    return normalise_profile(value)


def normalise_profile(value: Any, *, label: str = "review profile") -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("schema") != PROFILE_SCHEMA:
        fail(f"{label}.schema must be {PROFILE_SCHEMA}")
    allowed = {"schema", "engineVersion", "profileId", "displayName", "description", "eraProfile", "nativeResolution", "displayPreview", "background", "padding", "gap", "paletteBudget", "integerScales", "pages"}
    unknown = sorted(set(value) - allowed)
    if unknown:
        fail(f"{label} contains unsupported fields: {', '.join(unknown)}")
    if "engineVersion" in value and value["engineVersion"] != ENGINE_VERSION:
        fail(f"{label}.engineVersion must be {ENGINE_VERSION}")
    profile_id = safe_id(value.get("profileId"), f"{label}.profileId")
    era_profile = value.get("eraProfile", "era-neutral")
    if era_profile not in ERA_PROFILES:
        fail(f"{label}.eraProfile must be one of: {', '.join(sorted(ERA_PROFILES))}")
    native = value.get("nativeResolution")
    if not isinstance(native, dict) or set(native) != {"width", "height"}:
        fail(f"{label}.nativeResolution must contain exactly width and height")
    width = bounded_int(native["width"], f"{label}.nativeResolution.width", 1, MAX_CANVAS_EDGE)
    height = bounded_int(native["height"], f"{label}.nativeResolution.height", 1, MAX_CANVAS_EDGE)
    if width * height > MAX_PIXELS:
        fail(f"{label}.nativeResolution exceeds the pixel budget")
    budget = bounded_int(value.get("paletteBudget", 0), f"{label}.paletteBudget", 0, 256)
    if budget == 1:
        fail(f"{label}.paletteBudget must be 0 or at least 2")
    scales_raw = value.get("integerScales", [2])
    if not isinstance(scales_raw, list) or not 1 <= len(scales_raw) <= MAX_SCALES:
        fail(f"{label}.integerScales must contain 1..{MAX_SCALES} values")
    scales = sorted({bounded_int(item, f"{label}.integerScales", 1, 8) for item in scales_raw})

    display_raw = value.get("displayPreview")
    if display_raw is None:
        display_preview = None
    else:
        if not isinstance(display_raw, dict) or set(display_raw) != {"width", "height", "integerScales"}:
            fail(f"{label}.displayPreview must contain exactly width, height and integerScales")
        display_width = bounded_int(display_raw["width"], f"{label}.displayPreview.width", 1, MAX_CANVAS_EDGE)
        display_height = bounded_int(display_raw["height"], f"{label}.displayPreview.height", 1, MAX_CANVAS_EDGE)
        if display_width * display_height > MAX_PIXELS:
            fail(f"{label}.displayPreview exceeds the pixel budget")
        display_scales_raw = display_raw["integerScales"]
        if not isinstance(display_scales_raw, list) or not 1 <= len(display_scales_raw) <= MAX_SCALES:
            fail(f"{label}.displayPreview.integerScales must contain 1..{MAX_SCALES} values")
        display_scales = sorted({bounded_int(item, f"{label}.displayPreview.integerScales", 1, 8) for item in display_scales_raw})
        display_preview = {"width": display_width, "height": display_height, "integerScales": display_scales}

    pages_raw = value.get("pages")
    if not isinstance(pages_raw, list) or not 1 <= len(pages_raw) <= MAX_PAGES:
        fail(f"{label}.pages must contain 1..{MAX_PAGES} pages")

    page_ids: set[str] = set()
    sample_ids: set[str] = set()
    pages: list[dict[str, Any]] = []
    sample_count = 0
    for page_index, page_raw in enumerate(pages_raw):
        page_label = f"{label}.pages[{page_index}]"
        if not isinstance(page_raw, dict) or set(page_raw) - {"id", "align", "samples"}:
            fail(f"{page_label} must be an object with id, align and samples")
        page_id = safe_id(page_raw.get("id"), f"{page_label}.id")
        if page_id in page_ids:
            fail(f"{page_label}.id duplicates {page_id!r}")
        page_ids.add(page_id)
        align = page_raw.get("align", "left")
        if align not in {"left", "center", "right"}:
            fail(f"{page_label}.align must be left, center or right")
        samples_raw = page_raw.get("samples")
        if not isinstance(samples_raw, list) or not samples_raw:
            fail(f"{page_label}.samples must be a non-empty array")
        samples: list[dict[str, Any]] = []
        for sample_index, sample_raw in enumerate(samples_raw):
            sample_label = f"{page_label}.samples[{sample_index}]"
            allowed_sample = {"id", "role", "text", "textPreset", "renderMode", "frameColumns", "frameGap"}
            if not isinstance(sample_raw, dict) or set(sample_raw) - allowed_sample:
                fail(f"{sample_label} contains unsupported fields")
            sample_id = safe_id(sample_raw.get("id"), f"{sample_label}.id")
            if sample_id in sample_ids:
                fail(f"{sample_label}.id duplicates {sample_id!r}")
            sample_ids.add(sample_id)
            role = sample_raw.get("role")
            if role not in USAGE_ROLES:
                fail(f"{sample_label}.role must be one of: {', '.join(sorted(USAGE_ROLES))}")
            has_text = sample_raw.get("text") is not None
            has_preset = sample_raw.get("textPreset") is not None
            if has_text == has_preset:
                fail(f"{sample_label} must define exactly one of text or textPreset")
            if has_text:
                text_value = bounded_text(sample_raw["text"], f"{sample_label}.text", 4096)
                preset = None
            else:
                preset = sample_raw["textPreset"]
                if preset not in TEXT_PRESETS:
                    fail(f"{sample_label}.textPreset must be one of: {', '.join(sorted(TEXT_PRESETS))}")
                text_value = TEXT_PRESETS[preset]
            render_mode = sample_raw.get("renderMode", "static")
            if render_mode not in {"static", "animation-grid"}:
                fail(f"{sample_label}.renderMode must be static or animation-grid")
            samples.append({
                "id": sample_id,
                "role": role,
                "text": text_value,
                "textPreset": preset,
                "renderMode": render_mode,
                "frameColumns": bounded_int(sample_raw.get("frameColumns", 4), f"{sample_label}.frameColumns", 1, 16),
                "frameGap": bounded_int(sample_raw.get("frameGap", 1), f"{sample_label}.frameGap", 0, 16),
            })
            sample_count += 1
            if sample_count > MAX_SAMPLES:
                fail(f"{label} exceeds the {MAX_SAMPLES}-sample limit")
        pages.append({"id": page_id, "align": align, "samples": samples})

    return {
        "schema": PROFILE_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "profileId": profile_id,
        "displayName": bounded_text(value.get("displayName", profile_id), f"{label}.displayName", 256),
        "description": bounded_text(value.get("description", "Deterministic native-resolution pixel typography review."), f"{label}.description", 4096),
        "eraProfile": era_profile,
        "nativeResolution": {"width": width, "height": height},
        "displayPreview": display_preview,
        "background": colour_hex(parse_colour(value.get("background", "#000000ff"), f"{label}.background")),
        "padding": bounded_int(value.get("padding", 8), f"{label}.padding", 0, 512),
        "gap": bounded_int(value.get("gap", 4), f"{label}.gap", 0, 256),
        "paletteBudget": budget,
        "integerScales": scales,
        "pages": pages,
    }
