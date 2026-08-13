"""Transactional native-resolution typography review builder."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import tempfile
from typing import Any, Mapping

from pixel_font_universal.common import canonical_json, colour_hex, parse_colour, pretty_json, sha256_bytes
from pixel_font_universal.formats import png_rgba
from pixel_text_studio_engine import decode_rgba_png, load_bitmap_font, normalise_style, render_build, validate_build

from .common import BUILD_SCHEMA, ENGINE_VERSION, MAP_SCHEMA, fail, load_json, normalise_profile
from .raster import animation_grid, blit, integer_scale_png, palette, palette_png


@dataclass(frozen=True)
class RenderedSample:
    sample: Mapping[str, Any]
    width: int
    height: int
    png: bytes
    frame_paths: tuple[str, ...]
    text_build_sha256: str
    text_frame_count: int


def _render_sample(font_path: Path, style: Mapping[str, Any], sample: Mapping[str, Any], work_root: Path, files: dict[str, bytes]) -> RenderedSample:
    sample_root = work_root / sample["id"]
    manifest = render_build(font_path, sample["text"], style, sample_root)
    validate_build(sample_root)
    frame_data = [(sample_root / item["path"]).read_bytes() for item in manifest["frames"]]
    frame_paths: list[str] = []
    if sample["renderMode"] == "animation-grid":
        for frame_index, data in enumerate(frame_data):
            frame_path = f"animation/{sample['id']}/frame-{frame_index:03d}.png"
            files[frame_path] = data
            frame_paths.append(frame_path)
        width, height, sample_png = animation_grid(frame_data, sample["frameColumns"], sample["frameGap"])
    else:
        sample_png = frame_data[0]
        width, height, _ = decode_rgba_png(sample_png, sample["id"])
    return RenderedSample(sample, width, height, sample_png, tuple(frame_paths), manifest["buildSha256"], manifest["frameCount"])


def build_review(font_path: Path, style_path: Path, profile_value: Any, output_root: Path) -> dict[str, Any]:
    profile = normalise_profile(profile_value)
    font_path = font_path.resolve()
    style_path = style_path.resolve()
    style = normalise_style(load_json(style_path, "pixel text style"))
    font = load_bitmap_font(font_path)
    output_root = output_root.resolve()
    if output_root.exists():
        fail(f"output root already exists: {output_root}")
    if not output_root.parent.is_dir() or output_root.parent.is_symlink():
        fail("output parent must be an existing non-symlink directory")

    temporary = Path(tempfile.mkdtemp(prefix=f".{output_root.name}.pixel-review-", dir=output_root.parent))
    work_root = temporary / "_render-work"
    work_root.mkdir()
    files: dict[str, bytes] = {}
    page_records: list[dict[str, Any]] = []
    sample_records: list[dict[str, Any]] = []
    page_pngs: list[bytes] = []
    native_width = profile["nativeResolution"]["width"]
    native_height = profile["nativeResolution"]["height"]
    background = parse_colour(profile["background"], "review background")
    try:
        for page in profile["pages"]:
            rendered = [_render_sample(font_path, style, sample, work_root, files) for sample in page["samples"]]
            page_rgba = bytearray(bytes(background) * (native_width * native_height))
            padding = profile["padding"]
            available_width = native_width - padding * 2
            cursor_y = padding
            rectangles: list[dict[str, Any]] = []
            for item in rendered:
                sample = item.sample
                if item.width > available_width:
                    fail(f"native page {page['id']!r} allows {available_width} pixels of content width, but sample {sample['id']!r} requires {item.width}")
                if cursor_y + item.height > native_height - padding:
                    fail(f"native page {page['id']!r} allows {native_height - padding} pixels vertically, but sample {sample['id']!r} would end at {cursor_y + item.height}")
                if page["align"] == "left":
                    x = padding
                elif page["align"] == "right":
                    x = native_width - padding - item.width
                else:
                    x = (native_width - item.width) // 2
                _, _, rgba = decode_rgba_png(item.png, sample["id"])
                blit(page_rgba, native_width, native_height, rgba, item.width, item.height, x, cursor_y)
                rectangle = {"sampleId": sample["id"], "role": sample["role"], "x": x, "y": cursor_y, "width": item.width, "height": item.height}
                rectangles.append(rectangle)
                sample_path = f"samples/{page['id']}/{sample['id']}.png"
                files[sample_path] = item.png
                sample_records.append({
                    "sampleId": sample["id"],
                    "pageId": page["id"],
                    "role": sample["role"],
                    "text": sample["text"],
                    "textPreset": sample["textPreset"],
                    "renderMode": sample["renderMode"],
                    "path": sample_path,
                    "width": item.width,
                    "height": item.height,
                    "rectangle": rectangle,
                    "frameColumns": sample["frameColumns"],
                    "frameGap": sample["frameGap"],
                    "framePaths": list(item.frame_paths),
                    "pixelTextBuildSha256": item.text_build_sha256,
                    "frameCount": item.text_frame_count,
                })
                cursor_y += item.height + profile["gap"]

            page_path = f"pages/{page['id']}.png"
            page_png = png_rgba(native_width, native_height, bytes(page_rgba))
            files[page_path] = page_png
            page_pngs.append(page_png)
            previews: list[dict[str, Any]] = []
            for scale in profile["integerScales"]:
                preview_path = f"previews/{page['id']}-{scale}x.png"
                preview_data = integer_scale_png(page_png, scale, preview_path)
                files[preview_path] = preview_data
                previews.append({"scale": scale, "path": preview_path, "width": native_width * scale, "height": native_height * scale, "sha256": sha256_bytes(preview_data)})
            page_records.append({"pageId": page["id"], "align": page["align"], "path": page_path, "width": native_width, "height": native_height, "sha256": sha256_bytes(page_png), "samples": rectangles, "previews": previews})

        colours = palette(page_pngs)
        if profile["paletteBudget"] and len(colours) > profile["paletteBudget"]:
            fail(f"native review uses {len(colours)} visible RGBA colours, exceeding paletteBudget {profile['paletteBudget']}")
        palette_path = "palette/palette.png"
        files[palette_path] = palette_png(colours)
        review_map = {"schema": MAP_SCHEMA, "profileId": profile["profileId"], "nativeResolution": profile["nativeResolution"], "pages": page_records, "samples": sample_records}
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
            "font": {"descriptorName": font.path.name, "descriptorSha256": font.descriptor_sha256, "pages": [{"name": page.name, "sha256": digest} for page, digest in zip(font.page_paths, font.page_sha256)]},
            "styleId": style["styleId"],
            "styleSha256": sha256_bytes(canonical_json(style)),
            "profileSha256": sha256_bytes(canonical_json(profile)),
            "pageCount": len(page_records),
            "sampleCount": len(sample_records),
            "paletteBudget": profile["paletteBudget"],
            "paletteCount": len(colours),
            "palette": [colour_hex(colour) for colour in colours],
            "palettePath": palette_path,
            "pages": page_records,
            "samples": sample_records,
            "policy": {"createOnly": True, "transactional": True, "nearestOnly": True, "integerCoordinates": True, "antialiasing": False, "fontMasterMutation": False},
            "authority": {"creativeApproval": False, "targetRepositoryMutation": False, "gitCommit": False, "gitPush": False, "publication": False},
        }
        shutil.rmtree(work_root)
        manifest["files"] = [{"path": relative, "bytes": len(data), "sha256": sha256_bytes(data)} for relative, data in sorted(files.items())]
        manifest["buildSha256"] = sha256_bytes(canonical_json({key: manifest[key] for key in sorted(manifest) if key != "buildSha256"}))
        files["pixel-typography-review.json"] = pretty_json(manifest)
        for relative, data in sorted(files.items()):
            path = temporary / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        from .validate import validate_review
        validate_review(temporary)
        temporary.replace(output_root)
        return manifest
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
