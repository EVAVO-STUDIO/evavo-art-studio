"""Deterministic native-resolution review kits for EVAVO pixel typography."""
from __future__ import annotations

import argparse
from copy import deepcopy
import json
from math import ceil
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any, Mapping, Sequence

from pixel_font_universal.common import (
    PixelFontUniversalError,
    RGBA,
    alpha_composite,
    bounded_int,
    canonical_json,
    colour_hex,
    parse_colour,
    pretty_json,
    safe_id,
    sha256_bytes,
    sha256_file,
    text as bounded_text,
)
from pixel_font_universal.formats import png_rgba
from pixel_text_studio_engine import (
    decode_rgba_png,
    load_bitmap_font,
    normalise_style,
    render_build,
    validate_build,
)

ENGINE_VERSION = "1.0.0"
PROFILE_SCHEMA = "evavo.pixel-typography-review-profile.v1"
BUILD_SCHEMA = "evavo.pixel-typography-review-build.v1"
VALIDATION_SCHEMA = "evavo.pixel-typography-review-validation.v1"
CATALOG_SCHEMA = "evavo.pixel-typography-review-catalog.v1"
MAX_CANVAS_EDGE = 8192
MAX_PIXELS = 64 * 1024 * 1024
MAX_PAGES = 32
MAX_SAMPLES = 128
MAX_SCALES = 8
MAX_PALETTE_COLOURS = 4096

ERA_PROFILES = frozenset(
    {
        "era-neutral",
        "cga-era",
        "ega-era",
        "vga-dos-era",
        "amiga-era",
        "sixteen-bit-console-era",
        "nineteen-nineties-arcade-era",
        "modern-pixel-era",
    }
)
USAGE_ROLES = frozenset(
    {
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
    }
)
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


def _load_json(path: Path, label: str) -> Any:
    if not path.is_file() or path.is_symlink():
        fail(f"{label} must be a regular non-symlink file: {path}")
    if path.stat().st_size > 16 * 1024 * 1024:
        fail(f"{label} exceeds the 16 MiB limit")
    try:
        return json.loads(path.read_text("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"{label} is not valid UTF-8 JSON: {exc}")


def _sample(
    sample_id: str,
    role: str,
    *,
    text: str | None = None,
    text_preset: str | None = None,
    render_mode: str = "static",
    frame_columns: int = 4,
    frame_gap: int = 1,
) -> dict[str, Any]:
    value: dict[str, Any] = {"id": sample_id, "role": role, "renderMode": render_mode}
    if text is not None:
        value["text"] = text
    if text_preset is not None:
        value["textPreset"] = text_preset
    if render_mode == "animation-grid":
        value["frameColumns"] = frame_columns
        value["frameGap"] = frame_gap
    return value


def _profile(
    profile_id: str,
    display_name: str,
    description: str,
    era_profile: str,
    width: int,
    height: int,
    background: str,
    palette_budget: int,
    integer_scales: list[int],
) -> dict[str, Any]:
    return {
        "schema": PROFILE_SCHEMA,
        "profileId": profile_id,
        "displayName": display_name,
        "description": description,
        "eraProfile": era_profile,
        "nativeResolution": {"width": width, "height": height},
        "background": background,
        "padding": 8,
        "gap": 5,
        "paletteBudget": palette_budget,
        "integerScales": integer_scales,
        "pages": [
            {
                "id": "title",
                "align": "center",
                "samples": [
                    _sample("title-static", "title", text="CHESS LORD"),
                    _sample(
                        "title-motion",
                        "animation-strip",
                        text="BATTLE CHESS",
                        render_mode="animation-grid",
                    ),
                ],
            },
            {
                "id": "alphabet",
                "align": "left",
                "samples": [
                    _sample("uppercase", "alphabet-uppercase", text_preset="uppercase"),
                    _sample("lowercase", "alphabet-lowercase", text_preset="lowercase"),
                    _sample("digits", "numerals", text_preset="digits"),
                    _sample("punctuation", "punctuation", text_preset="punctuation"),
                ],
            },
            {
                "id": "ui",
                "align": "left",
                "samples": [
                    _sample("menu", "menu-label", text_preset="menu"),
                    _sample("hud", "hud-label", text_preset="hud"),
                    _sample("status", "status-text", text_preset="status"),
                ],
            },
        ],
    }


BUILTIN_PROFILES: dict[str, dict[str, Any]] = {
    "vga-dos-320x200": _profile(
        "vga-dos-320x200",
        "VGA DOS 320x200",
        "Native 320x200 review pages for a restrained early-1990s DOS game font or title treatment.",
        "vga-dos-era",
        320,
        200,
        "#090611ff",
        16,
        [2, 3],
    ),
    "arcade-320x240": _profile(
        "arcade-320x240",
        "1990s Arcade 320x240",
        "Native 320x240 review pages for an original 1990s arcade-style display treatment.",
        "nineteen-nineties-arcade-era",
        320,
        240,
        "#05050aff",
        32,
        [2, 3],
    ),
    "web-pixel-640x360": _profile(
        "web-pixel-640x360",
        "Web Pixel 640x360",
        "A 640x360 authored raster review target for game sites and web presentation assets.",
        "modern-pixel-era",
        640,
        360,
        "#090611ff",
        64,
        [2],
    ),
}


def catalog() -> dict[str, Any]:
    return {
        "schema": CATALOG_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "purpose": "Deterministic native-resolution review packages for pixel-font and Pixel Text Studio output.",
        "profileSchema": PROFILE_SCHEMA,
        "buildSchema": BUILD_SCHEMA,
        "eraProfiles": sorted(ERA_PROFILES),
        "usageRoles": sorted(USAGE_ROLES),
        "profilePresets": sorted(BUILTIN_PROFILES),
        "textPresets": sorted(TEXT_PRESETS),
        "outputs": [
            "native-resolution RGBA review pages",
            "retained specimen and animation-grid PNGs",
            "exact integer-scale nearest-neighbour previews",
            "observed palette swatches",
            "review rectangle map",
            "SHA-256 manifest and source evidence",
        ],
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
    allowed = {
        "schema",
        "profileId",
        "displayName",
        "description",
        "eraProfile",
        "nativeResolution",
        "background",
        "padding",
        "gap",
        "paletteBudget",
        "integerScales",
        "pages",
    }
    unknown = sorted(set(value) - allowed)
    if unknown:
        fail(f"{label} contains unsupported fields: {', '.join(unknown)}")
    profile_id = safe_id(value.get("profileId"), f"{label}.profileId")
    era_profile = value.get("eraProfile", "era-neutral")
    if era_profile not in ERA_PROFILES:
        fail(f"{label}.eraProfile must be one of: {', '.join(sorted(ERA_PROFILES))}")
    native = value.get("nativeResolution")
    if not isinstance(native, dict):
        fail(f"{label}.nativeResolution must be an object")
    width = bounded_int(native.get("width"), f"{label}.nativeResolution.width", 1, MAX_CANVAS_EDGE)
    height = bounded_int(native.get("height"), f"{label}.nativeResolution.height", 1, MAX_CANVAS_EDGE)
    if width * height > MAX_PIXELS:
        fail(f"{label}.nativeResolution exceeds the pixel budget")
    palette_budget = bounded_int(value.get("paletteBudget", 0), f"{label}.paletteBudget", 0, 256)
    if palette_budget == 1:
        fail(f"{label}.paletteBudget must be 0 or at least 2")
    scales_raw = value.get("integerScales", [2])
    if not isinstance(scales_raw, list) or not 1 <= len(scales_raw) <= MAX_SCALES:
        fail(f"{label}.integerScales must contain 1..{MAX_SCALES} entries")
    scales = sorted(
        {
            bounded_int(item, f"{label}.integerScales", 1, 8)
            for item in scales_raw
        }
    )
    pages_raw = value.get("pages")
    if not isinstance(pages_raw, list) or not 1 <= len(pages_raw) <= MAX_PAGES:
        fail(f"{label}.pages must contain 1..{MAX_PAGES} pages")
    page_ids: set[str] = set()
    sample_ids: set[str] = set()
    pages: list[dict[str, Any]] = []
    total_samples = 0
    for page_index, raw_page in enumerate(pages_raw):
        page_label = f"{label}.pages[{page_index}]"
        if not isinstance(raw_page, dict):
            fail(f"{page_label} must be an object")
        page_id = safe_id(raw_page.get("id"), f"{page_label}.id")
        if page_id in page_ids:
            fail(f"{page_label}.id duplicates {page_id!r}")
        page_ids.add(page_id)
        align = raw_page.get("align", "left")
        if align not in {"left", "center", "right"}:
            fail(f"{page_label}.align must be left, center or right")
        samples_raw = raw_page.get("samples")
        if not isinstance(samples_raw, list) or not samples_raw:
            fail(f"{page_label}.samples must be a non-empty array")
        samples: list[dict[str, Any]] = []
        for sample_index, raw_sample in enumerate(samples_raw):
            sample_label = f"{page_label}.samples[{sample_index}]"
            if not isinstance(raw_sample, dict):
                fail(f"{sample_label} must be an object")
            sample_id = safe_id(raw_sample.get("id"), f"{sample_label}.id")
            if sample_id in sample_ids:
                fail(f"{sample_label}.id duplicates {sample_id!r}")
            sample_ids.add(sample_id)
            role = raw_sample.get("role")
            if role not in USAGE_ROLES:
                fail(f"{sample_label}.role must be one of: {', '.join(sorted(USAGE_ROLES))}")
            has_text = "text" in raw_sample
            has_preset = "textPreset" in raw_sample
            if has_text == has_preset:
                fail(f"{sample_label} must define exactly one of text or textPreset")
            if has_text:
                text_value = bounded_text(raw_sample["text"], f"{sample_label}.text", 4096)
                text_preset = None
            else:
                text_preset = raw_sample["textPreset"]
                if text_preset not in TEXT_PRESETS:
                    fail(f"{sample_label}.textPreset must be one of: {', '.join(sorted(TEXT_PRESETS))}")
                text_value = TEXT_PRESETS[text_preset]
            render_mode = raw_sample.get("renderMode", "static")
            if render_mode not in {"static", "animation-grid"}:
                fail(f"{sample_label}.renderMode must be static or animation-grid")
            samples.append(
                {
                    "id": sample_id,
                    "role": role,
                    "text": text_value,
                    "textPreset": text_preset,
                    "renderMode": render_mode,
                    "frameColumns": bounded_int(raw_sample.get("frameColumns", 4), f"{sample_label}.frameColumns", 1, 16),
                    "frameGap": bounded_int(raw_sample.get("frameGap", 1), f"{sample_label}.frameGap", 0, 16),
                }
            )
            total_samples += 1
            if total_samples > MAX_SAMPLES:
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
        "background": colour_hex(parse_colour(value.get("background", "#000000ff"), f"{label}.background")),
        "padding": bounded_int(value.get("padding", 8), f"{label}.padding", 0, 512),
        "gap": bounded_int(value.get("gap", 4), f"{label}.gap", 0, 256),
        "paletteBudget": palette_budget,
        "integerScales": scales,
        "pages": pages,
    }


def _blit(
    target: bytearray,
    target_width: int,
    target_height: int,
    source: bytes,
    source_width: int,
    source_height: int,
    x: int,
    y: int,
) -> None:
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


def _animation_grid(frame_data: Sequence[bytes], columns: int, gap: int) -> tuple[int, int, bytes]:
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
        _blit(target, width, height, rgba, frame_width, frame_height, column * (frame_width + gap), row * (frame_height + gap))
    return width, height, png_rgba(width, height, bytes(target))


def _integer_scale_png(data: bytes, scale: int, label: str) -> bytes:
    width, height, rgba = decode_rgba_png(data, label)
    scaled_width = width * scale
    scaled_height = height * scale
    if scaled_width > MAX_CANVAS_EDGE or scaled_height > MAX_CANVAS_EDGE or scaled_width * scaled_height > MAX_PIXELS:
        fail(f"{label} integer-scale preview exceeds supported bounds")
    output = bytearray()
    for y in range(height):
        row = rgba[y * width * 4 : (y + 1) * width * 4]
        expanded = bytearray()
        for x in range(width):
            pixel = row[x * 4 : (x + 1) * 4]
            expanded.extend(pixel * scale)
        for _ in range(scale):
            output.extend(expanded)
    return png_rgba(scaled_width, scaled_height, bytes(output))


def _palette(page_data: Sequence[bytes]) -> list[RGBA]:
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


def _palette_png(colours: Sequence[RGBA]) -> bytes:
    swatch = 8
    columns = max(1, min(16, len(colours)))
    rows = max(1, ceil(max(1, len(colours)) / columns))
    rgba = bytearray(columns * swatch * rows * swatch * 4)
    for index, colour in enumerate(colours):
        column = index % columns
        row = index // columns
        for y in range(row * swatch, (row + 1) * swatch):
            for x in range(column * swatch, (column + 1) * swatch):
                offset = (y * columns * swatch + x) * 4
                rgba[offset : offset + 4] = bytes(colour)
    return png_rgba(columns * swatch, rows * swatch, bytes(rgba))


def build_review(font_path: Path, style_path: Path, profile_value: Any, output_root: Path) -> dict[str, Any]:
    profile = normalise_profile(profile_value)
    style_path = style_path.resolve()
    style = normalise_style(_load_json(style_path, "pixel text style"))
    font_path = font_path.resolve()
    font = load_bitmap_font(font_path)
    output_root = output_root.resolve()
    if output_root.exists():
        fail(f"output root already exists: {output_root}")
    if not output_root.parent.is_dir() or output_root.parent.is_symlink():
        fail("output parent must be an existing non-symlink directory")

    temporary = Path(tempfile.mkdtemp(prefix=f".{output_root.name}.pixel-review-", dir=output_root.parent))
    render_root = temporary / "_render-work"
    render_root.mkdir()
    files: dict[str, bytes] = {}
    page_records: list[dict[str, Any]] = []
    sample_records: list[dict[str, Any]] = []
    page_pngs: list[bytes] = []
    native_width = profile["nativeResolution"]["width"]
    native_height = profile["nativeResolution"]["height"]
    background = parse_colour(profile["background"], "review background")
    try:
        for page in profile["pages"]:
            rendered_samples: list[tuple[dict[str, Any], int, int, bytes, dict[str, Any]]] = []
            for sample in page["samples"]:
                sample_root = render_root / sample["id"]
                text_manifest = render_build(font_path, sample["text"], style, sample_root)
                validate_build(sample_root)
                frame_data = [(sample_root / item["path"]).read_bytes() for item in text_manifest["frames"]]
                if sample["renderMode"] == "animation-grid":
                    for frame_index, data in enumerate(frame_data):
                        files[f"animation/{sample['id']}/frame-{frame_index:03d}.png"] = data
                    sample_width, sample_height, sample_png = _animation_grid(
                        frame_data,
                        sample["frameColumns"],
                        sample["frameGap"],
                    )
                else:
                    sample_png = frame_data[0]
                    sample_width, sample_height, _ = decode_rgba_png(sample_png, sample["id"])
                sample_path = f"samples/{page['id']}/{sample['id']}.png"
                files[sample_path] = sample_png
                source_record = {
                    "sampleId": sample["id"],
                    "pageId": page["id"],
                    "role": sample["role"],
                    "text": sample["text"],
                    "textPreset": sample["textPreset"],
                    "renderMode": sample["renderMode"],
                    "path": sample_path,
                    "width": sample_width,
                    "height": sample_height,
                    "pixelTextBuildSha256": text_manifest["buildSha256"],
                    "frameCount": text_manifest["frameCount"],
                }
                rendered_samples.append((sample, sample_width, sample_height, sample_png, source_record))

            page_rgba = bytearray(bytes(background) * (native_width * native_height))
            padding = profile["padding"]
            available_width = native_width - padding * 2
            cursor_y = padding
            rectangles: list[dict[str, Any]] = []
            for sample, sample_width, sample_height, sample_png, source_record in rendered_samples:
                if sample_width > available_width:
                    fail(
                        f"native page {page['id']!r} allows {available_width} pixels of content width, "
                        f"but sample {sample['id']!r} requires {sample_width}"
                    )
                if cursor_y + sample_height > native_height - padding:
                    fail(
                        f"native page {page['id']!r} allows {native_height - padding} pixels vertically, "
                        f"but sample {sample['id']!r} would end at {cursor_y + sample_height}"
                    )
                if page["align"] == "left":
                    x = padding
                elif page["align"] == "right":
                    x = native_width - padding - sample_width
                else:
                    x = (native_width - sample_width) // 2
                _width, _height, rgba = decode_rgba_png(sample_png, sample["id"])
                _blit(page_rgba, native_width, native_height, rgba, sample_width, sample_height, x, cursor_y)
                rectangle = {
                    "sampleId": sample["id"],
                    "role": sample["role"],
                    "x": x,
                    "y": cursor_y,
                    "width": sample_width,
                    "height": sample_height,
                }
                rectangles.append(rectangle)
                source_record["rectangle"] = rectangle
                sample_records.append(source_record)
                cursor_y += sample_height + profile["gap"]

            page_path = f"pages/{page['id']}.png"
            page_png = png_rgba(native_width, native_height, bytes(page_rgba))
            files[page_path] = page_png
            page_pngs.append(page_png)
            previews: list[dict[str, Any]] = []
            for scale in profile["integerScales"]:
                preview_path = f"previews/{page['id']}-{scale}x.png"
                preview = _integer_scale_png(page_png, scale, preview_path)
                files[preview_path] = preview
                previews.append(
                    {
                        "scale": scale,
                        "path": preview_path,
                        "width": native_width * scale,
                        "height": native_height * scale,
                        "sha256": sha256_bytes(preview),
                    }
                )
            page_records.append(
                {
                    "pageId": page["id"],
                    "path": page_path,
                    "width": native_width,
                    "height": native_height,
                    "sha256": sha256_bytes(page_png),
                    "samples": rectangles,
                    "previews": previews,
                }
            )

        colours = _palette(page_pngs)
        palette_budget = profile["paletteBudget"]
        if palette_budget and len(colours) > palette_budget:
            fail(
                f"native review uses {len(colours)} visible RGBA colours, exceeding paletteBudget {palette_budget}"
            )
        palette_path = "palette/palette.png"
        files[palette_path] = _palette_png(colours)
        review_map = {
            "schema": "evavo.pixel-typography-review-map.v1",
            "profileId": profile["profileId"],
            "nativeResolution": profile["nativeResolution"],
            "pages": page_records,
            "samples": sample_records,
        }
        files["review-map.json"] = pretty_json(review_map)
        files["source/review-profile.json"] = pretty_json(profile)
        files["source/pixel-text-style.json"] = pretty_json(style)

        manifest: dict[str, Any] = {
            "schema": BUILD_SCHEMA,
            "engineVersion": ENGINE_VERSION,
            "status": "passed",
            "profileId": profile["profileId"],
            "eraProfile": profile["eraProfile"],
            "nativeResolution": profile["nativeResolution"],
            "font": {
                "descriptorName": font.path.name,
                "descriptorSha256": font.descriptor_sha256,
                "pages": [
                    {"name": path.name, "sha256": digest}
                    for path, digest in zip(font.page_paths, font.page_sha256)
                ],
            },
            "styleId": style["styleId"],
            "styleSha256": sha256_bytes(canonical_json(style)),
            "profileSha256": sha256_bytes(canonical_json(profile)),
            "pageCount": len(page_records),
            "sampleCount": len(sample_records),
            "paletteBudget": palette_budget,
            "paletteCount": len(colours),
            "palette": [colour_hex(colour) for colour in colours],
            "palettePath": palette_path,
            "pages": page_records,
            "samples": sample_records,
            "policy": {
                "createOnly": True,
                "transactional": True,
                "nearestOnly": True,
                "integerCoordinates": True,
                "antialiasing": False,
                "fontMasterMutation": False,
            },
            "authority": {
                "creativeApproval": False,
                "targetRepositoryMutation": False,
                "gitCommit": False,
                "gitPush": False,
                "publication": False,
            },
        }
        shutil.rmtree(render_root)
        manifest["files"] = [
            {"path": path, "bytes": len(data), "sha256": sha256_bytes(data)}
            for path, data in sorted(files.items())
        ]
        manifest["buildSha256"] = sha256_bytes(
            canonical_json({key: manifest[key] for key in sorted(manifest) if key != "buildSha256"})
        )
        files["pixel-typography-review.json"] = pretty_json(manifest)
        for relative, data in sorted(files.items()):
            path = temporary / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        validate_review(temporary)
        temporary.replace(output_root)
        return manifest
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def validate_review(output_root: Path) -> dict[str, Any]:
    output_root = output_root.resolve()
    if not output_root.is_dir() or output_root.is_symlink():
        fail(f"output root must be a non-symlink directory: {output_root}")
    manifest_path = output_root / "pixel-typography-review.json"
    manifest = _load_json(manifest_path, "pixel typography review manifest")
    if not isinstance(manifest, dict) or manifest.get("schema") != BUILD_SCHEMA:
        fail(f"pixel-typography-review.json schema must be {BUILD_SCHEMA}")
    if manifest.get("engineVersion") != ENGINE_VERSION or manifest.get("status") != "passed":
        fail("pixel typography review engine/status mismatch")
    expected_build_sha = sha256_bytes(
        canonical_json({key: manifest[key] for key in sorted(manifest) if key != "buildSha256"})
    )
    if manifest.get("buildSha256") != expected_build_sha:
        fail("pixel typography review self-hash mismatch")
    expected_files = {item["path"]: item for item in manifest.get("files", [])}
    observed_files = sorted(
        path.relative_to(output_root).as_posix()
        for path in output_root.rglob("*")
        if path.is_file() and path.name != "pixel-typography-review.json"
    )
    if sorted(expected_files) != observed_files:
        fail("pixel typography review file inventory mismatch")
    for relative, record in expected_files.items():
        path = output_root / relative
        if path.is_symlink() or not path.is_file():
            fail(f"retained review file is missing or symbolic: {relative}")
        if path.stat().st_size != record["bytes"] or sha256_file(path) != record["sha256"]:
            fail(f"retained review file identity mismatch: {relative}")

    profile = normalise_profile(_load_json(output_root / "source/review-profile.json", "retained review profile"))
    style = normalise_style(_load_json(output_root / "source/pixel-text-style.json", "retained pixel text style"))
    if sha256_bytes(canonical_json(profile)) != manifest.get("profileSha256"):
        fail("retained review profile hash mismatch")
    if sha256_bytes(canonical_json(style)) != manifest.get("styleSha256"):
        fail("retained pixel text style hash mismatch")
    native_width = bounded_int(manifest.get("nativeResolution", {}).get("width"), "manifest.nativeResolution.width", 1, MAX_CANVAS_EDGE)
    native_height = bounded_int(manifest.get("nativeResolution", {}).get("height"), "manifest.nativeResolution.height", 1, MAX_CANVAS_EDGE)
    pages = manifest.get("pages")
    if not isinstance(pages, list) or len(pages) != manifest.get("pageCount"):
        fail("review page inventory mismatch")
    page_data: list[bytes] = []
    for page in pages:
        page_path = output_root / page["path"]
        data = page_path.read_bytes()
        width, height, _ = decode_rgba_png(data, page["path"])
        if (width, height) != (native_width, native_height) or sha256_file(page_path) != page["sha256"]:
            fail(f"native review page validation failed: {page['path']}")
        page_data.append(data)
        for rectangle in page.get("samples", []):
            x = bounded_int(rectangle.get("x"), "sample rectangle x", 0, native_width)
            y = bounded_int(rectangle.get("y"), "sample rectangle y", 0, native_height)
            sample_width = bounded_int(rectangle.get("width"), "sample rectangle width", 1, native_width)
            sample_height = bounded_int(rectangle.get("height"), "sample rectangle height", 1, native_height)
            if x + sample_width > native_width or y + sample_height > native_height:
                fail("sample rectangle escapes native page")
            sample_path = output_root / f"samples/{page['pageId']}/{rectangle['sampleId']}.png"
            observed_width, observed_height, _ = decode_rgba_png(sample_path.read_bytes(), sample_path.as_posix())
            if (observed_width, observed_height) != (sample_width, sample_height):
                fail(f"sample rectangle dimensions mismatch: {rectangle['sampleId']}")
        for preview in page.get("previews", []):
            scale = bounded_int(preview.get("scale"), "preview scale", 1, 8)
            preview_path = output_root / preview["path"]
            expected = _integer_scale_png(data, scale, preview["path"])
            observed = preview_path.read_bytes()
            if observed != expected or sha256_file(preview_path) != preview["sha256"]:
                fail(f"integer-scale preview validation failed: {preview['path']}")

    colours = _palette(page_data)
    palette_hex = [colour_hex(colour) for colour in colours]
    if palette_hex != manifest.get("palette") or len(colours) != manifest.get("paletteCount"):
        fail("native review palette evidence mismatch")
    budget = bounded_int(manifest.get("paletteBudget", 0), "manifest.paletteBudget", 0, 256)
    if budget == 1 or (budget and len(colours) > budget):
        fail("native review palette budget failed")
    palette_path = output_root / manifest.get("palettePath", "palette/palette.png")
    if palette_path.read_bytes() != _palette_png(colours):
        fail("native review palette swatch mismatch")
    review_map = _load_json(output_root / "review-map.json", "review map")
    if not isinstance(review_map, dict) or review_map.get("schema") != "evavo.pixel-typography-review-map.v1":
        fail("review-map.json schema mismatch")
    if review_map.get("pages") != pages or review_map.get("samples") != manifest.get("samples"):
        fail("review map does not match manifest geometry")
    return {
        "schema": VALIDATION_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "status": "passed",
        "buildSha256": manifest["buildSha256"],
        "pageCount": len(pages),
        "sampleCount": manifest["sampleCount"],
        "paletteCount": len(colours),
        "fileCount": len(expected_files) + 1,
        "nativeResolution": {"width": native_width, "height": native_height},
    }


def compare_reviews(first: Path, second: Path) -> dict[str, Any]:
    first_validation = validate_review(first)
    second_validation = validate_review(second)

    def tree(root: Path) -> dict[str, str]:
        return {
            path.relative_to(root).as_posix(): sha256_file(path)
            for path in sorted(root.resolve().rglob("*"))
            if path.is_file()
        }

    first_tree = tree(first)
    second_tree = tree(second)
    if first_tree != second_tree:
        fail("pixel typography review builds are not byte-for-byte identical")
    return {
        "schema": VALIDATION_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "status": "passed",
        "identical": True,
        "fileCount": len(first_tree),
        "treeSha256": sha256_bytes(canonical_json(first_tree)),
        "firstBuildSha256": first_validation["buildSha256"],
        "secondBuildSha256": second_validation["buildSha256"],
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pixel_typography_review")
    parser.add_argument("--version", action="version", version=ENGINE_VERSION)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("catalog")
    example = sub.add_parser("profile-example")
    example.add_argument("--preset", required=True)
    example.add_argument("--profile-id")
    validate_profile = sub.add_parser("validate-profile")
    validate_profile.add_argument("--profile", required=True)
    build = sub.add_parser("build")
    build.add_argument("--font", required=True)
    build.add_argument("--style", required=True)
    build.add_argument("--profile", required=True)
    build.add_argument("--output", required=True)
    validate_output = sub.add_parser("validate-output")
    validate_output.add_argument("--output", required=True)
    compare = sub.add_parser("compare")
    compare.add_argument("--first", required=True)
    compare.add_argument("--second", required=True)
    return parser


def command_main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "catalog":
            result = catalog()
        elif args.command == "profile-example":
            result = profile_from_preset(args.preset, args.profile_id)
        elif args.command == "validate-profile":
            result = normalise_profile(_load_json(Path(args.profile).resolve(), "review profile"))
        elif args.command == "build":
            result = build_review(
                Path(args.font),
                Path(args.style),
                _load_json(Path(args.profile).resolve(), "review profile"),
                Path(args.output),
            )
        elif args.command == "validate-output":
            result = validate_review(Path(args.output))
        elif args.command == "compare":
            result = compare_reviews(Path(args.first), Path(args.second))
        else:
            fail(f"unsupported command {args.command!r}")
    except (PixelTypographyReviewError, PixelFontUniversalError, UnicodeDecodeError, OSError) as exc:
        sys.stderr.write(f"{exc}\n")
        return 2
    sys.stdout.write(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(command_main())
