"""Page, sample, animation-grid and integer-preview validation."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from pixel_font_universal.common import bounded_int, parse_colour, sha256_file
from pixel_font_universal.formats import png_rgba
from pixel_text_studio_engine import decode_rgba_png

from .common import MAX_CANVAS_EDGE, fail
from .raster import animation_grid, blit, integer_scale_png


def validate_pages(output_root: Path, manifest: Mapping[str, Any], profile: Mapping[str, Any]) -> tuple[list[bytes], list[Mapping[str, Any]], list[Mapping[str, Any]], dict[str, int]]:
    native = manifest.get("nativeResolution")
    if not isinstance(native, dict):
        fail("manifest.nativeResolution must be an object")
    native_width = bounded_int(native.get("width"), "native width", 1, MAX_CANVAS_EDGE)
    native_height = bounded_int(native.get("height"), "native height", 1, MAX_CANVAS_EDGE)
    if native != profile["nativeResolution"]:
        fail("native resolution does not match retained profile")

    pages = manifest.get("pages")
    samples = manifest.get("samples")
    if not isinstance(pages, list) or len(pages) != manifest.get("pageCount"):
        fail("review page inventory mismatch")
    if not isinstance(samples, list) or len(samples) != manifest.get("sampleCount"):
        fail("review sample inventory mismatch")
    sample_by_id: dict[str, Mapping[str, Any]] = {}
    for sample in samples:
        if not isinstance(sample, dict) or not isinstance(sample.get("sampleId"), str):
            fail("review sample record is invalid")
        sample_id = sample["sampleId"]
        if sample_id in sample_by_id:
            fail("review sample ids are not unique")
        sample_by_id[sample_id] = sample

    background = parse_colour(profile["background"], "review background")
    page_data: list[bytes] = []
    seen_samples: set[str] = set()
    for page in pages:
        if not isinstance(page, dict) or not isinstance(page.get("pageId"), str):
            fail("review page record is invalid")
        page_path = output_root / str(page.get("path"))
        if not page_path.is_file() or page_path.is_symlink():
            fail(f"native review page is missing or symbolic: {page.get('path')}")
        data = page_path.read_bytes()
        width, height, _ = decode_rgba_png(data, str(page.get("path")))
        if (width, height) != (native_width, native_height) or sha256_file(page_path) != page.get("sha256"):
            fail(f"native review page validation failed: {page.get('path')}")

        reconstructed = bytearray(bytes(background) * (native_width * native_height))
        rectangles = page.get("samples")
        if not isinstance(rectangles, list):
            fail(f"review page {page['pageId']!r} samples must be an array")
        for rectangle in rectangles:
            if not isinstance(rectangle, dict):
                fail("sample rectangle must be an object")
            sample_id = str(rectangle.get("sampleId"))
            record = sample_by_id.get(sample_id)
            if record is None or record.get("pageId") != page["pageId"] or record.get("rectangle") != rectangle:
                fail(f"sample mapping mismatch: {sample_id}")
            if sample_id in seen_samples:
                fail(f"sample appears on multiple review pages: {sample_id}")
            seen_samples.add(sample_id)
            x = bounded_int(rectangle.get("x"), "sample rectangle x", 0, native_width)
            y = bounded_int(rectangle.get("y"), "sample rectangle y", 0, native_height)
            sample_width = bounded_int(rectangle.get("width"), "sample rectangle width", 1, native_width)
            sample_height = bounded_int(rectangle.get("height"), "sample rectangle height", 1, native_height)
            if x + sample_width > native_width or y + sample_height > native_height:
                fail("sample rectangle escapes native page")

            sample_path_value = record.get("path")
            if not isinstance(sample_path_value, str):
                fail(f"sample path is invalid: {sample_id}")
            sample_path = output_root / sample_path_value
            if not sample_path.is_file() or sample_path.is_symlink():
                fail(f"sample file is missing or symbolic: {sample_path_value}")
            sample_data = sample_path.read_bytes()
            observed_width, observed_height, sample_rgba = decode_rgba_png(sample_data, sample_path_value)
            if (observed_width, observed_height) != (sample_width, sample_height):
                fail(f"sample rectangle dimensions mismatch: {sample_id}")

            frame_paths = record.get("framePaths")
            if not isinstance(frame_paths, list):
                fail(f"sample frame paths are invalid: {sample_id}")
            if record.get("renderMode") == "animation-grid":
                if not frame_paths or len(frame_paths) != record.get("frameCount"):
                    fail(f"animation frame inventory mismatch: {sample_id}")
                frame_data = []
                for frame_value in frame_paths:
                    if not isinstance(frame_value, str):
                        fail(f"animation frame path is invalid: {sample_id}")
                    frame_path = output_root / frame_value
                    if not frame_path.is_file() or frame_path.is_symlink():
                        fail(f"animation frame is missing or symbolic: {frame_value}")
                    frame_data.append(frame_path.read_bytes())
                grid_width, grid_height, grid_png = animation_grid(frame_data, bounded_int(record.get("frameColumns"), "frameColumns", 1, 16), bounded_int(record.get("frameGap"), "frameGap", 0, 16))
                if (grid_width, grid_height) != (sample_width, sample_height) or grid_png != sample_data:
                    fail(f"animation grid reconstruction failed: {sample_id}")
            elif frame_paths:
                fail(f"static sample unexpectedly retains animation frames: {sample_id}")
            blit(reconstructed, native_width, native_height, sample_rgba, sample_width, sample_height, x, y)

        if png_rgba(native_width, native_height, bytes(reconstructed)) != data:
            fail(f"native review page reconstruction failed: {page.get('path')}")
        previews = page.get("previews")
        if not isinstance(previews, list):
            fail(f"review page {page['pageId']!r} previews must be an array")
        observed_scales = []
        for preview in previews:
            if not isinstance(preview, dict):
                fail("preview record must be an object")
            scale = bounded_int(preview.get("scale"), "preview scale", 1, 8)
            observed_scales.append(scale)
            preview_value = preview.get("path")
            if not isinstance(preview_value, str):
                fail("preview path is invalid")
            preview_path = output_root / preview_value
            expected = integer_scale_png(data, scale, preview_value)
            if not preview_path.is_file() or preview_path.is_symlink() or preview_path.read_bytes() != expected or sha256_file(preview_path) != preview.get("sha256"):
                fail(f"integer-scale preview validation failed: {preview_value}")
            if preview.get("width") != native_width * scale or preview.get("height") != native_height * scale:
                fail(f"integer-scale preview dimensions drifted: {preview_value}")
        if sorted(observed_scales) != profile["integerScales"]:
            fail(f"integer-scale preview inventory mismatch: {page['pageId']}")
        page_data.append(data)

    if seen_samples != set(sample_by_id):
        fail("one or more retained samples are not placed on a review page")
    return page_data, pages, samples, {"width": native_width, "height": native_height}
