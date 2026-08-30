#!/usr/bin/env python3
"""Execute an exact, create-only EVAVO project-art sandbox plan with Pillow."""
from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from collections import deque
from pathlib import Path
from typing import Any, Iterable

try:
    from PIL import (
        Image,
        ImageChops,
        ImageDraw,
        ImageEnhance,
        ImageFilter,
        ImageOps,
        __version__ as PILLOW_VERSION,
    )
except ImportError as exc:  # pragma: no cover - explicit runtime boundary
    raise SystemExit(f"Pillow is unavailable: {exc}")

from transparency_guard import inspect_transparency, require_transparency

PLAN_SCHEMA = "evavo.project-art-sandbox-plan.v1"
RECEIPT_SCHEMA = "evavo.project-art-sandbox-receipt.v1"
PROCESSOR_ID = "python-pillow-project-art-sandbox"
VIDEO_FRAME_MANIFEST_SCHEMA = "evavo.project-art-video-frame-extraction.v1"
MAXIMUM_PLAN_BYTES = 64 * 1024 * 1024
MAXIMUM_TASKS = 2_000
MAXIMUM_EXTERNAL_SOURCES = 10_000
MAXIMUM_SOURCE_BYTES = 2 * 1024 * 1024 * 1024
MAXIMUM_TOTAL_SOURCE_BYTES = 16 * 1024 * 1024 * 1024
MAXIMUM_PIXELS = 220_000_000
MAXIMUM_IMAGE_DIMENSION = 65_536
MAXIMUM_OUTPUT_FILES = 20_000
MAXIMUM_OUTPUT_BYTES = 2 * 1024 * 1024 * 1024
MAXIMUM_TOTAL_OUTPUT_BYTES = 16 * 1024 * 1024 * 1024
OUTPUT_ENCODING_OVERHEAD_BYTES = 1024 * 1024
MAXIMUM_HIDDEN_RGB_PIXELS = 4_000_000
MAXIMUM_NORMAL_MAP_PIXELS = 8_388_608
MAXIMUM_MEDIA_TOOL_OUTPUT_BYTES = 1024 * 1024
MEDIA_TOOL_TIMEOUT_SECONDS = 120
MAXIMUM_VIDEO_FRAME_TIMESTAMPS = 512
MAXIMUM_VIDEO_TIMESTAMP_MS = 86_400_000
MAXIMUM_SEQUENCE_PREVIEW_FRAMES = 600
REVIEW_LABEL_HEIGHT = 18
SHA256_CHARS = set("0123456789abcdef")
Image.MAX_IMAGE_PIXELS = MAXIMUM_PIXELS


class SandboxError(ValueError):
    """Bounded sandbox failure."""


def fail(message: str) -> None:
    raise SandboxError(message)


def governed_integer(value: Any, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        fail(f"{label} must be an integer between {minimum} and {maximum}")
    return value


def governed_number(value: Any, label: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        fail(f"{label} must be a finite number between {minimum} and {maximum}")
    result = float(value)
    if not math.isfinite(result) or not minimum <= result <= maximum:
        fail(f"{label} must be a finite number between {minimum} and {maximum}")
    return result


SOURCE_ENCODED_ALPHA_INFO = "evavo.source-encoded-alpha"


def transparency_admission(
    image: Image.Image,
    label: str,
    policy: str,
    *,
    use_source_encoding: bool = False,
) -> dict[str, Any]:
    try:
        return require_transparency(
            image,
            label,
            policy,
            encoded_has_alpha=(
                bool(image.info.get(SOURCE_ENCODED_ALPHA_INFO))
                if use_source_encoding
                else None
            ),
        )
    except ValueError as exc:
        fail(str(exc))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(value: Path, maximum_bytes: int = MAXIMUM_SOURCE_BYTES) -> tuple[str, int]:
    size = value.stat().st_size
    if size > maximum_bytes:
        fail(f"source exceeds the {maximum_bytes}-byte boundary: {value}")
    digest = hashlib.sha256()
    with value.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest(), size


def _controlled_media_tool(
    executable: Path,
    arguments: list[str],
    label: str,
    *,
    timeout_seconds: int = MEDIA_TOOL_TIMEOUT_SECONDS,
) -> subprocess.CompletedProcess[bytes]:
    command = [str(executable), *arguments]
    try:
        with tempfile.TemporaryFile() as stdout_file, tempfile.TemporaryFile() as stderr_file:
            result = subprocess.run(
                command,
                stdin=subprocess.DEVNULL,
                stdout=stdout_file,
                stderr=stderr_file,
                shell=False,
                timeout=timeout_seconds,
                check=False,
            )
            stdout_size = os.fstat(stdout_file.fileno()).st_size
            stderr_size = os.fstat(stderr_file.fileno()).st_size
            if stdout_size > MAXIMUM_MEDIA_TOOL_OUTPUT_BYTES or stderr_size > MAXIMUM_MEDIA_TOOL_OUTPUT_BYTES:
                fail(f"{label} exceeded its bounded diagnostic-output limit")
            stdout_file.seek(0)
            stderr_file.seek(0)
            stdout = stdout_file.read(MAXIMUM_MEDIA_TOOL_OUTPUT_BYTES + 1)
            stderr = stderr_file.read(MAXIMUM_MEDIA_TOOL_OUTPUT_BYTES + 1)
    except subprocess.TimeoutExpired:
        fail(f"{label} exceeded its {timeout_seconds}-second timeout")
    except OSError as exc:
        fail(f"{label} could not start: {exc}")
    completed = subprocess.CompletedProcess(command, result.returncode, stdout, stderr)
    if result.returncode != 0:
        diagnostic = stderr.decode("utf-8", errors="replace").replace("\x00", " ").strip()
        fail(f"{label} failed with exit code {result.returncode}: {diagnostic[:2000]}")
    return completed


def _media_tool_identity(tool: str) -> tuple[Path, dict[str, Any]]:
    environment_names = (
        ("EVAVO_ART_FFMPEG_BIN", "FFMPEG_BIN")
        if tool == "ffmpeg"
        else ("EVAVO_ART_FFPROBE_BIN", "FFPROBE_BIN")
    )
    configured = next(
        (os.environ[name].strip() for name in environment_names if os.environ.get(name, "").strip()),
        None,
    )
    candidate = configured or shutil.which(tool)
    if not candidate:
        fail(f"{tool} is required for video-frame-extract tasks")
    try:
        executable = Path(candidate).resolve(strict=True)
    except OSError as exc:
        fail(f"{tool} executable could not be resolved: {exc}")
    if not executable.is_file():
        fail(f"{tool} executable is not a regular file")
    digest, size = sha256_file(executable)
    version_result = _controlled_media_tool(
        executable,
        ["-version"],
        f"{tool} version inspection",
        timeout_seconds=15,
    )
    first_line = version_result.stdout.decode("utf-8", errors="replace").splitlines()
    if not first_line or not first_line[0].strip():
        fail(f"{tool} did not report a version")
    if not first_line[0].strip().lower().startswith(f"{tool} version"):
        fail(f"configured {tool} executable reported an unexpected identity")
    verified_digest, verified_size = sha256_file(executable)
    if verified_digest != digest or verified_size != size:
        fail(f"{tool} executable changed during identity inspection")
    return executable, {
        "id": tool,
        "version": first_line[0].strip()[:512],
        "sha256": digest,
        "bytes": size,
    }


def _revalidate_media_tool(executable: Path, identity: dict[str, Any]) -> None:
    digest, size = sha256_file(executable)
    if digest != identity["sha256"] or size != identity["bytes"]:
        fail(f"{identity['id']} executable changed during video-frame extraction")


def _probe_video(source: Path, ffprobe: Path) -> dict[str, Any]:
    result = _controlled_media_tool(
        ffprobe,
        [
            "-v",
            "error",
            "-protocol_whitelist",
            "file",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=index,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_frames,duration:format=duration",
            "-of",
            "json",
            str(source),
        ],
        "ffprobe video inspection",
    )
    try:
        payload = json.loads(result.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"ffprobe returned invalid JSON: {exc}")
    streams = payload.get("streams") if isinstance(payload, dict) else None
    if not isinstance(streams, list) or len(streams) != 1 or not isinstance(streams[0], dict):
        fail("ffprobe did not return exactly one selected video stream")
    stream = streams[0]
    width = stream.get("width")
    height = stream.get("height")
    if isinstance(width, bool) or not isinstance(width, int) or isinstance(height, bool) or not isinstance(height, int):
        fail("ffprobe returned invalid video dimensions")
    duration_value = stream.get("duration")
    if duration_value in (None, "N/A") and isinstance(payload.get("format"), dict):
        duration_value = payload["format"].get("duration")
    duration_ms = None
    if duration_value not in (None, "N/A"):
        try:
            duration_ms = round(float(duration_value) * 1000)
        except (TypeError, ValueError, OverflowError):
            fail("ffprobe returned an invalid video duration")
        if duration_ms < 1:
            fail("ffprobe returned a non-positive video duration")
    return {
        "width": width,
        "height": height,
        "codecName": str(stream.get("codec_name") or "unknown")[:128],
        "pixelFormat": str(stream.get("pix_fmt") or "unknown")[:128],
        "averageFrameRate": str(stream.get("avg_frame_rate") or "unknown")[:128],
        "nominalFrameRate": str(stream.get("r_frame_rate") or "unknown")[:128],
        "declaredFrameCount": str(stream.get("nb_frames") or "unknown")[:128],
        "durationMs": duration_ms,
        "autorotationApplied": False,
    }


def canonical_json(value: Any) -> str:
    if value is None or isinstance(value, (str, int, float, bool)):
        if isinstance(value, float):
            if not math.isfinite(value):
                fail("canonical JSON cannot contain non-finite numbers")
            if value.is_integer():
                value = int(value)
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical_json(value[key])
            for key in sorted(value)
            if value[key] is not None or key in value
        ) + "}"
    fail(f"unsupported canonical JSON value: {type(value).__name__}")


def validate_document_hash(document: dict[str, Any], field: str = "documentSha256") -> str:
    digest = document.get(field)
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(character not in SHA256_CHARS for character in digest)
    ):
        fail(f"{field} must be a lowercase SHA-256 digest")
    unhashed = dict(document)
    unhashed.pop(field, None)
    observed = hashlib.sha256(canonical_json(unhashed).encode("utf-8")).hexdigest()
    if observed != digest:
        fail(f"{field} does not match canonical document bytes")
    return digest


def with_document_hash(document: dict[str, Any], field: str = "documentSha256") -> dict[str, Any]:
    result = dict(document)
    result.pop(field, None)
    result[field] = hashlib.sha256(canonical_json(result).encode("utf-8")).hexdigest()
    return result


def within(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def require_workspace_root(value: Path) -> Path:
    lexical = Path(os.path.abspath(value))
    if lexical.is_symlink() or not lexical.is_dir():
        fail(f"workspace-root must be an existing non-symbolic directory: {lexical}")
    return lexical.resolve(strict=True)


def canonical_relative_path(value: str, label: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 4096:
        fail(f"{label} must be a non-empty bounded string")
    candidate = Path(value)
    if candidate.is_absolute() or ".." in candidate.parts or "\\" in value or "\x00" in value:
        fail(f"{label} must be a forward-slash relative path")
    normalized = candidate.as_posix()
    if normalized != value or normalized in {".", ".."}:
        fail(f"{label} is not canonical")
    return value


def secure_existing_file(root: Path, relative: str, label: str) -> Path:
    canonical = canonical_relative_path(relative, label)
    current = root
    for segment in Path(canonical).parts:
        current = current / segment
        if current.is_symlink():
            fail(f"{label} contains a symbolic path component: {current}")
    if not current.is_file() or current.is_symlink():
        fail(f"{label} must be a regular non-symbolic file: {current}")
    resolved = current.resolve(strict=True)
    if not within(root, resolved):
        fail(f"{label} escaped workspace-root")
    return resolved


def secure_plan_path(root: Path, value: Path) -> Path:
    lexical = Path(os.path.abspath(value if value.is_absolute() else root / value))
    if not within(root, lexical):
        fail("plan escaped workspace-root")
    relative = lexical.relative_to(root).as_posix()
    return secure_existing_file(root, relative, "plan")


def secure_output_root(root: Path, value: Path) -> Path:
    lexical = Path(os.path.abspath(value if value.is_absolute() else root / value))
    if not within(root, lexical) or lexical == root:
        fail("output-root must be a new child of workspace-root")
    if lexical.exists() or lexical.is_symlink():
        fail("output-root must not already exist")
    parent = lexical.parent
    if not parent.exists() or not parent.is_dir() or parent.is_symlink():
        fail("output-root parent must be an existing non-symbolic directory")
    current = root
    for segment in parent.relative_to(root).parts:
        current = current / segment
        if current.is_symlink():
            fail(f"output-root parent contains a symbolic component: {current}")
    return lexical


def target_path(staging_root: Path, relative: str, label: str) -> Path:
    canonical = canonical_relative_path(relative, label)
    target = staging_root.joinpath(*canonical.split("/"))
    if not within(staging_root, target):
        fail(f"{label} escaped the staging root")
    current = staging_root
    for segment in Path(canonical).parts[:-1]:
        current = current / segment
        if current.exists() and current.is_symlink():
            fail(f"{label} contains a symbolic path component")
    return target


def parse_colour(value: Any, label: str, allow_alpha: bool = True) -> tuple[int, int, int, int]:
    if not isinstance(value, str) or not value.startswith("#") or len(value) not in ({7, 9} if allow_alpha else {7}):
        fail(f"{label} must use #RRGGBB" + (" or #RRGGBBAA" if allow_alpha else ""))
    try:
        red, green, blue = (int(value[index : index + 2], 16) for index in (1, 3, 5))
        alpha = int(value[7:9], 16) if len(value) == 9 else 255
        return red, green, blue, alpha
    except ValueError as exc:
        raise SandboxError(f"{label} must contain hexadecimal colour bytes") from exc


def bounded_plan_limit(
    plan: dict[str, Any],
    field: str,
    default: int,
    maximum: int,
) -> int:
    limits = plan.get("limits", {})
    if not isinstance(limits, dict):
        fail("plan limits must be an object")
    value = limits.get(field, default)
    if isinstance(value, bool) or not isinstance(value, int) or value < 1 or value > maximum:
        fail(f"plan {field} is outside the runtime boundary")
    return value


def require_pixel_budget(
    width: int,
    height: int,
    label: str,
    maximum_pixels: int,
) -> tuple[int, int]:
    if (
        width < 1
        or height < 1
        or width > MAXIMUM_IMAGE_DIMENSION
        or height > MAXIMUM_IMAGE_DIMENSION
        or width * height > maximum_pixels
    ):
        fail(f"{label} exceeds the {maximum_pixels}-pixel decoded-image boundary")
    return width, height


def require_active_pixel_budget(
    pixel_counts: Iterable[int],
    label: str,
    maximum_pixels: int,
) -> int:
    total = 0
    for index, value in enumerate(pixel_counts):
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            fail(f"{label} pixel count {index} is invalid")
        total += value
        if total > maximum_pixels:
            fail(f"{label} exceeds the {maximum_pixels}-pixel active decoded-image boundary")
    return total


def image_dimensions(
    value: Path,
    maximum_pixels: int = MAXIMUM_PIXELS,
    label: str = "image",
) -> tuple[int, int]:
    with Image.open(value) as opened:
        return require_pixel_budget(
            int(opened.width),
            int(opened.height),
            f"{label}: {value}",
            maximum_pixels,
        )


def load_image(
    value: Path,
    maximum_pixels: int = MAXIMUM_PIXELS,
    label: str = "image",
) -> Image.Image:
    with Image.open(value) as opened:
        require_pixel_budget(
            int(opened.width),
            int(opened.height),
            f"{label}: {value}",
            maximum_pixels,
        )
        opened.load()
        oriented = ImageOps.exif_transpose(opened)
        encoded_has_alpha = (
            "A" in oriented.getbands()
            or oriented.mode in {"LA", "PA"}
            or "transparency" in oriented.info
        )
        rgba = oriented.convert("RGBA")
        rgba.info[SOURCE_ENCODED_ALPHA_INFO] = encoded_has_alpha
        return rgba


def preflight_image_set(
    values: Iterable[Path],
    maximum_pixels: int,
    label: str,
) -> tuple[list[tuple[int, int]], int, int]:
    dimensions: list[tuple[int, int]] = []
    pixel_counts: list[int] = []
    for index, value in enumerate(values):
        width, height = image_dimensions(
            value,
            maximum_pixels,
            f"{label} source {index}",
        )
        dimensions.append((width, height))
        pixel_counts.append(width * height)
    if not pixel_counts:
        fail(f"{label} has no source images")
    total = require_active_pixel_budget(pixel_counts, f"{label} source set", maximum_pixels)
    return dimensions, total, max(pixel_counts)


def alpha_statistics(image: Image.Image) -> dict[str, int]:
    transparent = partial = opaque = 0
    for alpha in image.getchannel("A").tobytes():
        if alpha == 0:
            transparent += 1
        elif alpha == 255:
            opaque += 1
        else:
            partial += 1
    return {
        "transparentPixels": transparent,
        "partialPixels": partial,
        "opaquePixels": opaque,
    }


def alpha_bbox(image: Image.Image) -> list[int] | None:
    bbox = image.getchannel("A").getbbox()
    return list(bbox) if bbox else None


def alpha_centroid(image: Image.Image) -> dict[str, float] | None:
    alpha = image.getchannel("A")
    width, height = image.size
    total = weighted_x = weighted_y = 0
    values = alpha.tobytes()
    for y in range(height):
        row = y * width
        for x in range(width):
            weight = values[row + x]
            total += weight
            weighted_x += x * weight
            weighted_y += y * weight
    if total == 0:
        return None
    return {"x": weighted_x / total, "y": weighted_y / total}


def alpha_mass_fraction(image: Image.Image) -> float:
    values = image.getchannel("A").tobytes()
    return sum(values) / max(1, len(values) * 255)


def pixel_data(image: Image.Image) -> Any:
    flattened = getattr(image, "get_flattened_data", None)
    return flattened() if callable(flattened) else image.getdata()


def visible_mean_rgb(image: Image.Image) -> dict[str, float] | None:
    total_alpha = red_total = green_total = blue_total = 0
    for red, green, blue, alpha in pixel_data(image):
        if alpha == 0:
            continue
        total_alpha += alpha
        red_total += red * alpha
        green_total += green * alpha
        blue_total += blue * alpha
    if total_alpha == 0:
        return None
    return {
        "red": red_total / total_alpha,
        "green": green_total / total_alpha,
        "blue": blue_total / total_alpha,
    }


def centroid_aligned_alpha_iou(
    previous: Image.Image,
    current: Image.Image,
    previous_centroid: dict[str, float] | None,
    current_centroid: dict[str, float] | None,
) -> float | None:
    if previous.size != current.size or previous_centroid is None or current_centroid is None:
        return None
    shift_x = round(previous_centroid["x"] - current_centroid["x"])
    shift_y = round(previous_centroid["y"] - current_centroid["y"])
    width, height = previous.size
    previous_alpha = previous.getchannel("A").tobytes()
    current_alpha = current.getchannel("A").tobytes()
    intersection = union = 0
    for y in range(height):
        current_y = y - shift_y
        for x in range(width):
            previous_visible = previous_alpha[y * width + x] > 0
            current_x = x - shift_x
            current_visible = (
                0 <= current_x < width
                and 0 <= current_y < height
                and current_alpha[current_y * width + current_x] > 0
            )
            if previous_visible and current_visible:
                intersection += 1
            if previous_visible or current_visible:
                union += 1
    return intersection / max(1, union)


def image_pixel_sha256(image: Image.Image) -> str:
    rgba = image.convert("RGBA")
    digest = hashlib.sha256()
    digest.update(rgba.width.to_bytes(4, "big"))
    digest.update(rgba.height.to_bytes(4, "big"))
    digest.update(rgba.tobytes())
    return digest.hexdigest()


def sampling(value: Any, *, pixel: bool = False) -> Image.Resampling:
    if pixel:
        return Image.Resampling.NEAREST
    name = str(value or "lanczos").lower()
    mapping = {
        "nearest": Image.Resampling.NEAREST,
        "bilinear": Image.Resampling.BILINEAR,
        "bicubic": Image.Resampling.BICUBIC,
        "lanczos": Image.Resampling.LANCZOS,
    }
    if name not in mapping:
        fail(f"unsupported sampling mode: {name}")
    return mapping[name]


def anchored_position(canvas: tuple[int, int], subject: tuple[int, int], anchor: str) -> tuple[int, int]:
    width, height = canvas
    subject_width, subject_height = subject
    anchor = anchor.lower().replace("center", "centre")
    horizontal = 0 if "left" in anchor or "west" in anchor else width - subject_width if "right" in anchor or "east" in anchor else (width - subject_width) // 2
    vertical = 0 if "top" in anchor or "north" in anchor else height - subject_height if "bottom" in anchor or "south" in anchor else (height - subject_height) // 2
    return horizontal, vertical


def resized_canvas(
    image: Image.Image,
    operation: dict[str, Any],
    *,
    pixel: bool = False,
    maximum_pixels: int = MAXIMUM_PIXELS,
) -> Image.Image:
    width, height = require_pixel_budget(
        int(operation["width"]),
        int(operation["height"]),
        "resize target",
        maximum_pixels,
    )
    if pixel and operation.get("integerScaleRequired", False):
        ratios = (width / image.width, height / image.height)
        if any(abs(ratio - round(ratio)) > 1e-9 for ratio in ratios):
            fail("pixel-resize requires integer width and height scale factors")
    mode = str(operation.get("fit", "contain")).lower()
    resample = sampling(operation.get("sampling"), pixel=pixel)
    if mode == "fill":
        return image.resize((width, height), resample)
    if mode == "cover":
        return ImageOps.fit(image, (width, height), method=resample, centering=(0.5, 0.5))
    if mode != "contain":
        fail(f"unsupported resize fit: {mode}")
    allow_upscale = bool(operation.get("allowUpscale", True))
    ratio = min(width / image.width, height / image.height)
    if not allow_upscale:
        ratio = min(1.0, ratio)
    subject_size = (
        max(1, round(image.width * ratio)),
        max(1, round(image.height * ratio)),
    )
    subject = image.resize(subject_size, resample) if subject_size != image.size else image.copy()
    canvas = Image.new("RGBA", (width, height), parse_colour(operation.get("background", "#00000000"), "resize.background"))
    canvas.alpha_composite(subject, anchored_position(canvas.size, subject.size, str(operation.get("anchor", "centre"))))
    return canvas


def alpha_premultiply(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    """Convert straight RGBA to associated alpha with deterministic 8-bit rounding."""
    mode = str(operation.get("mode", "nearest")).lower()
    if mode != "nearest":
        fail("alpha-premultiply.mode must be nearest")
    rgba = image.convert("RGBA")
    try:
        source = rgba.tobytes()
        output = bytearray(len(source))
        for offset in range(0, len(source), 4):
            alpha = source[offset + 3]
            output[offset] = (source[offset] * alpha + 127) // 255
            output[offset + 1] = (source[offset + 1] * alpha + 127) // 255
            output[offset + 2] = (source[offset + 2] * alpha + 127) // 255
            output[offset + 3] = alpha
        return Image.frombytes("RGBA", rgba.size, bytes(output))
    finally:
        rgba.close()


def alpha_unpremultiply(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    """Convert associated RGBA to straight alpha and fail closed on invalid pixels."""
    mode = str(operation.get("mode", "strict")).lower()
    if mode not in {"strict", "clamp"}:
        fail("alpha-unpremultiply.mode must be strict or clamp")
    rgba = image.convert("RGBA")
    try:
        source = rgba.tobytes()
        output = bytearray(len(source))
        for offset in range(0, len(source), 4):
            red = source[offset]
            green = source[offset + 1]
            blue = source[offset + 2]
            alpha = source[offset + 3]
            if alpha == 0:
                if mode == "strict" and (red or green or blue):
                    fail(
                        "alpha-unpremultiply strict mode rejected non-zero RGB at alpha zero"
                    )
                output[offset : offset + 4] = bytes((0, 0, 0, 0))
                continue
            if red > alpha or green > alpha or blue > alpha:
                if mode == "strict":
                    fail(
                        "alpha-unpremultiply strict mode rejected a pixel that violates "
                        "the premultiplied-alpha invariant"
                    )
                red = min(red, alpha)
                green = min(green, alpha)
                blue = min(blue, alpha)
            output[offset] = min(255, (red * 255 + alpha // 2) // alpha)
            output[offset + 1] = min(255, (green * 255 + alpha // 2) // alpha)
            output[offset + 2] = min(255, (blue * 255 + alpha // 2) // alpha)
            output[offset + 3] = alpha
        return Image.frombytes("RGBA", rgba.size, bytes(output))
    finally:
        rgba.close()


def connected_matte_to_alpha(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    rgba = image.copy()
    width, height = rgba.size
    matte = parse_colour(operation["matteColour"], "connected-matte-to-alpha.matteColour", allow_alpha=False)[:3]
    distance = float(operation.get("distance", 32.0))
    if not 0 <= distance <= 441:
        fail("connected-matte-to-alpha.distance must be between 0 and 441")
    threshold = distance * distance
    pixels = rgba.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def eligible(x: int, y: int) -> bool:
        red, green, blue, alpha = pixels[x, y]
        if alpha == 0:
            return True
        delta = (red - matte[0]) ** 2 + (green - matte[1]) ** 2 + (blue - matte[2]) ** 2
        return delta <= threshold

    def enqueue(x: int, y: int) -> None:
        offset = y * width + x
        if visited[offset] or not eligible(x, y):
            return
        visited[offset] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        if height > 1:
            enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        if width > 1:
            enqueue(width - 1, y)
    removed = 0
    while queue:
        x, y = queue.popleft()
        red, green, blue, _ = pixels[x, y]
        pixels[x, y] = red, green, blue, 0
        removed += 1
        if x:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)
    minimum = float(operation.get("minimumCoverage", 0.0))
    if not 0 <= minimum <= 1:
        fail("connected-matte-to-alpha.minimumCoverage must be between 0 and 1")
    if removed / max(1, width * height) < minimum:
        fail("connected matte coverage is below the required minimum")
    return rgba


def edge_decontaminate(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    rgba = image.copy()
    matte = parse_colour(operation["matteColour"], "edge-decontaminate.matteColour", allow_alpha=False)[:3]
    minimum_alpha = int(operation.get("minimumAlpha", 1))
    maximum_alpha = int(operation.get("maximumAlpha", 254))
    if not 0 <= minimum_alpha <= maximum_alpha <= 255:
        fail("edge-decontaminate alpha range is invalid")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < minimum_alpha or alpha > maximum_alpha or alpha == 0:
                continue
            fraction = alpha / 255.0
            corrected = tuple(
                max(0, min(255, round((channel - matte_channel * (1.0 - fraction)) / fraction)))
                for channel, matte_channel in zip((red, green, blue), matte)
            )
            pixels[x, y] = corrected[0], corrected[1], corrected[2], alpha
    return rgba


def hidden_rgb_rebuild(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    rgba = image.copy()
    width, height = rgba.size
    maximum = int(operation.get("maximumPixels", MAXIMUM_HIDDEN_RGB_PIXELS))
    if width * height > maximum:
        fail(f"hidden-rgb-rebuild exceeds its {maximum}-pixel boundary")
    pixels = rgba.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] > 0:
                visited[y * width + x] = 1
                queue.append((x, y))
    if not queue:
        fail("hidden-rgb-rebuild requires at least one non-transparent pixel")
    while queue:
        x, y = queue.popleft()
        source = pixels[x, y]
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if not (0 <= next_x < width and 0 <= next_y < height):
                continue
            offset = next_y * width + next_x
            if visited[offset]:
                continue
            visited[offset] = 1
            _, _, _, alpha = pixels[next_x, next_y]
            pixels[next_x, next_y] = source[0], source[1], source[2], alpha
            queue.append((next_x, next_y))
    return rgba


def palette_normalize(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    mode = str(operation.get("mode", "grayscale")).lower()
    alpha = image.getchannel("A")
    if mode == "grayscale":
        gray = ImageOps.grayscale(image.convert("RGB"))
        return Image.merge("RGBA", (gray, gray, gray, alpha))
    if mode == "monochrome":
        foreground = parse_colour(operation.get("foreground", "#ffffff"), "palette-normalize.foreground")[:3]
        background = parse_colour(operation.get("background", "#000000"), "palette-normalize.background")[:3]
        threshold = int(operation.get("threshold", 128))
        gray = ImageOps.grayscale(image.convert("RGB"))
        output = Image.new("RGBA", image.size)
        source_values = gray.tobytes()
        alpha_values = alpha.tobytes()
        output_values = bytearray(image.width * image.height * 4)
        for index, luminance in enumerate(source_values):
            colour = foreground if luminance >= threshold else background
            offset = index * 4
            output_values[offset : offset + 4] = bytes((*colour, alpha_values[index]))
        return Image.frombytes("RGBA", image.size, bytes(output_values))
    if mode == "palette":
        raw_palette = operation.get("palette")
        if not isinstance(raw_palette, list) or not 1 <= len(raw_palette) <= 256:
            fail("palette-normalize.palette must contain 1-256 colours")
        palette = [parse_colour(value, "palette-normalize.palette", allow_alpha=False)[:3] for value in raw_palette]
        output = image.copy()
        pixels = output.load()
        for y in range(output.height):
            for x in range(output.width):
                red, green, blue, alpha_value = pixels[x, y]
                nearest = min(
                    palette,
                    key=lambda colour: (red - colour[0]) ** 2 + (green - colour[1]) ** 2 + (blue - colour[2]) ** 2,
                )
                pixels[x, y] = nearest[0], nearest[1], nearest[2], alpha_value
        return output
    fail(f"unsupported palette-normalize mode: {mode}")


def levels(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    black = float(operation.get("blackPoint", 0.0))
    white = float(operation.get("whitePoint", 255.0))
    gamma = float(operation.get("gamma", 1.0))
    if not 0 <= black < white <= 255 or not 0.05 <= gamma <= 10:
        fail("levels parameters are invalid")
    denominator = white - black
    lookup = []
    for value in range(256):
        normalized = max(0.0, min(1.0, (value - black) / denominator))
        lookup.append(round((normalized ** (1.0 / gamma)) * 255.0))
    red, green, blue, alpha = image.split()
    return Image.merge("RGBA", (red.point(lookup), green.point(lookup), blue.point(lookup), alpha))


def outline(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    width = int(operation.get("width", 1))
    if not 1 <= width <= 32:
        fail("outline.width must be between 1 and 32")
    colour = parse_colour(operation["colour"], "outline.colour")
    alpha = image.getchannel("A")
    dilated = alpha.filter(ImageFilter.MaxFilter(width * 2 + 1))
    outline_alpha = ImageChops.subtract(dilated, alpha)
    if colour[3] != 255:
        outline_alpha = outline_alpha.point(lambda value: round(value * colour[3] / 255))
    layer = Image.new("RGBA", image.size, (*colour[:3], 0))
    layer.putalpha(outline_alpha)
    layer.alpha_composite(image)
    return layer


def colour_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> float:
    return math.sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))


def colour_replace(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    source = parse_colour(operation["fromColour"], "colour-replace.fromColour", allow_alpha=False)[:3]
    target = parse_colour(operation["toColour"], "colour-replace.toColour")
    distance = float(operation.get("distance", 0))
    if not 0 <= distance <= 441:
        fail("colour-replace.distance must be between 0 and 441")
    preserve_alpha = operation.get("preserveAlpha", True) is not False
    output = image.copy().convert("RGBA")
    pixels = output.load()
    for y in range(output.height):
        for x in range(output.width):
            current = pixels[x, y]
            if colour_distance(current[:3], source) <= distance:
                alpha = current[3] if preserve_alpha else target[3]
                pixels[x, y] = (target[0], target[1], target[2], alpha)
    return output


def translate_image(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    dx = int(operation.get("x", 0))
    dy = int(operation.get("y", 0))
    if abs(dx) > 65536 or abs(dy) > 65536:
        fail("translate offsets exceed the bounded canvas range")
    canvas = Image.new("RGBA", image.size, parse_colour(operation.get("background", "#00000000"), "translate.background"))
    canvas.alpha_composite(image, (dx, dy))
    return canvas


def adjust_rgb_channels(image: Image.Image, enhancer: Any, factor: float) -> Image.Image:
    alpha = image.getchannel("A")
    source = image.convert("RGB")
    try:
        result = enhancer(source).enhance(factor).convert("RGBA")
        result.putalpha(alpha)
        return result
    finally:
        source.close()
        alpha.close()


def _preserve_alpha_filter(image: Image.Image, image_filter: ImageFilter.Filter) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    try:
        result = rgb.filter(image_filter).convert("RGBA")
        result.putalpha(alpha)
        return result
    finally:
        rgb.close()
        alpha.close()


def _blend_filtered_rgb(image: Image.Image, image_filter: ImageFilter.Filter, blend: float) -> Image.Image:
    if not 0 <= blend <= 1:
        fail("filter blend must be between 0 and 1")
    filtered = _preserve_alpha_filter(image, image_filter)
    if blend >= 1:
        return filtered
    if blend <= 0:
        filtered.close()
        return image.copy()
    result = Image.blend(image, filtered, blend)
    filtered.close()
    return result


def _arbitrary_rotate(image: Image.Image, operation: dict[str, Any], maximum_pixels: int) -> Image.Image:
    angle = float(operation["angle"])
    expand = bool(operation.get("expand", False))
    background = parse_colour(operation.get("background", "#00000000"), "rotate.background")
    result = image.rotate(
        angle,
        resample=sampling(operation.get("sampling", "bicubic")),
        expand=expand,
        fillcolor=background,
    )
    require_pixel_budget(result.width, result.height, "rotate target", maximum_pixels)
    return result


def _transform_image(image: Image.Image, operation: dict[str, Any], transform: Image.Transform, key: str, maximum_pixels: int) -> Image.Image:
    width = int(operation.get("width", image.width))
    height = int(operation.get("height", image.height))
    require_pixel_budget(width, height, f"{operation['op']} target", maximum_pixels)
    coefficients = tuple(float(value) for value in operation[key])
    return image.transform(
        (width, height),
        transform,
        coefficients,
        resample=sampling(operation.get("sampling", "bicubic")),
        fillcolor=parse_colour(operation.get("background", "#00000000"), f"{operation['op']}.background"),
    )


def _grayscale(image: Image.Image, mode: str) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    try:
        if mode == "average":
            red, green, blue = rgb.split()
            try:
                values = bytes(
                    round((r + g + b) / 3)
                    for r, g, b in zip(red.tobytes(), green.tobytes(), blue.tobytes())
                )
                gray = Image.frombytes("L", image.size, values)
            finally:
                red.close()
                green.close()
                blue.close()
        else:
            gray = ImageOps.grayscale(rgb)
        try:
            return Image.merge("RGBA", (gray, gray, gray, alpha))
        finally:
            gray.close()
    finally:
        rgb.close()
        alpha.close()


def _invert_rgb(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    try:
        inverted = ImageOps.invert(rgb).convert("RGBA")
        inverted.putalpha(alpha)
        return inverted
    finally:
        rgb.close()
        alpha.close()


def _posterize(image: Image.Image, bits: int) -> Image.Image:
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    try:
        result = ImageOps.posterize(rgb, bits).convert("RGBA")
        result.putalpha(alpha)
        return result
    finally:
        rgb.close()
        alpha.close()


def _threshold_rgb(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    threshold = int(operation["threshold"])
    low = parse_colour(operation.get("lowColour", "#000000"), "threshold.lowColour")
    high = parse_colour(operation.get("highColour", "#ffffff"), "threshold.highColour")
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    try:
        gray = ImageOps.grayscale(rgb)
        try:
            selector = gray.point(lambda value: 255 if value >= threshold else 0)
            try:
                low_image = Image.new("RGBA", image.size, low)
                high_image = Image.new("RGBA", image.size, high)
                try:
                    result = Image.composite(high_image, low_image, selector)
                    result.putalpha(alpha)
                    return result
                finally:
                    low_image.close()
                    high_image.close()
            finally:
                selector.close()
        finally:
            gray.close()
    finally:
        rgb.close()
        alpha.close()


def _gamma_rgb(image: Image.Image, gamma_value: float) -> Image.Image:
    lookup = [round(((value / 255.0) ** (1.0 / gamma_value)) * 255.0) for value in range(256)]
    red, green, blue, alpha = image.split()
    outputs = [red.point(lookup), green.point(lookup), blue.point(lookup)]
    try:
        return Image.merge("RGBA", (*outputs, alpha))
    finally:
        for output in outputs:
            output.close()
        red.close()
        green.close()
        blue.close()
        alpha.close()


def _hue_shift(image: Image.Image, degrees: float) -> Image.Image:
    alpha = image.getchannel("A")
    rgb_source = image.convert("RGB")
    try:
        hsv = rgb_source.convert("HSV")
        try:
            hue, saturation_channel, value_channel = hsv.split()
            try:
                offset = round((degrees % 360) * 255.0 / 360.0)
                shifted_hue = hue.point(lambda value: (value + offset) % 256)
                try:
                    rgb = Image.merge("HSV", (shifted_hue, saturation_channel, value_channel)).convert("RGB").convert("RGBA")
                    rgb.putalpha(alpha)
                    return rgb
                finally:
                    shifted_hue.close()
            finally:
                hue.close()
                saturation_channel.close()
                value_channel.close()
        finally:
            hsv.close()
    finally:
        rgb_source.close()
        alpha.close()


def _curve_lookup(points: list[dict[str, Any]]) -> list[int]:
    result: list[int] = []
    segment = 0
    for value in range(256):
        while segment + 1 < len(points) - 1 and value > int(points[segment + 1]["input"]):
            segment += 1
        left = points[segment]
        right = points[segment + 1]
        span = int(right["input"]) - int(left["input"])
        amount = 0 if span == 0 else (value - int(left["input"])) / span
        output = float(left["output"]) + (float(right["output"]) - float(left["output"])) * amount
        result.append(max(0, min(255, round(output))))
    return result


def _curves(image: Image.Image, channels: dict[str, Any]) -> Image.Image:
    red, green, blue, alpha = image.split()
    channel_images = {"red": red, "green": green, "blue": blue, "alpha": alpha}
    try:
        master = _curve_lookup(channels["master"]) if "master" in channels else list(range(256))
        outputs: list[Image.Image] = []
        for name in ("red", "green", "blue", "alpha"):
            lookup = master
            if name in channels:
                channel_lookup = _curve_lookup(channels[name])
                lookup = [channel_lookup[master[value]] for value in range(256)] if name != "alpha" else channel_lookup
            elif name == "alpha":
                lookup = list(range(256))
            outputs.append(channel_images[name].point(lookup))
        try:
            return Image.merge("RGBA", tuple(outputs))
        finally:
            for output in outputs:
                output.close()
    finally:
        red.close()
        green.close()
        blue.close()
        alpha.close()


def _channel_mixer(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    matrix: list[float] = []
    offsets = operation.get("offsets", [0, 0, 0])
    for index, name in enumerate(("red", "green", "blue")):
        matrix.extend(float(value) for value in operation[name])
        matrix.append(float(offsets[index]))
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    try:
        mixed = rgb.convert("RGB", tuple(matrix)).convert("RGBA")
        mixed.putalpha(alpha)
        return mixed
    finally:
        rgb.close()
        alpha.close()


def _selective_channel_mixer(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    hue_min = float(operation["hueMin"])
    hue_max = float(operation["hueMax"])
    saturation_min = float(operation["saturationMin"])
    saturation_max = float(operation["saturationMax"])
    value_min = float(operation["valueMin"])
    value_max = float(operation["valueMax"])
    if not (0 <= hue_min <= 360 and 0 <= hue_max <= 360):
        fail("selective-channel-mixer hue bounds must be between 0 and 360")
    if not (0 <= saturation_min <= saturation_max <= 1):
        fail("selective-channel-mixer saturation bounds must be ordered between 0 and 1")
    if not (0 <= value_min <= value_max <= 1):
        fail("selective-channel-mixer value bounds must be ordered between 0 and 1")
    rows = [tuple(float(value) for value in operation[name]) for name in ("red", "green", "blue")]
    offsets = tuple(float(value) for value in operation.get("offsets", [0, 0, 0]))
    output = image.copy().convert("RGBA")
    pixels = output.load()
    for y in range(output.height):
        for x in range(output.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            hue_degrees = hue * 360
            hue_selected = hue_min <= hue_degrees <= hue_max if hue_min <= hue_max else hue_degrees >= hue_min or hue_degrees <= hue_max
            if not (hue_selected and saturation_min <= saturation <= saturation_max and value_min <= value <= value_max):
                continue
            channels = (red, green, blue)
            mixed = []
            for row, offset in zip(rows, offsets):
                mixed.append(max(0, min(255, round(sum(row[index] * channels[index] for index in range(3)) + offset))))
            pixels[x, y] = mixed[0], mixed[1], mixed[2], alpha
    return output


def _motion_blur(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    radius = float(operation.get("radius", 8))
    samples = int(operation.get("samples", 17))
    angle = math.radians(float(operation.get("angle", 0)))
    accumulator: Image.Image | None = None
    for index in range(samples):
        position = -1.0 + 2.0 * index / max(1, samples - 1)
        dx = round(math.cos(angle) * radius * position)
        dy = round(math.sin(angle) * radius * position)
        sample = Image.new("RGBA", image.size, (0, 0, 0, 0))
        sample.alpha_composite(image, (dx, dy))
        if accumulator is None:
            accumulator = sample
        else:
            blended = Image.blend(accumulator, sample, 1.0 / (index + 1))
            accumulator.close()
            sample.close()
            accumulator = blended
    if accumulator is None:
        fail("motion-blur requires at least one sample")
    return accumulator


def _alpha_feather(image: Image.Image, radius: float) -> Image.Image:
    result = image.copy()
    source_alpha = image.getchannel("A")
    try:
        alpha = source_alpha.filter(ImageFilter.GaussianBlur(radius=radius))
        try:
            result.putalpha(alpha)
        finally:
            alpha.close()
    finally:
        source_alpha.close()
    return result


def _defringe(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    radius = int(operation.get("radius", 1))
    maximum_alpha = int(operation.get("maximumAlpha", 254))
    strength = float(operation.get("strength", 1))
    rebuilt = hidden_rgb_rebuild(
        image,
        {"maximumPixels": min(MAXIMUM_HIDDEN_RGB_PIXELS, image.width * image.height)},
    )
    matte = None
    if operation.get("matteColour") is not None:
        matte = parse_colour(operation["matteColour"], "defringe.matteColour", allow_alpha=False)[:3]
    source = image.load()
    output = rebuilt.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = source[x, y]
            if alpha <= 0 or alpha > maximum_alpha:
                continue
            neighbours: list[tuple[int, int, int]] = []
            for yy in range(max(0, y - radius), min(image.height, y + radius + 1)):
                for xx in range(max(0, x - radius), min(image.width, x + radius + 1)):
                    candidate = source[xx, yy]
                    if candidate[3] == 255:
                        neighbours.append(candidate[:3])
            if neighbours:
                replacement = tuple(round(sum(value[channel] for value in neighbours) / len(neighbours)) for channel in range(3))
            else:
                replacement = output[x, y][:3]
            if matte is not None:
                fraction = alpha / 255.0
                corrected = tuple(
                    max(0, min(255, round((channel - matte_channel * (1.0 - fraction)) / max(fraction, 1 / 255))))
                    for channel, matte_channel in zip((red, green, blue), matte)
                )
                replacement = tuple(round(replacement[index] * (1 - strength) + corrected[index] * strength) for index in range(3))
            else:
                replacement = tuple(round((red, green, blue)[index] * (1 - strength) + replacement[index] * strength) for index in range(3))
            output[x, y] = (*replacement, alpha)
    return rebuilt


def _drop_shadow(image: Image.Image, operation: dict[str, Any], maximum_pixels: int) -> Image.Image:
    offset_x = int(operation.get("offsetX", 4))
    offset_y = int(operation.get("offsetY", 4))
    radius = float(operation.get("radius", 4))
    opacity = float(operation.get("opacity", 0.5))
    colour = parse_colour(operation.get("colour", "#000000"), "drop-shadow.colour")
    margin = math.ceil(radius * 3 + max(abs(offset_x), abs(offset_y))) if operation.get("expandCanvas", False) else 0
    width, height = require_pixel_budget(image.width + margin * 2, image.height + margin * 2, "drop-shadow target", maximum_pixels)
    alpha = image.getchannel("A")
    blurred_base = alpha.filter(ImageFilter.GaussianBlur(radius=radius))
    blurred = blurred_base
    try:
        if opacity != 1:
            blurred = blurred_base.point(lambda value: round(value * opacity))
        shadow = Image.new("RGBA", (width, height), (*colour[:3], 0))
        shadow_mask = Image.new("L", (width, height), 0)
        try:
            shadow_mask.paste(blurred, (margin + offset_x, margin + offset_y))
            shadow.putalpha(shadow_mask)
            shadow.alpha_composite(image, (margin, margin))
            return shadow
        finally:
            shadow_mask.close()
    finally:
        if blurred is not blurred_base:
            blurred.close()
        blurred_base.close()
        alpha.close()


def _outer_glow(image: Image.Image, operation: dict[str, Any], maximum_pixels: int) -> Image.Image:
    radius = float(operation.get("radius", 4))
    spread = float(operation.get("spread", 0))
    opacity = float(operation.get("opacity", 0.5))
    colour = parse_colour(operation.get("colour", "#ffffff"), "outer-glow.colour")
    margin = math.ceil(radius * 3 + spread) if operation.get("expandCanvas", False) else 0
    width, height = require_pixel_budget(image.width + margin * 2, image.height + margin * 2, "outer-glow target", maximum_pixels)
    source_alpha = image.getchannel("A")
    spread_alpha = source_alpha
    try:
        if spread > 0:
            filter_size = min(129, max(3, int(spread) * 2 + 1))
            if filter_size % 2 == 0:
                filter_size += 1
            spread_alpha = source_alpha.filter(ImageFilter.MaxFilter(filter_size))
        blurred_base = spread_alpha.filter(ImageFilter.GaussianBlur(radius=radius))
        blurred = blurred_base
        try:
            if opacity != 1:
                blurred = blurred_base.point(lambda value: round(value * opacity))
            glow = Image.new("RGBA", (width, height), (*colour[:3], 0))
            mask = Image.new("L", (width, height), 0)
            try:
                mask.paste(blurred, (margin, margin))
                glow.putalpha(mask)
                glow.alpha_composite(image, (margin, margin))
                return glow
            finally:
                mask.close()
        finally:
            if blurred is not blurred_base:
                blurred.close()
            blurred_base.close()
    finally:
        if spread_alpha is not source_alpha:
            spread_alpha.close()
        source_alpha.close()


def _rim_light(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    """Apply a directional inner rim without changing the source silhouette."""
    width = governed_integer(operation.get("width", 2), "rim-light.width", 1, 32)
    angle = math.radians(
        governed_number(operation.get("angleDegrees", 315), "rim-light.angleDegrees", -3600, 3600)
    )
    softness = governed_number(operation.get("softness", 0), "rim-light.softness", 0, 64)
    opacity = governed_number(operation.get("opacity", 0.5), "rim-light.opacity", 0, 1)
    colour = parse_colour(operation.get("colour", "#ffffff"), "rim-light.colour")
    blend_mode = str(operation.get("blendMode", "screen"))
    if blend_mode not in {"normal", "screen", "add"}:
        fail("rim-light.blendMode must be normal, screen or add")

    sample_x = round(math.cos(angle) * width)
    sample_y = round(math.sin(angle) * width)
    if sample_x == 0 and sample_y == 0:
        sample_x = 1
    source_alpha = image.getchannel("A")
    neighbour_alpha = Image.new("L", image.size, 0)
    directional_edge = None
    softened_edge = None
    clipped_edge = None
    effective_mask = None
    base_rgb = None
    colour_rgb = None
    blend_target = None
    inverted_base = None
    inverted_colour = None
    multiplied = None
    result_rgb = None
    try:
        # At output pixel (x, y), sample alpha at (x + sample_x, y + sample_y).
        # Pixels opaque here and transparent toward the light become the rim.
        neighbour_alpha.paste(source_alpha, (-sample_x, -sample_y))
        directional_edge = ImageChops.subtract(source_alpha, neighbour_alpha)
        softened_edge = (
            directional_edge.filter(ImageFilter.GaussianBlur(radius=softness))
            if softness > 0
            else directional_edge.copy()
        )
        clipped_edge = ImageChops.multiply(softened_edge, source_alpha)
        effective_opacity = opacity * (colour[3] / 255)
        effective_mask = (
            clipped_edge.point(lambda value: round(value * effective_opacity))
            if effective_opacity != 1
            else clipped_edge.copy()
        )
        base_rgb = image.convert("RGB")
        colour_rgb = Image.new("RGB", image.size, colour[:3])
        if blend_mode == "normal":
            blend_target = colour_rgb.copy()
        elif blend_mode == "add":
            blend_target = ImageChops.add(base_rgb, colour_rgb, scale=1, offset=0)
        else:
            inverted_base = ImageOps.invert(base_rgb)
            inverted_colour = ImageOps.invert(colour_rgb)
            multiplied = ImageChops.multiply(inverted_base, inverted_colour)
            blend_target = ImageOps.invert(multiplied)
        result_rgb = Image.composite(blend_target, base_rgb, effective_mask)
        result = result_rgb.convert("RGBA")
        result.putalpha(source_alpha)
        return result
    finally:
        for disposable in (
            result_rgb,
            multiplied,
            inverted_colour,
            inverted_base,
            blend_target,
            colour_rgb,
            base_rgb,
            effective_mask,
            clipped_edge,
            softened_edge,
            directional_edge,
            neighbour_alpha,
            source_alpha,
        ):
            if disposable is not None:
                disposable.close()


def _normal_map_from_height(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    """Derive a normalized tangent-style normal map from luminance or alpha."""
    pixels = image.width * image.height
    if pixels > MAXIMUM_NORMAL_MAP_PIXELS:
        fail(
            "normal-map-from-height exceeds its bounded CPU pixel limit "
            f"({pixels} > {MAXIMUM_NORMAL_MAP_PIXELS})"
        )
    source_kind = str(operation.get("source", "luminance"))
    strength = governed_number(
        operation.get("strength", 2),
        "normal-map-from-height.strength",
        0.01,
        32,
    )
    blur_radius = governed_number(
        operation.get("blurRadius", 0),
        "normal-map-from-height.blurRadius",
        0,
        32,
    )
    invert_x_value = operation.get("invertX", False)
    invert_y_value = operation.get("invertY", False)
    preserve_alpha_value = operation.get("preserveAlpha", True)
    if not isinstance(invert_x_value, bool) or not isinstance(invert_y_value, bool):
        fail("normal-map-from-height invertX and invertY must be boolean")
    if not isinstance(preserve_alpha_value, bool):
        fail("normal-map-from-height preserveAlpha must be boolean")
    invert_x = invert_x_value
    invert_y = invert_y_value
    preserve_alpha = preserve_alpha_value
    if source_kind not in {"luminance", "alpha"}:
        fail("normal-map-from-height.source must be luminance or alpha")

    rgb_source = None
    base_height = None
    height = None
    gradient_x = None
    gradient_y = None
    output_rgb = None
    output_alpha = None
    try:
        if source_kind == "alpha":
            base_height = image.getchannel("A")
        else:
            rgb_source = image.convert("RGB")
            base_height = ImageOps.grayscale(rgb_source)
        height = (
            base_height.filter(ImageFilter.GaussianBlur(radius=blur_radius))
            if blur_radius > 0
            else base_height.copy()
        )
        gradient_x = height.filter(
            ImageFilter.Kernel(
                (3, 3),
                (-1, 0, 1, -2, 0, 2, -1, 0, 1),
                scale=8,
                offset=128,
            )
        )
        gradient_y = height.filter(
            ImageFilter.Kernel(
                (3, 3),
                (-1, -2, -1, 0, 0, 0, 1, 2, 1),
                scale=8,
                offset=128,
            )
        )
        encoded = bytearray(pixels * 3)
        cache: dict[tuple[int, int], bytes] = {}
        for index, (encoded_x, encoded_y) in enumerate(
            zip(pixel_data(gradient_x), pixel_data(gradient_y))
        ):
            x = index % image.width
            y = index // image.width
            if x == 0 or y == 0 or x == image.width - 1 or y == image.height - 1:
                encoded_x = 128
                encoded_y = 128
            key = (encoded_x, encoded_y)
            normal = cache.get(key)
            if normal is None:
                slope_x = ((encoded_x - 128) / 127) * strength
                slope_y = ((encoded_y - 128) / 127) * strength
                normal_x = slope_x if invert_x else -slope_x
                normal_y = slope_y if invert_y else -slope_y
                inverse_length = 1 / math.sqrt(normal_x * normal_x + normal_y * normal_y + 1)
                normal = bytes((
                    max(0, min(255, round((normal_x * inverse_length * 0.5 + 0.5) * 255))),
                    max(0, min(255, round((normal_y * inverse_length * 0.5 + 0.5) * 255))),
                    max(0, min(255, round((inverse_length * 0.5 + 0.5) * 255))),
                ))
                cache[key] = normal
            offset = index * 3
            encoded[offset:offset + 3] = normal
        output_rgb = Image.frombytes("RGB", image.size, bytes(encoded))
        result = output_rgb.convert("RGBA")
        if preserve_alpha:
            output_alpha = image.getchannel("A")
            result.putalpha(output_alpha)
        else:
            result.putalpha(255)
        return result
    finally:
        for disposable in (
            output_alpha,
            output_rgb,
            gradient_y,
            gradient_x,
            height,
            base_height,
            rgb_source,
        ):
            if disposable is not None:
                disposable.close()


def _alpha_clean(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    """Master alpha deterministically and guarantee canonical transparent pixels."""
    threshold = governed_integer(operation.get("threshold", 96), "alpha-clean.threshold", 0, 255)
    binary = operation.get("binary", True)
    zero_rgb = operation.get("zeroTransparentRgb", True)
    if not isinstance(binary, bool) or not isinstance(zero_rgb, bool):
        fail("alpha-clean binary and zeroTransparentRgb must be boolean")
    output = bytearray(image.convert("RGBA").tobytes())
    for offset in range(0, len(output), 4):
        alpha = output[offset + 3]
        if alpha < threshold:
            output[offset:offset + 4] = b"\x00\x00\x00\x00"
        elif binary:
            output[offset + 3] = 255
        if zero_rgb and output[offset + 3] == 0:
            output[offset:offset + 3] = b"\x00\x00\x00"
    return Image.frombytes("RGBA", image.size, bytes(output))


def _chroma_to_alpha(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    """Remove bounded channel-dominant chroma without touching other translucent effects."""
    channel_name = str(operation.get("channel", "green"))
    channels = {"red": 0, "green": 1, "blue": 2}
    if channel_name not in channels:
        fail("chroma-to-alpha.channel must be red, green or blue")
    channel = channels[channel_name]
    minimum = governed_integer(operation.get("minimumChannel", 45), "chroma-to-alpha.minimumChannel", 0, 255)
    dominance = governed_integer(operation.get("minimumDominance", 15), "chroma-to-alpha.minimumDominance", 0, 255)
    minimum_alpha = governed_integer(operation.get("minimumAlpha", 1), "chroma-to-alpha.minimumAlpha", 0, 255)
    maximum_alpha = governed_integer(operation.get("maximumAlpha", 95), "chroma-to-alpha.maximumAlpha", 0, 255)
    if minimum_alpha > maximum_alpha:
        fail("chroma-to-alpha minimumAlpha cannot exceed maximumAlpha")
    output = bytearray(image.convert("RGBA").tobytes())
    for offset in range(0, len(output), 4):
        alpha = output[offset + 3]
        values = output[offset:offset + 3]
        selected = values[channel]
        others = [values[index] for index in range(3) if index != channel]
        if minimum_alpha <= alpha <= maximum_alpha and selected >= minimum and selected - max(others) >= dominance:
            output[offset:offset + 4] = b"\x00\x00\x00\x00"
        elif alpha == 0:
            output[offset:offset + 3] = b"\x00\x00\x00"
    return Image.frombytes("RGBA", image.size, bytes(output))


def _component_prune(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    """Delete disconnected visible islands below an exact bounded pixel area."""
    minimum_pixels = governed_integer(operation.get("minimumPixels", 2), "component-prune.minimumPixels", 1, 1_000_000)
    alpha_threshold = governed_integer(operation.get("alphaThreshold", 1), "component-prune.alphaThreshold", 1, 255)
    width, height = image.size
    alpha_channel = image.getchannel("A")
    try:
        alpha_bytes = alpha_channel.tobytes()
    finally:
        alpha_channel.close()
    visible = bytearray(1 if alpha >= alpha_threshold else 0 for alpha in alpha_bytes)
    visited = bytearray(width * height)
    remove = bytearray(width * height)
    for start in range(width * height):
        if not visible[start] or visited[start]:
            continue
        component: list[int] = []
        queue = deque([start])
        visited[start] = 1
        while queue:
            current = queue.popleft()
            component.append(current)
            x, y = current % width, current // width
            for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= next_x < width and 0 <= next_y < height:
                    index = next_y * width + next_x
                    if visible[index] and not visited[index]:
                        visited[index] = 1
                        queue.append(index)
        if len(component) < minimum_pixels:
            for index in component:
                remove[index] = 1
    output = bytearray(image.convert("RGBA").tobytes())
    for index, should_remove in enumerate(remove):
        offset = index * 4
        if should_remove:
            output[offset:offset + 4] = b"\x00\x00\x00\x00"
        elif output[offset + 3] == 0:
            output[offset:offset + 3] = b"\x00\x00\x00"
    return Image.frombytes("RGBA", image.size, bytes(output))


def _bounded_rectangle(operation: dict[str, Any], image: Image.Image, label: str) -> tuple[int, int, int, int]:
    x = governed_integer(operation.get("x"), f"{label}.x", 0, image.width - 1)
    y = governed_integer(operation.get("y"), f"{label}.y", 0, image.height - 1)
    width = governed_integer(operation.get("width"), f"{label}.width", 1, image.width)
    height = governed_integer(operation.get("height"), f"{label}.height", 1, image.height)
    if x + width > image.width or y + height > image.height:
        fail(f"{label} rectangle escaped the image")
    return x, y, width, height


def _rect_clear(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    x, y, width, height = _bounded_rectangle(operation, image, "rect-clear")
    output = image.copy()
    output.paste((0, 0, 0, 0), (x, y, x + width, y + height))
    return output


def _rect_fill(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    x, y, width, height = _bounded_rectangle(operation, image, "rect-fill")
    colour = parse_colour(operation["colour"], "rect-fill.colour")
    output = image.copy()
    output.paste(colour, (x, y, x + width, y + height))
    return output


def _clone_stamp(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
    source_spec = operation.get("source")
    destination = operation.get("destination")
    if not isinstance(source_spec, dict) or not isinstance(destination, dict):
        fail("clone-stamp requires source and destination objects")
    x, y, width, height = _bounded_rectangle(source_spec, image, "clone-stamp.source")
    destination_x = governed_integer(destination.get("x"), "clone-stamp.destination.x", 0, image.width - 1)
    destination_y = governed_integer(destination.get("y"), "clone-stamp.destination.y", 0, image.height - 1)
    if destination_x + width > image.width or destination_y + height > image.height:
        fail("clone-stamp destination escaped the image")
    patch = image.crop((x, y, x + width, y + height))
    output = image.copy()
    try:
        output.alpha_composite(patch, (destination_x, destination_y))
        return output
    finally:
        patch.close()


def apply_operation(
    image: Image.Image,
    operation: dict[str, Any],
    maximum_pixels: int = MAXIMUM_PIXELS,
) -> Image.Image:
    op = operation["op"]
    if op in {"inspect", "convert", "optimize"}:
        return image
    if op == "trim-alpha":
        threshold = int(operation.get("threshold", 0))
        alpha = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
        bbox = alpha.getbbox()
        alpha.close()
        if bbox is None:
            if operation.get("allowBlank", False):
                return image.copy()
            fail("trim-alpha encountered a fully transparent image")
        margin = int(operation.get("margin", 0))
        left = max(0, bbox[0] - margin)
        top = max(0, bbox[1] - margin)
        right = min(image.width, bbox[2] + margin)
        bottom = min(image.height, bbox[3] + margin)
        return image.crop((left, top, right, bottom))
    if op == "crop":
        x, y = int(operation["x"]), int(operation["y"])
        width, height = require_pixel_budget(int(operation["width"]), int(operation["height"]), "crop target", maximum_pixels)
        if x < 0 or y < 0 or width < 1 or height < 1 or x + width > image.width or y + height > image.height:
            fail("crop rectangle must be inside the source image")
        return image.crop((x, y, x + width, y + height))
    if op == "pad-canvas":
        width, height = require_pixel_budget(int(operation["width"]), int(operation["height"]), "pad-canvas target", maximum_pixels)
        if width < image.width or height < image.height:
            fail("pad-canvas cannot crop the source image")
        canvas = Image.new("RGBA", (width, height), parse_colour(operation.get("background", "#00000000"), "pad-canvas.background"))
        canvas.alpha_composite(image, anchored_position(canvas.size, image.size, str(operation.get("anchor", "centre"))))
        return canvas
    if op == "resize":
        return resized_canvas(image, operation, maximum_pixels=maximum_pixels)
    if op == "pixel-resize":
        return resized_canvas(image, operation, pixel=True, maximum_pixels=maximum_pixels)
    if op == "flip-horizontal":
        return ImageOps.mirror(image)
    if op == "flip-vertical":
        return ImageOps.flip(image)
    if op == "rotate-90":
        return image.transpose(Image.Transpose.ROTATE_90)
    if op == "rotate-180":
        return image.transpose(Image.Transpose.ROTATE_180)
    if op == "rotate-270":
        return image.transpose(Image.Transpose.ROTATE_270)
    if op == "rotate":
        return _arbitrary_rotate(image, operation, maximum_pixels)
    if op == "affine-transform":
        return _transform_image(image, operation, Image.Transform.AFFINE, "matrix", maximum_pixels)
    if op == "perspective-transform":
        return _transform_image(image, operation, Image.Transform.PERSPECTIVE, "coefficients", maximum_pixels)
    if op == "translate":
        return translate_image(image, operation)
    if op == "colour-replace":
        return colour_replace(image, operation)
    if op == "brightness":
        return adjust_rgb_channels(image, ImageEnhance.Brightness, float(operation.get("factor", 1.0)))
    if op == "contrast":
        return adjust_rgb_channels(image, ImageEnhance.Contrast, float(operation.get("factor", 1.0)))
    if op == "saturation":
        return adjust_rgb_channels(image, ImageEnhance.Color, float(operation.get("factor", 1.0)))
    if op == "sharpness":
        return adjust_rgb_channels(image, ImageEnhance.Sharpness, float(operation.get("factor", 1.0)))
    if op == "grayscale":
        return _grayscale(image, str(operation.get("mode", "luminance")))
    if op == "invert":
        return _invert_rgb(image)
    if op == "posterize":
        return _posterize(image, int(operation["bits"]))
    if op == "threshold":
        return _threshold_rgb(image, operation)
    if op == "gamma":
        return _gamma_rgb(image, float(operation["gamma"]))
    if op == "hue-shift":
        return _hue_shift(image, float(operation["degrees"]))
    if op == "curves":
        return _curves(image, operation["channels"])
    if op == "channel-mixer":
        return _channel_mixer(image, operation)
    if op == "selective-channel-mixer":
        return _selective_channel_mixer(image, operation)
    if op == "gaussian-blur":
        return _preserve_alpha_filter(image, ImageFilter.GaussianBlur(radius=float(operation.get("radius", 1.0))))
    if op == "box-blur":
        return _preserve_alpha_filter(image, ImageFilter.BoxBlur(radius=float(operation.get("radius", 1.0))))
    if op == "median-filter":
        return _preserve_alpha_filter(image, ImageFilter.MedianFilter(size=int(operation.get("size", 3))))
    if op == "motion-blur":
        return _motion_blur(image, operation)
    if op == "emboss":
        return _blend_filtered_rgb(image, ImageFilter.EMBOSS, float(operation.get("blend", 1.0)))
    if op == "find-edges":
        return _blend_filtered_rgb(image, ImageFilter.FIND_EDGES, float(operation.get("blend", 1.0)))
    if op == "edge-enhance":
        return _blend_filtered_rgb(image, ImageFilter.EDGE_ENHANCE_MORE, float(operation.get("blend", 1.0)))
    if op == "unsharp-mask":
        return _preserve_alpha_filter(
            image,
            ImageFilter.UnsharpMask(
                radius=float(operation.get("radius", 2.0)),
                percent=int(operation.get("percent", 150)),
                threshold=int(operation.get("threshold", 3)),
            ),
        )
    if op == "alpha-erode":
        width = int(operation.get("width", 1))
        result = image.copy()
        alpha = result.getchannel("A").filter(ImageFilter.MinFilter(width * 2 + 1))
        result.putalpha(alpha)
        alpha.close()
        return result
    if op == "alpha-dilate":
        width = int(operation.get("width", 1))
        result = image.copy()
        alpha = result.getchannel("A").filter(ImageFilter.MaxFilter(width * 2 + 1))
        result.putalpha(alpha)
        alpha.close()
        return result
    if op == "alpha-threshold":
        threshold = int(operation.get("threshold", 128))
        output = image.copy()
        alpha = output.getchannel("A").point(lambda value: 255 if value >= threshold else 0)
        output.putalpha(alpha)
        alpha.close()
        return output
    if op == "alpha-clean":
        return _alpha_clean(image, operation)
    if op == "chroma-to-alpha":
        return _chroma_to_alpha(image, operation)
    if op == "component-prune":
        return _component_prune(image, operation)
    if op == "rect-clear":
        return _rect_clear(image, operation)
    if op == "rect-fill":
        return _rect_fill(image, operation)
    if op == "clone-stamp":
        return _clone_stamp(image, operation)
    if op == "alpha-premultiply":
        return alpha_premultiply(image, operation)
    if op == "alpha-unpremultiply":
        return alpha_unpremultiply(image, operation)
    if op == "alpha-feather":
        return _alpha_feather(image, float(operation.get("radius", 1)))
    if op == "connected-matte-to-alpha":
        return connected_matte_to_alpha(image, operation)
    if op == "edge-decontaminate":
        return edge_decontaminate(image, operation)
    if op == "defringe":
        return _defringe(image, operation)
    if op == "hidden-rgb-rebuild":
        return hidden_rgb_rebuild(image, operation)
    if op == "palette-normalize":
        return palette_normalize(image, operation)
    if op == "quantize":
        colours = int(operation.get("colours", 32))
        if not 2 <= colours <= 256:
            fail("quantize.colours must be between 2 and 256")
        quantized = image.quantize(
            colors=colours,
            method=Image.Quantize.FASTOCTREE,
            dither=Image.Dither.FLOYDSTEINBERG if operation.get("dither", False) else Image.Dither.NONE,
        )
        result = quantized.convert("RGBA")
        quantized.close()
        return result
    if op == "autocontrast":
        red, green, blue, alpha = image.split()
        cutoff = float(operation.get("cutoff", 0.0))
        channels = (ImageOps.autocontrast(red, cutoff=cutoff), ImageOps.autocontrast(green, cutoff=cutoff), ImageOps.autocontrast(blue, cutoff=cutoff), alpha)
        try:
            return Image.merge("RGBA", channels)
        finally:
            for channel in channels[:3]:
                channel.close()
            red.close()
            green.close()
            blue.close()
            alpha.close()
    if op == "levels":
        return levels(image, operation)
    if op == "outline":
        return outline(image, operation)
    if op == "drop-shadow":
        return _drop_shadow(image, operation, maximum_pixels)
    if op == "outer-glow":
        return _outer_glow(image, operation, maximum_pixels)
    if op == "rim-light":
        return _rim_light(image, operation)
    if op == "normal-map-from-height":
        return _normal_map_from_height(image, operation)
    fail(f"unsupported operation entered runtime: {op}")


def estimated_image_output_bytes(images: Iterable[Image.Image]) -> int:
    pixels = sum(image.width * image.height for image in images)
    return pixels * 5 + OUTPUT_ENCODING_OVERHEAD_BYTES


def save_image(
    context: "RuntimeContext",
    image: Image.Image,
    target: Path,
    output_format: str,
) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        fail(f"target already exists inside staging root: {target}")
    context.preflight_output(
        target,
        estimated_image_output_bytes([image]),
        f"image output {target}",
    )
    if output_format == "png":
        image.save(target, format="PNG", optimize=True, compress_level=9)
    elif output_format == "webp":
        image.save(target, format="WEBP", lossless=True, quality=100, method=6)
    elif output_format == "jpeg":
        flattened = Image.new("RGB", image.size, (0, 0, 0))
        converted = image.convert("RGB")
        try:
            flattened.paste(converted, mask=image.getchannel("A"))
            flattened.save(target, format="JPEG", quality=95, optimize=True, progressive=False)
        finally:
            converted.close()
            flattened.close()
    elif output_format == "gif":
        image.save(target, format="GIF", optimize=True)
    else:
        fail(f"unsupported output format: {output_format}")
    context.register_output(target, f"image output {target}")


def save_animation(
    context: "RuntimeContext",
    frames: list[Image.Image],
    target: Path,
    duration_ms: int,
) -> None:
    if not frames:
        fail("animation output requires at least one frame")
    target.parent.mkdir(parents=True, exist_ok=True)
    context.preflight_output(
        target,
        estimated_image_output_bytes(frames),
        f"animation output {target}",
    )
    frames[0].save(
        target,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        disposal=2,
        optimize=False,
        transparency=0,
    )
    context.register_output(target, f"animation output {target}")


def sequence_animation_preview_evidence(
    frames: list[Image.Image],
    preview: dict[str, Any],
) -> dict[str, Any]:
    enabled = bool(preview.get("animatedGif", False))
    interpolation = str(preview.get("interpolation", "none"))
    easing = str(preview.get("easing", "smoothstep"))
    if interpolation not in {"none", "crossfade"}:
        fail("sequence-review animation preview interpolation is invalid")
    if easing not in {"linear", "smoothstep"}:
        fail("sequence-review animation preview easing is invalid")
    loop_transition = bool(preview.get("loopTransition", False))
    presentation_fps = governed_number(
        preview.get("presentationFps", 30),
        "sequence-review preview.presentationFps",
        1,
        50,
    )
    samples_per_transition = governed_integer(
        preview.get("samplesPerTransition", 1),
        "sequence-review preview.samplesPerTransition",
        1,
        MAXIMUM_SEQUENCE_PREVIEW_FRAMES,
    )
    source_frame_duration_ms = governed_integer(
        preview.get("frameDurationMs", 100),
        "sequence-review preview.frameDurationMs",
        20,
        10_000,
    )
    output_frame_duration_ms = governed_integer(
        preview.get("outputFrameDurationMs", source_frame_duration_ms),
        "sequence-review preview.outputFrameDurationMs",
        20,
        10_000,
    )
    dimensions_match = all(frame.size == frames[0].size for frame in frames[1:])
    interpolation_applied = (
        enabled
        and interpolation == "crossfade"
        and len(frames) > 1
        and dimensions_match
    )
    rendered_frame_count = (
        governed_integer(
            preview.get("renderedFrameCount", len(frames)),
            "sequence-review preview.renderedFrameCount",
            1,
            MAXIMUM_SEQUENCE_PREVIEW_FRAMES,
        )
        if interpolation_applied
        else len(frames) if enabled else 0
    )
    if rendered_frame_count > MAXIMUM_SEQUENCE_PREVIEW_FRAMES:
        fail(
            "sequence-review animation preview exceeds the governed "
            f"{MAXIMUM_SEQUENCE_PREVIEW_FRAMES}-frame boundary"
        )
    return {
        "enabled": enabled,
        "sourceFrameCount": len(frames),
        "renderedFrameCount": rendered_frame_count,
        "interpolation": interpolation,
        "interpolationApplied": interpolation_applied,
        "easing": easing,
        "loopTransition": loop_transition,
        "presentationFps": presentation_fps,
        "samplesPerTransition": samples_per_transition,
        "sourceFrameDurationMs": source_frame_duration_ms,
        "outputFrameDurationMs": output_frame_duration_ms,
        "dimensionsMatch": dimensions_match,
        "reviewOnly": True,
        "sourceMastersModified": False,
    }


def create_sequence_animation_preview_frames(
    frames: list[Image.Image],
    preview: dict[str, Any],
    evidence: dict[str, Any],
) -> tuple[list[Image.Image], bool]:
    if not evidence["interpolationApplied"]:
        return frames, False
    samples = int(evidence["samplesPerTransition"])
    loop_transition = bool(evidence["loopTransition"])
    easing = str(evidence["easing"])
    transition_count = len(frames) if loop_transition else len(frames) - 1
    output: list[Image.Image] = []
    try:
        for index in range(transition_count):
            current = frames[index]
            following = frames[(index + 1) % len(frames)]
            for sample in range(samples):
                amount = sample / samples
                if easing == "smoothstep":
                    amount = amount * amount * (3 - 2 * amount)
                output.append(
                    current.copy()
                    if amount == 0
                    else Image.blend(current, following, amount)
                )
        if not loop_transition:
            output.append(frames[-1].copy())
        if len(output) != int(evidence["renderedFrameCount"]):
            fail(
                "sequence-review animation preview frame count disagrees with the "
                "hash-bound plan"
            )
        return output, True
    except Exception:
        for frame in output:
            frame.close()
        raise


def output_record(staging_root: Path, target: Path, image: Image.Image | None = None, *, role: str = "image") -> dict[str, Any]:
    digest, size = sha256_file(target)
    record: dict[str, Any] = {
        "path": target.relative_to(staging_root).as_posix(),
        "sha256": digest,
        "bytes": size,
        "role": role,
    }
    if image is not None:
        record.update(
            {
                "dimensions": {"width": image.width, "height": image.height},
                "alpha": alpha_statistics(image),
                "alphaBoundingBox": alpha_bbox(image),
                "pixelSha256": image_pixel_sha256(image),
            }
        )
    return record


def difference_fraction(left: Image.Image, right: Image.Image) -> float:
    if left.size != right.size:
        return 1.0
    difference = ImageChops.difference(left, right)
    try:
        changed = sum(1 for pixel in pixel_data(difference) if any(pixel))
        return changed / max(1, left.width * left.height)
    finally:
        difference.close()


def contact_sheet_dimensions(frames: list[Image.Image], columns: int) -> tuple[int, int]:
    columns = max(1, min(columns, len(frames)))
    rows = math.ceil(len(frames) / columns)
    cell_width = max(frame.width for frame in frames)
    cell_height = max(frame.height for frame in frames)
    return columns * cell_width, rows * (cell_height + REVIEW_LABEL_HEIGHT)


def create_contact_sheet(
    frames: list[Image.Image],
    columns: int,
    maximum_pixels: int,
) -> Image.Image:
    width, height = contact_sheet_dimensions(frames, columns)
    require_pixel_budget(width, height, "sequence-review contact sheet", maximum_pixels)
    columns = max(1, min(columns, len(frames)))
    cell_width = max(frame.width for frame in frames)
    cell_height = max(frame.height for frame in frames)
    sheet = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    draw = ImageDraw.Draw(sheet)
    for index, frame in enumerate(frames):
        column = index % columns
        row = index // columns
        x = column * cell_width + (cell_width - frame.width) // 2
        y = row * (cell_height + REVIEW_LABEL_HEIGHT)
        sheet.alpha_composite(frame, (x, y))
        draw.text((column * cell_width + 4, y + cell_height + 2), f"{index:04d}", fill=(255, 255, 255, 255))
    return sheet


def governed_review_thresholds(task: dict[str, Any]) -> tuple[str, dict[str, float]]:
    profile = task.get("consistencyProfile", "off")
    defaults = {
        "off": {
            "maximumCentroidShiftPixels": 1_000_000,
            "maximumAlphaBoundsWidthChangeFraction": 1_000,
            "maximumAlphaBoundsHeightChangeFraction": 1_000,
            "maximumVisibleMeanColourDistance": 441.672956,
            "maximumAlphaMassChangeFraction": 1_000,
            "minimumCentroidAlignedAlphaIoU": 0,
        },
        "motion-family": {
            "maximumCentroidShiftPixels": 96,
            "maximumAlphaBoundsWidthChangeFraction": 0.75,
            "maximumAlphaBoundsHeightChangeFraction": 0.75,
            "maximumVisibleMeanColourDistance": 64,
            "maximumAlphaMassChangeFraction": 1.25,
            "minimumCentroidAlignedAlphaIoU": 0.1,
        },
        "identity-locked": {
            "maximumCentroidShiftPixels": 48,
            "maximumAlphaBoundsWidthChangeFraction": 0.35,
            "maximumAlphaBoundsHeightChangeFraction": 0.35,
            "maximumVisibleMeanColourDistance": 36,
            "maximumAlphaMassChangeFraction": 0.55,
            "minimumCentroidAlignedAlphaIoU": 0.3,
        },
    }
    if not isinstance(profile, str) or profile not in defaults:
        fail("sequence-review consistencyProfile must be off, motion-family or identity-locked")
    raw = task.get("thresholds", {})
    if not isinstance(raw, dict):
        fail("sequence-review thresholds must be an object")
    limits = {
        "minimumChangedFraction": (0, 1, 0.0001),
        "maximumChangedFraction": (0, 1, 1),
        "maximumCentroidShiftPixels": (0, 1_000_000, defaults[profile]["maximumCentroidShiftPixels"]),
        "maximumAlphaBoundsWidthChangeFraction": (0, 1_000, defaults[profile]["maximumAlphaBoundsWidthChangeFraction"]),
        "maximumAlphaBoundsHeightChangeFraction": (0, 1_000, defaults[profile]["maximumAlphaBoundsHeightChangeFraction"]),
        "maximumVisibleMeanColourDistance": (0, 441.672956, defaults[profile]["maximumVisibleMeanColourDistance"]),
        "maximumAlphaMassChangeFraction": (0, 1_000, defaults[profile]["maximumAlphaMassChangeFraction"]),
        "minimumCentroidAlignedAlphaIoU": (0, 1, defaults[profile]["minimumCentroidAlignedAlphaIoU"]),
    }
    unknown = set(raw) - set(limits)
    if unknown:
        fail(f"sequence-review thresholds contain unsupported fields: {', '.join(sorted(unknown))}")
    thresholds = {
        key: governed_number(raw.get(key, fallback), f"sequence-review.thresholds.{key}", minimum, maximum)
        for key, (minimum, maximum, fallback) in limits.items()
    }
    if thresholds["minimumChangedFraction"] > thresholds["maximumChangedFraction"]:
        fail("sequence-review minimumChangedFraction cannot exceed maximumChangedFraction")
    return profile, thresholds


def write_json_create_only(context: "RuntimeContext", target: Path, value: Any) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    context.preflight_output(target, len(payload), f"JSON output {target}")
    with target.open("xb") as handle:
        handle.write(payload)
    context.register_output(target, f"JSON output {target}")


class RuntimeContext:
    def __init__(self, workspace: Path, staging: Path, plan: dict[str, Any]):
        self.workspace = workspace
        self.staging = staging
        self.plan = plan
        self.source_paths: dict[str, Path] = {}
        self.task_results: dict[str, dict[str, Any]] = {}
        self.task_output_paths: dict[str, list[Path]] = {}
        self.output_paths: set[Path] = set()
        self.output_files = 0
        self.output_bytes = 0
        self.total_source_bytes = 0
        self.maximum_tasks = bounded_plan_limit(
            plan,
            "maximumTasks",
            MAXIMUM_TASKS,
            MAXIMUM_TASKS,
        )
        self.maximum_external_sources = bounded_plan_limit(
            plan,
            "maximumExternalSources",
            MAXIMUM_EXTERNAL_SOURCES,
            MAXIMUM_EXTERNAL_SOURCES,
        )
        self.maximum_source_bytes = bounded_plan_limit(
            plan,
            "maximumSourceBytes",
            MAXIMUM_SOURCE_BYTES,
            MAXIMUM_SOURCE_BYTES,
        )
        self.maximum_total_source_bytes = bounded_plan_limit(
            plan,
            "maximumTotalSourceBytes",
            MAXIMUM_TOTAL_SOURCE_BYTES,
            MAXIMUM_TOTAL_SOURCE_BYTES,
        )
        self.maximum_decoded_pixels = bounded_plan_limit(
            plan,
            "maximumDecodedPixels",
            MAXIMUM_PIXELS,
            MAXIMUM_PIXELS,
        )
        self.maximum_output_files = bounded_plan_limit(
            plan,
            "maximumOutputFiles",
            MAXIMUM_OUTPUT_FILES,
            MAXIMUM_OUTPUT_FILES,
        )
        self.maximum_output_bytes = bounded_plan_limit(
            plan,
            "maximumOutputBytes",
            MAXIMUM_OUTPUT_BYTES,
            MAXIMUM_OUTPUT_BYTES,
        )
        self.maximum_total_output_bytes = bounded_plan_limit(
            plan,
            "maximumTotalOutputBytes",
            MAXIMUM_TOTAL_OUTPUT_BYTES,
            MAXIMUM_TOTAL_OUTPUT_BYTES,
        )
        raw_sources = plan.get("externalSources")
        if not isinstance(raw_sources, list) or len(raw_sources) > self.maximum_external_sources:
            fail("plan externalSources exceed the runtime source-count boundary")
        self.sources: dict[str, dict[str, Any]] = {}
        for index, source in enumerate(raw_sources):
            if not isinstance(source, dict):
                fail(f"externalSources[{index}] must be an object")
            source_id = source.get("sourceId")
            if not isinstance(source_id, str) or not source_id:
                fail(f"externalSources[{index}].sourceId is invalid")
            if source_id in self.sources:
                fail(f"duplicate external source id: {source_id}")
            declared_bytes = source.get("bytes")
            if (
                isinstance(declared_bytes, bool)
                or not isinstance(declared_bytes, int)
                or declared_bytes < 0
                or declared_bytes > self.maximum_source_bytes
            ):
                fail(f"externalSources[{index}].bytes is outside the runtime boundary")
            self.sources[source_id] = source

        limits = plan.get("limits", {})
        if not isinstance(limits, dict):
            fail("plan limits must be an object")
        bound_external_source_bytes = limits.get("boundExternalSourceBytes")
        if (
            isinstance(bound_external_source_bytes, bool)
            or not isinstance(bound_external_source_bytes, int)
            or bound_external_source_bytes < 0
            or bound_external_source_bytes > self.maximum_total_source_bytes
        ):
            fail(
                "PROJECT_ART_SANDBOX_SOURCE_BYTES_LIMIT: "
                "plan boundExternalSourceBytes is outside the runtime boundary"
            )
        self.bound_external_source_bytes = bound_external_source_bytes

        planned_output_files = limits.get("plannedMaximumOutputFiles")
        if (
            isinstance(planned_output_files, bool)
            or not isinstance(planned_output_files, int)
            or planned_output_files < 1
            or planned_output_files > self.maximum_output_files
        ):
            fail(
                "PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT: "
                "plan plannedMaximumOutputFiles is outside the runtime boundary"
            )
        self.planned_output_files = planned_output_files

    def verify_sources(self) -> None:
        resolved_sources: list[tuple[str, dict[str, Any], Path, int]] = []
        total_bytes = 0
        for source_id, source in self.sources.items():
            value = secure_existing_file(self.workspace, source["path"], f"source {source_id}")
            size = value.stat().st_size
            if size != source["bytes"] or size > self.maximum_source_bytes:
                fail(f"source identity changed: {source['path']}")
            total_bytes += size
            if total_bytes > self.maximum_total_source_bytes:
                fail(
                    "PROJECT_ART_SANDBOX_SOURCE_BYTES_LIMIT: "
                    f"sources exceed the {self.maximum_total_source_bytes}-byte aggregate boundary"
                )
            resolved_sources.append((source_id, source, value, size))

        for source_id, source, value, size in resolved_sources:
            digest, observed_size = sha256_file(value, self.maximum_source_bytes)
            if digest != source["sha256"] or observed_size != size:
                fail(f"source identity changed: {source['path']}")
            self.source_paths[source_id] = value
        if total_bytes != self.bound_external_source_bytes:
            fail(
                "PROJECT_ART_SANDBOX_SOURCE_BYTES_LIMIT: "
                "boundExternalSourceBytes does not match the verified source set"
            )
        self.total_source_bytes = total_bytes

    def preflight_output_count(self, additional_files: int, label: str) -> None:
        if isinstance(additional_files, bool) or not isinstance(additional_files, int) or additional_files < 0:
            fail(f"{label} output count is invalid")
        if self.output_files + additional_files > self.maximum_output_files:
            fail(
                "PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT: "
                f"{label} exceeds the {self.maximum_output_files}-file publication boundary"
            )

    def preflight_output(self, target: Path, estimated_bytes: int, label: str) -> None:
        self.preflight_output_count(1, label)
        if target in self.output_paths or target.exists():
            fail(f"duplicate or existing output path: {target}")
        if isinstance(estimated_bytes, bool) or not isinstance(estimated_bytes, int) or estimated_bytes < 0:
            fail(f"{label} byte estimate is invalid")
        if estimated_bytes > self.maximum_output_bytes:
            fail(
                "PROJECT_ART_SANDBOX_OUTPUT_BYTES_LIMIT: "
                f"{label} exceeds the {self.maximum_output_bytes}-byte per-file boundary"
            )
        if self.output_bytes + estimated_bytes > self.maximum_total_output_bytes:
            fail(
                "PROJECT_ART_SANDBOX_TOTAL_OUTPUT_BYTES_LIMIT: "
                f"{label} exceeds the {self.maximum_total_output_bytes}-byte aggregate output boundary"
            )

    def register_output(self, target: Path, label: str) -> None:
        if target in self.output_paths:
            fail(f"duplicate output registration: {target}")
        size = target.stat().st_size
        if size > self.maximum_output_bytes:
            fail(
                "PROJECT_ART_SANDBOX_OUTPUT_BYTES_LIMIT: "
                f"{label} exceeds the {self.maximum_output_bytes}-byte per-file boundary"
            )
        if self.output_bytes + size > self.maximum_total_output_bytes:
            fail(
                "PROJECT_ART_SANDBOX_TOTAL_OUTPUT_BYTES_LIMIT: "
                f"{label} exceeds the {self.maximum_total_output_bytes}-byte aggregate output boundary"
            )
        self.output_paths.add(target)
        self.output_files += 1
        self.output_bytes += size

    def resolve_source_path(self, descriptor: dict[str, Any]) -> Path:
        if descriptor["kind"] == "external":
            source_id = descriptor["sourceId"]
            if source_id not in self.source_paths:
                fail(f"unknown external source id: {source_id}")
            return self.source_paths[source_id]
        if descriptor["kind"] == "task-output":
            task_id = descriptor["taskId"]
            outputs = self.task_output_paths.get(task_id)
            if not outputs:
                fail(f"task output is unavailable: {task_id}")
            index = int(descriptor.get("outputIndex", 0))
            if index < 0 or index >= len(outputs):
                fail(f"task output index is out of range: {task_id}[{index}]")
            return outputs[index]
        fail("invalid source descriptor entered runtime")

    def remember(self, task_id: str, result: dict[str, Any], output_paths: list[Path]) -> None:
        if task_id in self.task_results:
            fail(f"duplicate task result: {task_id}")
        self.task_results[task_id] = result
        self.task_output_paths[task_id] = output_paths


def maximum_slice_output_frames(context: RuntimeContext, task: dict[str, Any]) -> int:
    if task.get("count") is not None:
        return int(task["count"])
    source = task["source"]
    if source.get("kind") == "external":
        source_path = context.resolve_source_path(source)
        width, height = image_dimensions(
            source_path,
            context.maximum_decoded_pixels,
            f"slice-sheet task {task['id']} source",
        )
        margin = int(task["margin"])
        spacing = int(task["spacing"])
        columns = (width - margin * 2 + spacing) // (int(task["frameWidth"]) + spacing)
        rows = (height - margin * 2 + spacing) // (int(task["frameHeight"]) + spacing)
        if columns < 1 or rows < 1:
            fail(f"slice-sheet task {task['id']} has no complete cells")
        return columns * rows
    frame_pixels = int(task["frameWidth"]) * int(task["frameHeight"])
    return context.maximum_decoded_pixels // frame_pixels


def maximum_task_output_files(context: RuntimeContext, task: dict[str, Any]) -> int:
    kind = task.get("kind")
    if kind == "slice-sheet":
        return maximum_slice_output_frames(context, task) + 1
    if kind == "sequence-review":
        preview = task["preview"]
        return (
            1
            + (1 if preview["contactSheet"] else 0)
            + (1 if preview["animatedGif"] else 0)
            + (max(0, len(task["sources"]) - 1) if preview["onionSkins"] else 0)
        )
    if kind == "image-compare":
        preview = task["preview"]
        return 1 + (1 if preview["difference"] else 0) + (1 if preview["overlay"] else 0)
    if kind == "image-master":
        return 2
    if kind == "video-frame-extract":
        return len(task["timestampsMs"]) + 1
    if kind == "motion-sequence":
        return int(task["frameCount"]) + 1 + (1 if task["preview"]["animatedGif"] else 0)
    return 1


def maximum_plan_output_files(context: RuntimeContext, tasks: list[dict[str, Any]]) -> int:
    total = 1  # create-only sandbox receipt
    for task in tasks:
        total += maximum_task_output_files(context, task)
        if total > context.maximum_output_files:
            fail(
                "PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT: "
                f"plan exceeds the {context.maximum_output_files}-file publication boundary; "
                "provide an explicit slice count or split the request"
            )
    return total


def execute_video_frame_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_descriptor = task.get("source")
    if (
        not isinstance(source_descriptor, dict)
        or source_descriptor.get("kind") != "external"
        or not isinstance(source_descriptor.get("sourceId"), str)
    ):
        fail(f"video-frame-extract task {task.get('id')} source must be a bound external video")
    source_record = context.sources.get(source_descriptor["sourceId"])
    if not isinstance(source_record, dict) or source_record.get("mediaKind") != "video":
        fail(f"video-frame-extract task {task.get('id')} source is not bound as video")
    source_path = context.resolve_source_path(source_descriptor)
    if source_path.suffix.lower() not in {".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi"}:
        fail(f"video-frame-extract task {task.get('id')} source extension is not supported")
    expected_width_value = task.get("expectedWidth")
    expected_height_value = task.get("expectedHeight")
    if (
        isinstance(expected_width_value, bool)
        or not isinstance(expected_width_value, int)
        or isinstance(expected_height_value, bool)
        or not isinstance(expected_height_value, int)
    ):
        fail(f"video-frame-extract task {task.get('id')} expected dimensions are invalid")
    expected_width, expected_height = require_pixel_budget(
        expected_width_value,
        expected_height_value,
        f"video-frame-extract task {task['id']} expected frame",
        context.maximum_decoded_pixels,
    )
    require_active_pixel_budget(
        [expected_width * expected_height * 2],
        f"video-frame-extract task {task['id']} working set",
        context.maximum_decoded_pixels,
    )
    timestamps_ms = task.get("timestampsMs")
    if (
        not isinstance(timestamps_ms, list)
        or not 1 <= len(timestamps_ms) <= MAXIMUM_VIDEO_FRAME_TIMESTAMPS
        or any(
            isinstance(value, bool)
            or not isinstance(value, int)
            or value < 0
            or value > MAXIMUM_VIDEO_TIMESTAMP_MS
            for value in timestamps_ms
        )
        or any(value <= timestamps_ms[index - 1] for index, value in enumerate(timestamps_ms) if index > 0)
    ):
        fail(f"video-frame-extract task {task['id']} timestampsMs are invalid")
    start_index = task.get("startIndex", 0)
    if isinstance(start_index, bool) or not isinstance(start_index, int) or not 0 <= start_index <= 1_000_000:
        fail(f"video-frame-extract task {task['id']} startIndex is invalid")
    file_name_pattern = task.get("fileNamePattern")
    if (
        not isinstance(file_name_pattern, str)
        or not 1 <= len(file_name_pattern) <= 512
        or "{index}" not in file_name_pattern
        or "/" in file_name_pattern
        or "\\" in file_name_pattern
        or "\x00" in file_name_pattern
        or not file_name_pattern.endswith(".png")
    ):
        fail(f"video-frame-extract task {task['id']} fileNamePattern is invalid")
    if not isinstance(task.get("preserveSourceAlpha", True), bool):
        fail(f"video-frame-extract task {task['id']} preserveSourceAlpha must be boolean")
    context.preflight_output_count(len(timestamps_ms) + 1, f"video-frame-extract task {task['id']}")
    ffmpeg_path, ffmpeg_identity = _media_tool_identity("ffmpeg")
    ffprobe_path, ffprobe_identity = _media_tool_identity("ffprobe")
    probe = _probe_video(source_path, ffprobe_path)
    if probe["width"] != expected_width or probe["height"] != expected_height:
        fail(
            f"video-frame-extract task {task['id']} source dimensions changed: "
            f"expected {expected_width}x{expected_height}, observed {probe['width']}x{probe['height']}"
        )
    if probe["durationMs"] is not None and timestamps_ms[-1] >= int(probe["durationMs"]):
        fail(
            f"video-frame-extract task {task['id']} timestamp {timestamps_ms[-1]}ms "
            f"is outside the {probe['durationMs']}ms source duration"
        )

    directory = target_path(
        context.staging,
        task["targetDirectory"],
        f"task {task['id']} targetDirectory",
    )
    directory.mkdir(parents=True, exist_ok=False)
    output_records: list[dict[str, Any]] = []
    output_paths: list[Path] = []
    frame_records: list[dict[str, Any]] = []
    preserve_source_alpha = task.get("preserveSourceAlpha", True)
    for offset, timestamp_ms in enumerate(timestamps_ms):
        output_index = start_index + offset
        file_name = (
            file_name_pattern
            .replace("{index}", f"{output_index:04d}")
            .replace("{timestampMs}", str(timestamp_ms))
        )
        if "/" in file_name or "\\" in file_name or not file_name.endswith(".png"):
            fail(f"video-frame-extract task {task['id']} produced an unsafe file name")
        target = directory / file_name
        context.preflight_output(
            target,
            expected_width * expected_height * 5 + OUTPUT_ENCODING_OVERHEAD_BYTES,
            f"video-frame-extract task {task['id']} frame {offset}",
        )
        _controlled_media_tool(
            ffmpeg_path,
            [
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-n",
                "-protocol_whitelist",
                "file",
                "-noautorotate",
                "-threads",
                "1",
                "-i",
                str(source_path),
                "-ss",
                f"{timestamp_ms / 1000:.3f}",
                "-map",
                "0:v:0",
                "-frames:v",
                "1",
                "-an",
                "-sn",
                "-dn",
                "-threads",
                "1",
                "-pix_fmt",
                "rgba" if preserve_source_alpha else "rgb24",
                "-f",
                "image2",
                "-vcodec",
                "png",
                "-compression_level",
                "9",
                "-pred",
                "mixed",
                str(target),
            ],
            f"video-frame-extract task {task['id']} frame {offset}",
        )
        if not target.is_file() or target.is_symlink():
            fail(f"video-frame-extract task {task['id']} did not create a regular PNG frame")
        frame = load_image(
            target,
            context.maximum_decoded_pixels,
            f"video-frame-extract task {task['id']} frame {offset}",
        )
        try:
            if frame.size != (expected_width, expected_height):
                fail(
                    f"video-frame-extract task {task['id']} decoded frame dimensions changed: "
                    f"expected {expected_width}x{expected_height}, observed {frame.width}x{frame.height}"
                )
            context.register_output(target, f"video-frame-extract task {task['id']} frame {offset}")
            output = output_record(context.staging, target, frame, role="video-reference-frame")
            admission = inspect_transparency(
                frame,
                "preferred",
                encoded_has_alpha=bool(frame.info.get(SOURCE_ENCODED_ALPHA_INFO)),
            )
            output_records.append(output)
            output_paths.append(target)
            frame_records.append(
                {
                    "frameIndex": offset,
                    "outputIndex": output_index,
                    "timestampMs": timestamp_ms,
                    "output": output,
                    "transparencyInspection": admission,
                    "deliveryAdmissionPerformed": False,
                }
            )
        finally:
            frame.close()

    _revalidate_media_tool(ffmpeg_path, ffmpeg_identity)
    _revalidate_media_tool(ffprobe_path, ffprobe_identity)
    source = context.sources[task["source"]["sourceId"]]
    manifest = with_document_hash(
        {
            "schema": VIDEO_FRAME_MANIFEST_SCHEMA,
            "taskId": task["id"],
            "source": {
                "sourceId": source["sourceId"],
                "path": source["path"],
                "sha256": source["sha256"],
                "bytes": source["bytes"],
                "mediaType": source["mediaType"],
            },
            "probe": probe,
            "tools": {"ffmpeg": ffmpeg_identity, "ffprobe": ffprobe_identity},
            "selection": {
                "mode": "requested-timestamps-ms",
                "frameSemantics": "first-decodable-frame-at-or-after-requested-time",
                "timestampsMs": timestamps_ms,
                "sourceAutorotationApplied": False,
                "preserveSourceAlpha": preserve_source_alpha,
            },
            "frames": frame_records,
            "authority": {
                "creativeApproval": False,
                "deliveryAdmission": False,
                "providerExecution": False,
                "targetRepositoryMutation": False,
                "publication": False,
            },
        }
    )
    manifest_path = directory / "video-frames.json"
    write_json_create_only(context, manifest_path, manifest)
    output_records.append(output_record(context.staging, manifest_path, role="video-frame-manifest"))
    output_paths.append(manifest_path)
    context.remember(
        task["id"],
        {
            "taskId": task["id"],
            "kind": task["kind"],
            "status": "passed",
            "frameCount": len(frame_records),
            "outputs": output_records,
        },
        output_paths,
    )


def execute_image_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_path = context.resolve_source_path(task["source"])
    image = load_image(
        source_path,
        context.maximum_decoded_pixels,
        f"task {task['id']} source",
    )
    try:
        before = {
            "dimensions": {"width": image.width, "height": image.height},
            "alpha": alpha_statistics(image),
            "alphaBoundingBox": alpha_bbox(image),
            "pixelSha256": image_pixel_sha256(image),
        }
        operation_evidence = []
        for operation in task["operations"]:
            operation_before = image_pixel_sha256(image)
            next_image = apply_operation(
                image,
                operation,
                context.maximum_decoded_pixels,
            )
            require_pixel_budget(
                next_image.width,
                next_image.height,
                f"task {task['id']} operation {operation['op']}",
                context.maximum_decoded_pixels,
            )
            if next_image is not image:
                image.close()
                image = next_image
            operation_evidence.append(
                {
                    "op": operation["op"],
                    "beforePixelSha256": operation_before,
                    "afterPixelSha256": image_pixel_sha256(image),
                    "dimensions": {"width": image.width, "height": image.height},
                }
            )
        expected = task.get("expected") or {}
        if expected.get("width") is not None and image.width != int(expected["width"]):
            fail(f"task {task['id']} did not satisfy expected width")
        if expected.get("height") is not None and image.height != int(expected["height"]):
            fail(f"task {task['id']} did not satisfy expected height")
        alpha = alpha_statistics(image)
        transparency = None
        if expected.get("meaningfulAlpha") is True:
            transparency = transparency_admission(
                image,
                f"task {task['id']} output",
                "preferred",
            )
            if alpha["transparentPixels"] + alpha["partialPixels"] == 0:
                fail(f"task {task['id']} requires meaningful alpha")
        target = target_path(context.staging, task["targetPath"], f"task {task['id']} target")
        save_image(context, image, target, task["outputFormat"])
        output = output_record(context.staging, target, image)
        context.remember(
            task["id"],
            {
                "taskId": task["id"],
                "kind": task["kind"],
                "status": "passed",
                "source": str(source_path),
                "before": before,
                "operations": operation_evidence,
                "transparencyAdmission": transparency,
                "outputs": [output],
            },
            [target],
        )
    finally:
        image.close()


def execute_slice_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_path = context.resolve_source_path(task["source"])
    image = load_image(
        source_path,
        context.maximum_decoded_pixels,
        f"task {task['id']} source",
    )
    source_transparency = transparency_admission(
        image,
        f"slice-sheet task {task['id']} source",
        str(task.get("alphaPolicy", "required")),
        use_source_encoding=True,
    )
    frame_width, frame_height = require_pixel_budget(
        int(task["frameWidth"]),
        int(task["frameHeight"]),
        f"task {task['id']} frame",
        context.maximum_decoded_pixels,
    )
    margin = int(task["margin"])
    spacing = int(task["spacing"])
    usable_width = image.width - margin * 2
    usable_height = image.height - margin * 2
    columns = (usable_width + spacing) // (frame_width + spacing)
    rows = (usable_height + spacing) // (frame_height + spacing)
    if columns < 1 or rows < 1:
        fail(f"slice-sheet task {task['id']} has no complete cells")
    available = columns * rows
    count = int(task.get("count", available))
    if count > available:
        fail(f"slice-sheet task {task['id']} requests {count} frames but only {available} fit")
    context.preflight_output_count(count + 1, f"slice-sheet task {task['id']}")
    directory = target_path(context.staging, task["targetDirectory"], f"task {task['id']} targetDirectory")
    directory.mkdir(parents=True, exist_ok=False)
    outputs: list[dict[str, Any]] = []
    output_paths: list[Path] = []
    frame_manifest = []
    for offset in range(count):
        column = offset % columns
        row = offset // columns
        left = margin + column * (frame_width + spacing)
        top = margin + row * (frame_height + spacing)
        frame = image.crop((left, top, left + frame_width, top + frame_height))
        bbox = alpha_bbox(frame)
        if bbox is None and task.get("rejectBlankFrames", True):
            fail(f"slice-sheet task {task['id']} produced blank frame {offset}")
        frame_transparency = transparency_admission(
            frame,
            f"slice-sheet task {task['id']} frame {offset}",
            str(task.get("alphaPolicy", "required")),
        )
        index = int(task["startIndex"]) + offset
        file_name = task["fileNamePattern"].replace("{index}", f"{index:04d}")
        target = directory / file_name
        save_image(context, frame, target, "png")
        record = output_record(context.staging, target, frame, role="sprite-frame")
        outputs.append(record)
        output_paths.append(target)
        frame_manifest.append(
            {
                "sequenceIndex": offset,
                "frameIndex": index,
                "column": column,
                "row": row,
                "sourceRectangle": {"x": left, "y": top, "width": frame_width, "height": frame_height},
                "transparencyAdmission": frame_transparency,
                "output": record,
            }
        )
        frame.close()
    manifest_path = directory / "frames.json"
    write_json_create_only(
        context,
        manifest_path,
        {
            "schema": "evavo.project-art-sliced-sheet.v1",
            "taskId": task["id"],
            "source": str(source_path),
            "sheet": {"width": image.width, "height": image.height, "columns": columns, "rows": rows},
            "alphaPolicy": task.get("alphaPolicy", "required"),
            "sourceTransparencyAdmission": source_transparency,
            "frames": frame_manifest,
        },
    )
    outputs.append(output_record(context.staging, manifest_path, role="manifest"))
    context.remember(
        task["id"],
        {
            "taskId": task["id"],
            "kind": task["kind"],
            "status": "passed",
            "source": str(source_path),
            "frameCount": count,
            "columns": columns,
            "rows": rows,
            "alphaPolicy": task.get("alphaPolicy", "required"),
            "sourceTransparencyAdmission": source_transparency,
            "outputs": outputs,
        },
        output_paths,
    )
    image.close()


def fitted_cell(
    image: Image.Image,
    width: int,
    height: int,
    fit: str,
    sample: str,
    maximum_pixels: int,
) -> Image.Image:
    require_pixel_budget(width, height, "assemble-sheet cell", maximum_pixels)
    if fit == "strict":
        if image.size != (width, height):
            fail(f"strict sheet cell expected {width}x{height}, received {image.width}x{image.height}")
        return image
    operation = {
        "width": width,
        "height": height,
        "fit": fit,
        "sampling": sample,
        "background": "#00000000",
    }
    return resized_canvas(
        image,
        operation,
        pixel=sample == "nearest",
        maximum_pixels=maximum_pixels,
    )


def execute_assemble_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_paths = [context.resolve_source_path(source) for source in task["sources"]]
    dimensions = [
        image_dimensions(
            value,
            context.maximum_decoded_pixels,
            f"assemble-sheet task {task['id']} source {index}",
        )
        for index, value in enumerate(source_paths)
    ]
    if not dimensions:
        fail(f"assemble-sheet task {task['id']} has no sources")
    cell = task.get("cell")
    if cell:
        cell_width = int(cell["width"])
        cell_height = int(cell["height"])
        fit = cell["fit"]
        sample = cell["sampling"]
    else:
        cell_width, cell_height = dimensions[0]
        fit, sample = "strict", "nearest"
    require_pixel_budget(
        cell_width,
        cell_height,
        f"assemble-sheet task {task['id']} cell",
        context.maximum_decoded_pixels,
    )
    if fit == "strict":
        for index, observed in enumerate(dimensions):
            if observed != (cell_width, cell_height):
                fail(
                    f"assemble-sheet task {task['id']} source {index} has dimensions "
                    f"{observed[0]}x{observed[1]}, expected {cell_width}x{cell_height}"
                )
    columns = int(task["columns"])
    rows = math.ceil(len(source_paths) / columns)
    padding = int(task["padding"])
    width, height = require_pixel_budget(
        padding * 2 + columns * cell_width,
        padding * 2 + rows * cell_height,
        f"assemble-sheet task {task['id']} output",
        context.maximum_decoded_pixels,
    )
    maximum_source_pixels = max(source_width * source_height for source_width, source_height in dimensions)
    prepared_pixels = 0 if fit == "strict" else cell_width * cell_height * 2
    require_active_pixel_budget(
        [width * height, maximum_source_pixels, prepared_pixels],
        f"assemble-sheet task {task['id']} working set",
        context.maximum_decoded_pixels,
    )
    alpha_policy = str(task.get("alphaPolicy", "required"))
    sheet = Image.new("RGBA", (width, height), parse_colour(task["background"], "assemble-sheet.background"))
    source_transparency: list[dict[str, Any]] = []
    try:
        for index, source_path in enumerate(source_paths):
            frame = load_image(
                source_path,
                context.maximum_decoded_pixels,
                f"assemble-sheet task {task['id']} source {index}",
            )
            prepared = frame
            try:
                source_transparency.append(
                    transparency_admission(
                        frame,
                        f"assemble-sheet task {task['id']} source {index}",
                        alpha_policy,
                        use_source_encoding=True,
                    )
                )
                prepared = fitted_cell(
                    frame,
                    cell_width,
                    cell_height,
                    fit,
                    sample,
                    context.maximum_decoded_pixels,
                )
                x = padding + (index % columns) * cell_width
                y = padding + (index // columns) * cell_height
                sheet.alpha_composite(prepared, (x, y))
            finally:
                if prepared is not frame:
                    prepared.close()
                frame.close()
        sheet_transparency = transparency_admission(
            sheet,
            f"assemble-sheet task {task['id']} output",
            alpha_policy,
        )
        target = target_path(context.staging, task["targetPath"], f"task {task['id']} target")
        save_image(context, sheet, target, "png")
        context.remember(
            task["id"],
            {
                "taskId": task["id"],
                "kind": task["kind"],
                "status": "passed",
                "sourceCount": len(source_paths),
                "columns": columns,
                "rows": rows,
                "cell": {"width": cell_width, "height": cell_height, "fit": fit, "sampling": sample},
                "alphaPolicy": alpha_policy,
                "sourceTransparencyAdmissions": source_transparency,
                "outputTransparencyAdmission": sheet_transparency,
                "outputs": [output_record(context.staging, target, sheet, role="sprite-sheet")],
            },
            [target],
        )
    finally:
        sheet.close()


def execute_review_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    consistency_profile, thresholds = governed_review_thresholds(task)
    source_paths = [context.resolve_source_path(source) for source in task["sources"]]
    dimensions, source_pixels, maximum_frame_pixels = preflight_image_set(
        source_paths,
        context.maximum_decoded_pixels,
        f"sequence-review task {task['id']}",
    )
    preview = task["preview"]
    transition_pixels = max(
        (
            width * height
            for (width, height), next_size in zip(dimensions, dimensions[1:])
            if (width, height) == next_size
        ),
        default=0,
    )
    if transition_pixels:
        require_active_pixel_budget(
            [source_pixels, transition_pixels],
            f"sequence-review task {task['id']} transition working set",
            context.maximum_decoded_pixels,
        )
    if preview["contactSheet"]:
        columns = max(1, min(int(preview["columns"]), len(dimensions)))
        rows = math.ceil(len(dimensions) / columns)
        cell_width = max(width for width, _ in dimensions)
        cell_height = max(height for _, height in dimensions)
        sheet_width, sheet_height = require_pixel_budget(
            columns * cell_width,
            rows * (cell_height + REVIEW_LABEL_HEIGHT),
            f"sequence-review task {task['id']} contact sheet",
            context.maximum_decoded_pixels,
        )
        require_active_pixel_budget(
            [source_pixels, sheet_width * sheet_height * 2],
            f"sequence-review task {task['id']} contact-sheet working set",
            context.maximum_decoded_pixels,
        )
    if preview["animatedGif"]:
        rendered_frame_count = int(preview.get("renderedFrameCount", len(dimensions)))
        interpolation = str(preview.get("interpolation", "none"))
        require_active_pixel_budget(
            (
                [source_pixels, maximum_frame_pixels * 2]
                if interpolation == "none"
                else [
                    source_pixels,
                    maximum_frame_pixels * rendered_frame_count,
                    maximum_frame_pixels,
                ]
            ),
            f"sequence-review task {task['id']} animation-preview working set",
            context.maximum_decoded_pixels,
        )
    if preview["onionSkins"] and len(dimensions) > 1:
        require_active_pixel_budget(
            [source_pixels, maximum_frame_pixels * 5],
            f"sequence-review task {task['id']} onion-skin working set",
            context.maximum_decoded_pixels,
        )

    frames = [
        load_image(
            value,
            context.maximum_decoded_pixels,
            f"sequence-review task {task['id']} source {index}",
        )
        for index, value in enumerate(source_paths)
    ]
    try:
        target_directory = target_path(context.staging, task["targetDirectory"], f"task {task['id']} targetDirectory")
        target_directory.mkdir(parents=True, exist_ok=False)
        issues: list[dict[str, Any]] = []
        frame_records = []
        expected_width = task.get("expectedWidth")
        expected_height = task.get("expectedHeight")
        first_size = frames[0].size
        for index, (source_path, frame) in enumerate(zip(source_paths, frames)):
            alpha = alpha_statistics(frame)
            admission = inspect_transparency(
                frame,
                str(task.get("alphaPolicy", "required" if task.get("requireAlpha", False) else "preferred")),
                encoded_has_alpha=bool(frame.info.get(SOURCE_ENCODED_ALPHA_INFO)),
            )
            bbox = alpha_bbox(frame)
            centroid = alpha_centroid(frame)
            bounds_size = None if bbox is None else {
                "width": bbox[2] - bbox[0],
                "height": bbox[3] - bbox[1],
            }
            mass_fraction = alpha_mass_fraction(frame)
            mean_rgb = visible_mean_rgb(frame)
            if expected_width is not None and frame.width != int(expected_width):
                issues.append({"code": "width-mismatch", "frameIndex": index, "expected": expected_width, "actual": frame.width})
            if expected_height is not None and frame.height != int(expected_height):
                issues.append({"code": "height-mismatch", "frameIndex": index, "expected": expected_height, "actual": frame.height})
            if frame.size != first_size:
                issues.append({"code": "sequence-dimension-drift", "frameIndex": index, "expected": list(first_size), "actual": list(frame.size)})
            for blocker in admission["blockers"]:
                issues.append(
                    {
                        "code": "transparency-admission-failed",
                        "frameIndex": index,
                        "blocker": blocker,
                    }
                )
            if bbox is None and task.get("rejectBlankFrames", True):
                issues.append({"code": "blank-frame", "frameIndex": index})
            frame_records.append(
                {
                    "frameIndex": index,
                    "source": str(source_path),
                    "pixelSha256": image_pixel_sha256(frame),
                    "dimensions": {"width": frame.width, "height": frame.height},
                    "alpha": alpha,
                    "transparencyAdmission": admission,
                    "alphaBoundingBox": bbox,
                    "alphaBoundsSize": bounds_size,
                    "alphaCentroid": centroid,
                    "alphaMassFraction": mass_fraction,
                    "visibleMeanRgb": mean_rgb,
                }
            )
        transitions = []
        for index in range(1, len(frames)):
            changed = difference_fraction(frames[index - 1], frames[index])
            previous_centroid = frame_records[index - 1]["alphaCentroid"]
            current_centroid = frame_records[index]["alphaCentroid"]
            shift = None
            if previous_centroid and current_centroid:
                shift = math.dist(
                    (previous_centroid["x"], previous_centroid["y"]),
                    (current_centroid["x"], current_centroid["y"]),
                )
            previous_bounds = frame_records[index - 1]["alphaBoundsSize"]
            current_bounds = frame_records[index]["alphaBoundsSize"]
            bounds_width_change = None
            bounds_height_change = None
            if previous_bounds and current_bounds:
                bounds_width_change = abs(current_bounds["width"] - previous_bounds["width"]) / max(1, previous_bounds["width"])
                bounds_height_change = abs(current_bounds["height"] - previous_bounds["height"]) / max(1, previous_bounds["height"])
            previous_mass = float(frame_records[index - 1]["alphaMassFraction"])
            current_mass = float(frame_records[index]["alphaMassFraction"])
            mass_change = abs(current_mass - previous_mass) / max(1 / 255, previous_mass)
            previous_colour = frame_records[index - 1]["visibleMeanRgb"]
            current_colour = frame_records[index]["visibleMeanRgb"]
            colour_distance = None
            if previous_colour and current_colour:
                colour_distance = math.dist(
                    (previous_colour["red"], previous_colour["green"], previous_colour["blue"]),
                    (current_colour["red"], current_colour["green"], current_colour["blue"]),
                )
            aligned_iou = centroid_aligned_alpha_iou(
                frames[index - 1],
                frames[index],
                previous_centroid,
                current_centroid,
            )
            transition = {
                "fromFrameIndex": index - 1,
                "toFrameIndex": index,
                "changedPixelFraction": changed,
                "alphaCentroidShiftPixels": shift,
                "alphaBoundsWidthChangeFraction": bounds_width_change,
                "alphaBoundsHeightChangeFraction": bounds_height_change,
                "alphaMassChangeFraction": mass_change,
                "visibleMeanColourDistance": colour_distance,
                "centroidAlignedAlphaIoU": aligned_iou,
            }
            transitions.append(transition)
            if task.get("rejectIdenticalAdjacentFrames", True) and changed == 0:
                issues.append({"code": "identical-adjacent-frames", "fromFrameIndex": index - 1, "toFrameIndex": index})
            if changed < float(thresholds["minimumChangedFraction"]):
                issues.append({"code": "insufficient-frame-change", **transition})
            if changed > float(thresholds["maximumChangedFraction"]):
                issues.append({"code": "excessive-frame-change", **transition})
            if shift is not None and shift > float(thresholds["maximumCentroidShiftPixels"]):
                issues.append({"code": "centroid-shift-exceeded", **transition})
            if bounds_width_change is not None and bounds_width_change > float(thresholds["maximumAlphaBoundsWidthChangeFraction"]):
                issues.append({"code": "alpha-bounds-width-drift", **transition})
            if bounds_height_change is not None and bounds_height_change > float(thresholds["maximumAlphaBoundsHeightChangeFraction"]):
                issues.append({"code": "alpha-bounds-height-drift", **transition})
            if mass_change > float(thresholds["maximumAlphaMassChangeFraction"]):
                issues.append({"code": "alpha-mass-drift", **transition})
            if colour_distance is not None and colour_distance > float(thresholds["maximumVisibleMeanColourDistance"]):
                issues.append({"code": "visible-colour-drift", **transition})
            if aligned_iou is not None and aligned_iou < float(thresholds["minimumCentroidAlignedAlphaIoU"]):
                issues.append({"code": "centroid-aligned-silhouette-drift", **transition})
        animation_preview = sequence_animation_preview_evidence(frames, preview)
        if (
            animation_preview["enabled"]
            and animation_preview["interpolation"] == "crossfade"
            and not animation_preview["dimensionsMatch"]
        ):
            issues.append(
                {
                    "code": "animation-preview-interpolation-dimension-mismatch",
                    "message": "Crossfade preview requires equal frame dimensions.",
                }
            )
        manifest = {
            "schema": "evavo.project-art-sequence-review.v1",
            "taskId": task["id"],
            "status": "passed" if not issues else "blocked",
            "consistencyProfile": consistency_profile,
            "thresholds": thresholds,
            "frames": frame_records,
            "transitions": transitions,
            "animationPreview": animation_preview,
            "issues": issues,
            "creativeApprovalPerformed": False,
            "runtimeApprovalPerformed": False,
        }
        manifest_path = target_directory / "sequence-review.json"
        write_json_create_only(context, manifest_path, manifest)
        outputs = [output_record(context.staging, manifest_path, role="review-manifest")]
        output_paths = [manifest_path]
        if preview["contactSheet"]:
            sheet = create_contact_sheet(
                frames,
                int(preview["columns"]),
                context.maximum_decoded_pixels,
            )
            try:
                value = target_directory / "contact-sheet.png"
                save_image(context, sheet, value, "png")
                outputs.append(output_record(context.staging, value, sheet, role="review-contact-sheet"))
                output_paths.append(value)
            finally:
                sheet.close()
        if preview["animatedGif"]:
            value = target_directory / "animation-preview.gif"
            animation_frames, owns_animation_frames = create_sequence_animation_preview_frames(
                frames,
                preview,
                animation_preview,
            )
            try:
                save_animation(
                    context,
                    animation_frames,
                    value,
                    int(animation_preview["outputFrameDurationMs"]),
                )
                outputs.append(output_record(context.staging, value, role="review-animation"))
                output_paths.append(value)
            finally:
                if owns_animation_frames:
                    for animation_frame in animation_frames:
                        animation_frame.close()
        if preview["onionSkins"] and len(frames) > 1:
            onion_directory = target_directory / "onion-skins"
            onion_directory.mkdir(parents=True, exist_ok=False)
            for index in range(1, len(frames)):
                previous = frames[index - 1]
                current = frames[index]
                red = Image.new("RGBA", previous.size, (255, 0, 0, 0))
                cyan = Image.new("RGBA", current.size, (0, 255, 255, 0))
                onion = Image.new("RGBA", previous.size, (0, 0, 0, 255))
                try:
                    red.putalpha(previous.getchannel("A").point(lambda value: round(value * 0.45)))
                    cyan.putalpha(current.getchannel("A").point(lambda value: round(value * 0.55)))
                    onion.alpha_composite(red)
                    onion.alpha_composite(cyan)
                    value = onion_directory / f"{index - 1:04d}-{index:04d}.png"
                    save_image(context, onion, value, "png")
                    outputs.append(output_record(context.staging, value, onion, role="review-onion-skin"))
                    output_paths.append(value)
                finally:
                    red.close()
                    cyan.close()
                    onion.close()
        context.remember(
            task["id"],
            {
                "taskId": task["id"],
                "kind": task["kind"],
                "status": manifest["status"],
                "frameCount": len(frames),
                "issueCount": len(issues),
                "outputs": outputs,
            },
            output_paths,
        )
    finally:
        for frame in frames:
            frame.close()



def _resample(name: str) -> int:
    if name == "nearest":
        return Image.Resampling.NEAREST
    if name == "bicubic":
        return Image.Resampling.BICUBIC
    if name == "lanczos":
        return Image.Resampling.LANCZOS
    fail(f"unsupported sampling mode: {name}")


def _apply_layer_mask(image: Image.Image, mask_image: Image.Image | None, layer: dict[str, Any]) -> Image.Image:
    result = image.convert("RGBA")
    alpha = result.getchannel("A")
    if mask_image is not None:
        mask = mask_image.convert("RGBA")
        try:
            if mask.size != result.size:
                resized_mask = mask.resize(result.size, _resample(layer.get("sampling", "nearest")))
                mask.close()
                mask = resized_mask
            if layer.get("maskChannel", "alpha") == "alpha":
                mask_channel = mask.getchannel("A")
            else:
                mask_rgb = mask.convert("RGB")
                try:
                    mask_channel = ImageOps.grayscale(mask_rgb)
                finally:
                    mask_rgb.close()
            try:
                if layer.get("invertMask") is True:
                    inverted = ImageOps.invert(mask_channel)
                    mask_channel.close()
                    mask_channel = inverted
                multiplied = ImageChops.multiply(alpha, mask_channel)
                alpha.close()
                alpha = multiplied
            finally:
                mask_channel.close()
        finally:
            mask.close()
    opacity = float(layer.get("opacity", 1.0))
    if opacity < 1.0:
        adjusted = alpha.point(lambda value: round(value * opacity))
        alpha.close()
        alpha = adjusted
    result.putalpha(alpha)
    alpha.close()
    return result


def _validated_composite_rect(
    rect: Any,
    image_width: int,
    image_height: int,
    label: str,
) -> tuple[int, int, int, int]:
    if not isinstance(rect, dict):
        fail(f"{label} must be an object")
    values = tuple(rect.get(key) for key in ("x", "y", "width", "height"))
    if any(isinstance(value, bool) or not isinstance(value, int) for value in values):
        fail(f"{label} must contain integer x, y, width and height")
    x, y, width, height = values
    if x < 0 or y < 0 or width < 1 or height < 1 or x + width > image_width or y + height > image_height:
        fail(f"{label} escaped its source image")
    return x, y, width, height


def _crop_composite_source(
    image: Image.Image,
    rect: dict[str, Any] | None,
    label: str,
) -> Image.Image:
    if rect is None:
        return image
    x, y, width, height = _validated_composite_rect(rect, image.width, image.height, label)
    cropped = image.crop((x, y, x + width, y + height))
    image.close()
    return cropped


def _blend_overlap(base: Image.Image, layer: Image.Image, mode: str) -> Image.Image:
    normal = Image.alpha_composite(base, layer)
    if mode == "normal":
        return normal
    base_rgb = base.convert("RGB")
    layer_rgb = layer.convert("RGB")
    try:
        if mode == "multiply":
            blended_rgb = ImageChops.multiply(base_rgb, layer_rgb)
        elif mode == "screen":
            blended_rgb = ImageChops.screen(base_rgb, layer_rgb)
        elif mode == "add":
            blended_rgb = ImageChops.add(base_rgb, layer_rgb, scale=1.0, offset=0)
        elif mode == "subtract":
            blended_rgb = ImageChops.subtract(base_rgb, layer_rgb, scale=1.0, offset=0)
        elif mode == "darken":
            blended_rgb = ImageChops.darker(base_rgb, layer_rgb)
        elif mode == "lighten":
            blended_rgb = ImageChops.lighter(base_rgb, layer_rgb)
        else:
            normal.close()
            fail(f"unsupported composite blend mode: {mode}")
        try:
            normal_alpha = normal.getchannel("A")
            channels = blended_rgb.split()
            try:
                candidate = Image.merge("RGBA", (*channels, normal_alpha))
            finally:
                for channel in channels:
                    channel.close()
                normal_alpha.close()
            base_alpha = base.getchannel("A")
            layer_alpha = layer.getchannel("A")
            try:
                overlap = ImageChops.multiply(base_alpha, layer_alpha)
            finally:
                base_alpha.close()
                layer_alpha.close()
            try:
                return Image.composite(candidate, normal, overlap)
            finally:
                candidate.close()
                overlap.close()
                normal.close()
        finally:
            blended_rgb.close()
    finally:
        base_rgb.close()
        layer_rgb.close()


def execute_composite_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_paths = [context.resolve_source_path(source) for source in task["sources"]]
    canvas_spec = task["canvas"]
    canvas_width, canvas_height = require_pixel_budget(
        int(canvas_spec["width"]),
        int(canvas_spec["height"]),
        "image-composite canvas",
        context.maximum_decoded_pixels,
    )
    canvas_pixels = canvas_width * canvas_height
    canvas = Image.new(
        "RGBA",
        (canvas_width, canvas_height),
        parse_colour(canvas_spec.get("background", "#00000000"), "image-composite.canvas.background"),
    )
    applied_layers: list[dict[str, Any]] = []
    try:
        for index, layer in enumerate(task["layers"]):
            source_index = int(layer["sourceIndex"])
            if source_index < 0 or source_index >= len(source_paths):
                fail(f"image-composite layer {index} sourceIndex escaped the source list")
            source_width, source_height = image_dimensions(
                source_paths[source_index],
                context.maximum_decoded_pixels,
                f"image-composite task {task['id']} layer {index} source",
            )
            source_rect = layer.get("sourceRect")
            if source_rect is not None:
                _, _, source_rect_width, source_rect_height = _validated_composite_rect(
                    source_rect,
                    source_width,
                    source_height,
                    f"image-composite layer {index} sourceRect",
                )
            else:
                source_rect_width = source_width
                source_rect_height = source_height
            layer_width = int(layer.get("width", source_rect_width))
            layer_height = int(layer.get("height", source_rect_height))
            require_pixel_budget(
                layer_width,
                layer_height,
                f"image-composite task {task['id']} layer {index}",
                context.maximum_decoded_pixels,
            )
            mask_pixels = 0
            mask_index = layer.get("maskSourceIndex")
            if mask_index is None and layer.get("maskSourceRect") is not None:
                fail(f"image-composite layer {index} maskSourceRect requires maskSourceIndex")
            if mask_index is not None:
                mask_index = int(mask_index)
                if mask_index < 0 or mask_index >= len(source_paths):
                    fail(f"image-composite layer {index} maskSourceIndex escaped the source list")
                mask_width, mask_height = image_dimensions(
                    source_paths[mask_index],
                    context.maximum_decoded_pixels,
                    f"image-composite task {task['id']} layer {index} mask",
                )
                mask_pixels = mask_width * mask_height
                mask_rect = layer.get("maskSourceRect")
                if mask_rect is not None:
                    _validated_composite_rect(
                        mask_rect,
                        mask_width,
                        mask_height,
                        f"image-composite layer {index} maskSourceRect",
                    )
            blend_mode = layer.get("blendMode", "normal")
            canvas_multiplier = 3 if blend_mode == "normal" else 9
            layer_multiplier = 8 if mask_index is not None else 6
            require_active_pixel_budget(
                [
                    canvas_pixels * canvas_multiplier,
                    source_width * source_height,
                    layer_width * layer_height * (layer_multiplier - 1),
                    mask_pixels,
                ],
                f"image-composite task {task['id']} layer {index} working set",
                context.maximum_decoded_pixels,
            )

            image = load_image(
                source_paths[source_index],
                context.maximum_decoded_pixels,
                f"image-composite task {task['id']} layer {index} source",
            )
            mask_image = None
            prepared = None
            layer_canvas = None
            try:
                image = _crop_composite_source(
                    image,
                    source_rect,
                    f"image-composite task {task['id']} layer {index} sourceRect",
                )
                if layer.get("width") is not None:
                    resized = image.resize(
                        (layer_width, layer_height),
                        _resample(layer.get("sampling", "nearest")),
                    )
                    image.close()
                    image = resized
                if mask_index is not None:
                    mask_image = load_image(
                        source_paths[mask_index],
                        context.maximum_decoded_pixels,
                        f"image-composite task {task['id']} layer {index} mask",
                    )
                    mask_image = _crop_composite_source(
                        mask_image,
                        layer.get("maskSourceRect"),
                        f"image-composite task {task['id']} layer {index} maskSourceRect",
                    )
                prepared = _apply_layer_mask(image, mask_image, layer)
                layer_canvas = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
                layer_canvas.alpha_composite(prepared, dest=(int(layer.get("x", 0)), int(layer.get("y", 0))))
                next_canvas = _blend_overlap(canvas, layer_canvas, blend_mode)
                canvas.close()
                canvas = next_canvas
                applied_layers.append({
                    "index": index,
                    "sourceIndex": source_index,
                    "maskSourceIndex": layer.get("maskSourceIndex"),
                    "x": int(layer.get("x", 0)),
                    "y": int(layer.get("y", 0)),
                    "opacity": layer.get("opacity", 1),
                    "blendMode": blend_mode,
                    "sourceRect": source_rect,
                    "maskSourceRect": layer.get("maskSourceRect"),
                    "width": prepared.width,
                    "height": prepared.height,
                })
            finally:
                if layer_canvas is not None:
                    layer_canvas.close()
                if prepared is not None:
                    prepared.close()
                if mask_image is not None:
                    mask_image.close()
                image.close()
        target = target_path(context.staging, task["targetPath"], f"task {task['id']} targetPath")
        save_image(context, canvas, target, task["outputFormat"])
        output = output_record(context.staging, target, canvas, role="composite-image")
        context.remember(task["id"], {
            "taskId": task["id"],
            "kind": task["kind"],
            "status": "passed",
            "layerCount": len(applied_layers),
            "layers": applied_layers,
            "outputs": [output],
        }, [target])
    finally:
        canvas.close()


def image_compare_metrics(
    left: Image.Image,
    right: Image.Image,
    difference: Image.Image | None = None,
) -> dict[str, Any]:
    if left.size != right.size:
        return {
            "sameDimensions": False,
            "changedPixelFraction": 1.0,
            "meanAbsoluteChannelDelta": 255.0,
            "maximumChannelDelta": 255,
            "alphaChangedPixelFraction": 1.0,
        }
    owns_difference = difference is None
    if difference is None:
        difference = ImageChops.difference(left, right)
    try:
        changed = 0
        alpha_changed = 0
        total_delta = 0
        maximum_delta = 0
        for values in pixel_data(difference):
            if any(values):
                changed += 1
            if values[3]:
                alpha_changed += 1
            total_delta += sum(values)
            maximum_delta = max(maximum_delta, *values)
        pixels = max(1, left.width * left.height)
        return {
            "sameDimensions": True,
            "changedPixelFraction": changed / pixels,
            "meanAbsoluteChannelDelta": total_delta / (pixels * 4),
            "maximumChannelDelta": maximum_delta,
            "alphaChangedPixelFraction": alpha_changed / pixels,
        }
    finally:
        if owns_difference:
            difference.close()


def execute_compare_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_paths = [context.resolve_source_path(source) for source in task["sources"]]
    if len(source_paths) != 2:
        fail(f"image-compare task {task['id']} requires exactly two sources")
    dimensions, source_pixels, _ = preflight_image_set(
        source_paths,
        context.maximum_decoded_pixels,
        f"image-compare task {task['id']}",
    )
    same_dimensions = dimensions[0] == dimensions[1]
    if same_dimensions:
        require_active_pixel_budget(
            [source_pixels, dimensions[0][0] * dimensions[0][1] * 2],
            f"image-compare task {task['id']} working set",
            context.maximum_decoded_pixels,
        )
    left = load_image(
        source_paths[0],
        context.maximum_decoded_pixels,
        f"image-compare task {task['id']} left source",
    )
    right = load_image(
        source_paths[1],
        context.maximum_decoded_pixels,
        f"image-compare task {task['id']} right source",
    )
    difference = ImageChops.difference(left, right) if same_dimensions else None
    try:
        metrics = image_compare_metrics(left, right, difference)
        thresholds = task["thresholds"]
        issues: list[dict[str, Any]] = []
        if task.get("requireSameDimensions", True) and not metrics["sameDimensions"]:
            issues.append({"code": "dimensions-mismatch", "left": list(left.size), "right": list(right.size)})
        if metrics["changedPixelFraction"] > float(thresholds["maximumChangedFraction"]):
            issues.append({"code": "changed-fraction-exceeded", "observed": metrics["changedPixelFraction"], "maximum": thresholds["maximumChangedFraction"]})
        if metrics["meanAbsoluteChannelDelta"] > float(thresholds["maximumMeanChannelDelta"]):
            issues.append({"code": "mean-channel-delta-exceeded", "observed": metrics["meanAbsoluteChannelDelta"], "maximum": thresholds["maximumMeanChannelDelta"]})
        if metrics["alphaChangedPixelFraction"] > float(thresholds["maximumAlphaChangedFraction"]):
            issues.append({"code": "alpha-change-exceeded", "observed": metrics["alphaChangedPixelFraction"], "maximum": thresholds["maximumAlphaChangedFraction"]})
        target_directory = target_path(context.staging, task["targetDirectory"], f"task {task['id']} targetDirectory")
        target_directory.mkdir(parents=True, exist_ok=False)
        manifest = {
            "schema": "evavo.project-art-image-comparison.v1",
            "taskId": task["id"],
            "status": "passed" if not issues else "blocked",
            "sources": [str(value) for value in source_paths],
            "left": {"dimensions": {"width": left.width, "height": left.height}, "pixelSha256": image_pixel_sha256(left)},
            "right": {"dimensions": {"width": right.width, "height": right.height}, "pixelSha256": image_pixel_sha256(right)},
            "metrics": metrics,
            "thresholds": thresholds,
            "issues": issues,
            "creativeApprovalPerformed": False,
            "identityApprovalPerformed": False,
        }
        manifest_path = target_directory / "comparison.json"
        write_json_create_only(context, manifest_path, manifest)
        outputs = [output_record(context.staging, manifest_path, role="comparison-manifest")]
        output_paths = [manifest_path]
        if task["preview"]["difference"] and difference is not None:
            difference_path = target_directory / "difference.png"
            save_image(context, difference, difference_path, "png")
            outputs.append(output_record(context.staging, difference_path, difference, role="comparison-difference"))
            output_paths.append(difference_path)
        if difference is not None:
            difference.close()
            difference = None
        if task["preview"]["overlay"] and same_dimensions:
            overlay = Image.blend(left, right, 0.5)
            try:
                overlay_path = target_directory / "overlay.png"
                save_image(context, overlay, overlay_path, "png")
                outputs.append(output_record(context.staging, overlay_path, overlay, role="comparison-overlay"))
                output_paths.append(overlay_path)
            finally:
                overlay.close()
        context.remember(task["id"], {
            "taskId": task["id"],
            "kind": task["kind"],
            "status": manifest["status"],
            "issueCount": len(issues),
            "metrics": metrics,
            "outputs": outputs,
        }, output_paths)
    finally:
        if difference is not None:
            difference.close()
        left.close()
        right.close()



MASTERING_REPORT_SCHEMA = "evavo.project-art-mastering-report.v1"
MOTION_MANIFEST_SCHEMA = "evavo.project-art-motion-sequence.v1"


def _mastering_metrics(image: Image.Image, profile: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    total = image.width * image.height
    transparent = 0
    partial = 0
    opaque = 0
    transparent_rgb = 0
    visible = 0
    shadow = 0
    highlight = 0
    minimum_luminance = 255.0
    maximum_luminance = 0.0
    matte = parse_colour(profile.get("edgeMatteColour", "#ffffff"), "image-master.profile.edgeMatteColour", allow_alpha=False)[:3]
    matte_distance = float(profile.get("maximumEdgeMatteDistance", 16))
    matte_edges = 0
    partial_edges = 0
    maximum_colours = int(profile.get("maximumUniqueColours", 1_000_000))
    colours: set[tuple[int, int, int, int]] = set()
    colours_overflow = False
    shadow_threshold = int(profile.get("shadowThreshold", 0))
    highlight_threshold = int(profile.get("highlightThreshold", 255))

    for pixel in pixel_data(image):
        red, green, blue, alpha = pixel
        if not colours_overflow:
            colours.add((red, green, blue, alpha))
            if len(colours) > maximum_colours:
                colours_overflow = True
                colours.clear()
        if alpha == 0:
            transparent += 1
            if red or green or blue:
                transparent_rgb += 1
            continue
        visible += 1
        if alpha == 255:
            opaque += 1
        else:
            partial += 1
            partial_edges += 1
            if colour_distance((red, green, blue), matte) <= matte_distance:
                matte_edges += 1
        luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        minimum_luminance = min(minimum_luminance, luminance)
        maximum_luminance = max(maximum_luminance, luminance)
        if luminance <= shadow_threshold:
            shadow += 1
        if luminance >= highlight_threshold:
            highlight += 1

    bbox = alpha_bbox(image)
    alpha_mode = profile.get("alphaMode", "preserve")
    issues: list[str] = []
    if profile.get("exactWidth") is not None and (
        image.width != int(profile["exactWidth"]) or image.height != int(profile["exactHeight"])
    ):
        issues.append("mastering-dimensions-mismatch")
    if alpha_mode == "required" and transparent + partial == 0:
        issues.append("mastering-alpha-required")
    if alpha_mode == "forbidden" and transparent + partial > 0:
        issues.append("mastering-alpha-forbidden")
    transparent_rgb_fraction = transparent_rgb / max(1, transparent)
    semi_transparent_fraction = partial / max(1, total)
    opaque_fraction = opaque / max(1, total)
    shadow_fraction = shadow / max(1, visible)
    highlight_fraction = highlight / max(1, visible)
    edge_matte_fraction = matte_edges / max(1, partial_edges)
    luminance_span = (maximum_luminance - minimum_luminance) if visible else 0.0
    if transparent_rgb_fraction > float(profile.get("maximumTransparentRgbFraction", 1)):
        issues.append("mastering-hidden-rgb-contamination")
    if semi_transparent_fraction > float(profile.get("maximumSemiTransparentFraction", 1)):
        issues.append("mastering-semitransparent-fraction-exceeded")
    if opaque_fraction < float(profile.get("minimumOpaqueFraction", 0)):
        issues.append("mastering-opaque-fraction-below-minimum")
    if colours_overflow:
        issues.append("mastering-unique-colour-limit-exceeded")
    if shadow_fraction > float(profile.get("maximumShadowClippingFraction", 1)):
        issues.append("mastering-shadow-clipping-exceeded")
    if highlight_fraction > float(profile.get("maximumHighlightClippingFraction", 1)):
        issues.append("mastering-highlight-clipping-exceeded")
    if luminance_span < float(profile.get("minimumLuminanceSpan", 0)):
        issues.append("mastering-luminance-span-below-minimum")
    if edge_matte_fraction > float(profile.get("maximumEdgeMatteFraction", 1)):
        issues.append("mastering-edge-matte-fraction-exceeded")
    expected_bbox = profile.get("expectedAlphaBounds")
    if expected_bbox is not None:
        if bbox is None:
            issues.append("mastering-alpha-bounds-missing")
        else:
            observed = [bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1]]
            expected = [
                int(expected_bbox["x"]),
                int(expected_bbox["y"]),
                int(expected_bbox["width"]),
                int(expected_bbox["height"]),
            ]
            tolerance = int(expected_bbox.get("tolerance", 0))
            if any(abs(observed[index] - expected[index]) > tolerance for index in range(4)):
                issues.append("mastering-alpha-bounds-mismatch")
    if visible == 0:
        issues.append("mastering-blank-image")

    metrics = {
        "dimensions": {"width": image.width, "height": image.height},
        "totalPixels": total,
        "visiblePixels": visible,
        "transparentPixels": transparent,
        "semiTransparentPixels": partial,
        "opaquePixels": opaque,
        "transparentRgbPixels": transparent_rgb,
        "transparentRgbFraction": transparent_rgb_fraction,
        "semiTransparentFraction": semi_transparent_fraction,
        "opaqueFraction": opaque_fraction,
        "alphaBoundingBox": bbox,
        "uniqueColourCount": None if colours_overflow else len(colours),
        "uniqueColourCountAtLeast": maximum_colours + 1 if colours_overflow else len(colours),
        "shadowClippingFraction": shadow_fraction,
        "highlightClippingFraction": highlight_fraction,
        "minimumVisibleLuminance": minimum_luminance if visible else None,
        "maximumVisibleLuminance": maximum_luminance if visible else None,
        "visibleLuminanceSpan": luminance_span,
        "edgeMattePixelCount": matte_edges,
        "partialEdgePixelCount": partial_edges,
        "edgeMatteFraction": edge_matte_fraction,
        "pixelSha256": image_pixel_sha256(image),
    }
    return metrics, issues


def _run_operation_pipeline(
    image: Image.Image,
    operations: list[dict[str, Any]],
    task_id: str,
    maximum_pixels: int,
) -> tuple[Image.Image, list[dict[str, Any]]]:
    evidence: list[dict[str, Any]] = []
    current = image
    for operation in operations:
        before_hash = image_pixel_sha256(current)
        next_image = apply_operation(current, operation, maximum_pixels)
        require_pixel_budget(next_image.width, next_image.height, f"task {task_id} operation {operation['op']}", maximum_pixels)
        if next_image is not current:
            current.close()
            current = next_image
        evidence.append(
            {
                "op": operation["op"],
                "beforePixelSha256": before_hash,
                "afterPixelSha256": image_pixel_sha256(current),
                "dimensions": {"width": current.width, "height": current.height},
            }
        )
    return current, evidence


def execute_master_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_path = context.resolve_source_path(task["source"])
    image = load_image(source_path, context.maximum_decoded_pixels, f"image-master task {task['id']} source")
    try:
        before = {
            "dimensions": {"width": image.width, "height": image.height},
            "alpha": alpha_statistics(image),
            "alphaBoundingBox": alpha_bbox(image),
            "pixelSha256": image_pixel_sha256(image),
        }
        image, operation_evidence = _run_operation_pipeline(
            image,
            task.get("operations", []),
            task["id"],
            context.maximum_decoded_pixels,
        )
        metrics, issues = _mastering_metrics(image, task["profile"])
        if issues and task["profile"].get("enforce", True):
            fail("PROJECT_ART_MASTERING_PROFILE_FAILED: " + ", ".join(issues))
        target = target_path(context.staging, task["targetPath"], f"task {task['id']} targetPath")
        report_path = target_path(context.staging, task["reportPath"], f"task {task['id']} reportPath")
        context.preflight_output_count(2, f"image-master task {task['id']}")
        save_image(context, image, target, task["outputFormat"])
        image_output = output_record(context.staging, target, image, role="mastered-image")
        report = with_document_hash(
            {
                "schema": MASTERING_REPORT_SCHEMA,
                "taskId": task["id"],
                "profile": task["profile"],
                "status": "passed" if not issues else "blocked",
                "issues": issues,
                "source": {
                    "path": str(source_path),
                    "sha256": sha256_file(source_path, context.maximum_source_bytes)[0],
                },
                "before": before,
                "operations": operation_evidence,
                "metrics": metrics,
                "output": image_output,
                "authority": {
                    "creativeApproval": False,
                    "candidatePromotion": False,
                    "storageWrite": False,
                    "targetRepositoryMutation": False,
                    "publication": False,
                },
            }
        )
        write_json_create_only(context, report_path, report)
        report_output = output_record(context.staging, report_path, role="mastering-report")
        context.remember(
            task["id"],
            {
                "taskId": task["id"],
                "kind": task["kind"],
                "status": "passed" if not issues else "blocked",
                "issues": issues,
                "profile": task["profile"]["name"],
                "outputs": [image_output, report_output],
            },
            [target, report_path],
        )
    finally:
        image.close()


def _eased_amount(amount: float, easing: str) -> float:
    amount = max(0.0, min(1.0, amount))
    if easing == "hold":
        return 0.0
    if easing == "ease-in":
        return amount * amount
    if easing == "ease-out":
        return 1.0 - (1.0 - amount) * (1.0 - amount)
    if easing == "ease-in-out":
        return 2 * amount * amount if amount < 0.5 else 1 - ((-2 * amount + 2) ** 2) / 2
    return amount


def _motion_state(keyframes: list[dict[str, Any]], position: float) -> dict[str, float]:
    if position <= float(keyframes[0]["frame"]):
        return {key: float(keyframes[0][key]) for key in ("x", "y", "scaleX", "scaleY", "rotation", "opacity")}
    if position >= float(keyframes[-1]["frame"]):
        return {key: float(keyframes[-1][key]) for key in ("x", "y", "scaleX", "scaleY", "rotation", "opacity")}
    left = keyframes[0]
    right = keyframes[-1]
    for index in range(len(keyframes) - 1):
        if float(keyframes[index]["frame"]) <= position <= float(keyframes[index + 1]["frame"]):
            left = keyframes[index]
            right = keyframes[index + 1]
            break
    span = float(right["frame"]) - float(left["frame"])
    amount = _eased_amount(0.0 if span <= 0 else (position - float(left["frame"])) / span, str(left.get("easing", "linear")))
    return {
        key: float(left[key]) + (float(right[key]) - float(left[key])) * amount
        for key in ("x", "y", "scaleX", "scaleY", "rotation", "opacity")
    }


def _prepared_motion_layer(
    context: RuntimeContext,
    task: dict[str, Any],
    source_paths: list[Path],
    layer: dict[str, Any],
    layer_index: int,
    position: float,
) -> tuple[Image.Image, dict[str, Any]]:
    state = _motion_state(layer["keyframes"], position)
    source_index = int(layer["sourceIndex"])
    image = load_image(
        source_paths[source_index],
        context.maximum_decoded_pixels,
        f"motion task {task['id']} layer {layer_index} source",
    )
    mask_image: Image.Image | None = None
    prepared: Image.Image | None = None
    try:
        mask_index = layer.get("maskSourceIndex")
        if mask_index is not None:
            mask_image = load_image(
                source_paths[int(mask_index)],
                context.maximum_decoded_pixels,
                f"motion task {task['id']} layer {layer_index} mask",
            )
        prepared = _apply_layer_mask(
            image,
            mask_image,
            {
                **layer,
                "opacity": state["opacity"],
            },
        )
        width = max(1, round(prepared.width * state["scaleX"]))
        height = max(1, round(prepared.height * state["scaleY"]))
        require_pixel_budget(width, height, f"motion task {task['id']} layer {layer_index} scaled image", context.maximum_decoded_pixels)
        if prepared.size != (width, height):
            resized = prepared.resize((width, height), _resample(layer.get("sampling", "bicubic")))
            prepared.close()
            prepared = resized
        if abs(state["rotation"] % 360) > 1e-9:
            rotated = prepared.rotate(
                state["rotation"],
                resample=_resample(layer.get("sampling", "bicubic")),
                expand=True,
                fillcolor=(0, 0, 0, 0),
            )
            prepared.close()
            prepared = rotated
            require_pixel_budget(prepared.width, prepared.height, f"motion task {task['id']} layer {layer_index} rotated image", context.maximum_decoded_pixels)
        anchor = layer["anchor"]
        destination = (
            round(state["x"] - prepared.width * float(anchor["x"])),
            round(state["y"] - prepared.height * float(anchor["y"])),
        )
        evidence = {
            "layerIndex": layer_index,
            "sourceIndex": source_index,
            "position": position,
            "state": state,
            "destination": {"x": destination[0], "y": destination[1]},
            "dimensions": {"width": prepared.width, "height": prepared.height},
            "blendMode": layer.get("blendMode", "normal"),
            "pixelSha256": image_pixel_sha256(prepared),
        }
        return prepared, {**evidence, "destinationTuple": destination}
    except Exception:
        if prepared is not None:
            prepared.close()
        raise
    finally:
        if mask_image is not None:
            mask_image.close()
        image.close()


def _render_motion_frame(
    context: RuntimeContext,
    task: dict[str, Any],
    source_paths: list[Path],
    position: float,
) -> tuple[Image.Image, list[dict[str, Any]]]:
    canvas = Image.new(
        "RGBA",
        (int(task["canvas"]["width"]), int(task["canvas"]["height"])),
        parse_colour(task["canvas"].get("background", "#00000000"), "motion-sequence.canvas.background"),
    )
    evidence: list[dict[str, Any]] = []
    try:
        for layer_index, layer in enumerate(task["layers"]):
            prepared, layer_evidence = _prepared_motion_layer(context, task, source_paths, layer, layer_index, position)
            layer_canvas = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            try:
                destination = layer_evidence.pop("destinationTuple")
                layer_canvas.alpha_composite(prepared, destination)
                next_canvas = _blend_overlap(canvas, layer_canvas, layer.get("blendMode", "normal"))
                canvas.close()
                canvas = next_canvas
                evidence.append(layer_evidence)
            finally:
                layer_canvas.close()
                prepared.close()
        return canvas, evidence
    except Exception:
        canvas.close()
        raise


def _render_motion_with_blur(
    context: RuntimeContext,
    task: dict[str, Any],
    source_paths: list[Path],
    frame_index: int,
) -> tuple[Image.Image, list[dict[str, Any]]]:
    samples = int(task["motionBlur"]["samples"])
    shutter = float(task["motionBlur"]["shutterFraction"])
    accumulator: Image.Image | None = None
    centre_evidence: list[dict[str, Any]] = []
    for sample_index in range(samples):
        offset = 0.0 if samples == 1 else ((sample_index / (samples - 1)) - 0.5) * shutter
        position = max(0.0, min(float(task["frameCount"] - 1), frame_index + offset))
        rendered, evidence = _render_motion_frame(context, task, source_paths, position)
        if sample_index == samples // 2:
            centre_evidence = evidence
        if accumulator is None:
            accumulator = rendered
        else:
            blended = Image.blend(accumulator, rendered, 1.0 / (sample_index + 1))
            accumulator.close()
            rendered.close()
            accumulator = blended
    if accumulator is None:
        fail("motion sequence did not render a frame")
    return accumulator, centre_evidence


def execute_motion_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_paths = [context.resolve_source_path(source) for source in task["sources"]]
    output_count = int(task["frameCount"]) + 1 + (1 if task["preview"]["animatedGif"] else 0)
    context.preflight_output_count(output_count, f"motion-sequence task {task['id']}")
    directory = target_path(context.staging, task["targetDirectory"], f"task {task['id']} targetDirectory")
    directory.mkdir(parents=True, exist_ok=False)
    output_records: list[dict[str, Any]] = []
    output_paths: list[Path] = []
    frame_documents: list[dict[str, Any]] = []
    gif_frames: list[Image.Image] = []
    try:
        for frame_offset in range(int(task["frameCount"])):
            frame, layer_evidence = _render_motion_with_blur(context, task, source_paths, frame_offset)
            try:
                frame_index = int(task["startIndex"]) + frame_offset
                file_name = task["fileNamePattern"].replace("{index}", f"{frame_index:04d}")
                target = directory / file_name
                save_image(context, frame, target, "png")
                record = output_record(context.staging, target, frame, role="motion-frame")
                output_records.append(record)
                output_paths.append(target)
                frame_documents.append(
                    {
                        "sequenceIndex": frame_offset,
                        "frameIndex": frame_index,
                        "timeSeconds": frame_offset / float(task["fps"]),
                        "layers": layer_evidence,
                        "output": record,
                    }
                )
                if task["preview"]["animatedGif"]:
                    gif_frames.append(frame.copy())
            finally:
                frame.close()
        manifest_path = directory / task["manifestName"]
        manifest = with_document_hash(
            {
                "schema": MOTION_MANIFEST_SCHEMA,
                "taskId": task["id"],
                "frameCount": int(task["frameCount"]),
                "fps": float(task["fps"]),
                "canvas": task["canvas"],
                "motionBlur": task["motionBlur"],
                "sources": [str(value) for value in source_paths],
                "frames": frame_documents,
                "authority": {
                    "creativeApproval": False,
                    "candidatePromotion": False,
                    "storageWrite": False,
                    "targetRepositoryMutation": False,
                    "publication": False,
                },
            }
        )
        write_json_create_only(context, manifest_path, manifest)
        output_records.append(output_record(context.staging, manifest_path, role="motion-manifest"))
        output_paths.append(manifest_path)
        if task["preview"]["animatedGif"]:
            preview_path = directory / task["previewName"]
            save_animation(context, gif_frames, preview_path, max(1, round(1000 / float(task["fps"]))))
            output_records.append(output_record(context.staging, preview_path, role="motion-preview"))
            output_paths.append(preview_path)
        context.remember(
            task["id"],
            {
                "taskId": task["id"],
                "kind": task["kind"],
                "status": "passed",
                "frameCount": int(task["frameCount"]),
                "fps": float(task["fps"]),
                "outputs": output_records,
            },
            output_paths,
        )
    finally:
        for frame in gif_frames:
            frame.close()


def execute_plan(workspace: Path, plan: dict[str, Any], plan_bytes: bytes, output_root: Path) -> dict[str, Any]:
    if plan.get("schema") != PLAN_SCHEMA:
        fail(f"plan must use {PLAN_SCHEMA}")
    plan_hash = validate_document_hash(plan)
    authority = plan.get("authority")
    if not isinstance(authority, dict):
        fail("plan authority is missing")
    for key in (
        "sourceMutation",
        "sourceDeletion",
        "providerExecution",
        "runtimeSubmission",
        "candidateApproval",
        "candidatePromotion",
        "targetRepositoryMutation",
        "publication",
        "deployment",
        "forcePush",
    ):
        if authority.get(key) is not False:
            fail(f"plan authority boundary changed: {key}")
    execution = plan.get("execution") or {}
    if (
        execution.get("outputRootMustNotExist") is not True
        or execution.get("wholeRunAtomicPublication") is not True
        or execution.get("createOnlyReceipt") is not True
        or execution.get("requiresExplicitExecution") is not True
    ):
        fail("plan execution boundary changed")
    parent = output_root.parent
    staging = Path(tempfile.mkdtemp(prefix=f".{output_root.name}.staging-", dir=parent))
    published = False
    try:
        context = RuntimeContext(workspace, staging, plan)
        context.verify_sources()
        tasks = plan.get("tasks")
        if not isinstance(tasks, list) or not tasks:
            fail("plan has no tasks")
        if len(tasks) > context.maximum_tasks:
            fail(
                f"plan exceeds the {context.maximum_tasks}-task runtime boundary"
            )
        planned_output_files = maximum_plan_output_files(context, tasks)
        if planned_output_files != context.planned_output_files:
            fail(
                "PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT: "
                "plannedMaximumOutputFiles does not match the verified task graph"
            )
        context.preflight_output_count(planned_output_files, "plan")
        for task in tasks:
            kind = task.get("kind")
            if kind == "image":
                execute_image_task(context, task)
            elif kind == "video-frame-extract":
                execute_video_frame_task(context, task)
            elif kind == "slice-sheet":
                execute_slice_task(context, task)
            elif kind == "assemble-sheet":
                execute_assemble_task(context, task)
            elif kind == "sequence-review":
                execute_review_task(context, task)
            elif kind == "image-composite":
                execute_composite_task(context, task)
            elif kind == "image-compare":
                execute_compare_task(context, task)
            elif kind == "image-master":
                execute_master_task(context, task)
            elif kind == "motion-sequence":
                execute_motion_task(context, task)
            else:
                fail(f"unsupported task kind entered runtime: {kind}")
        context.verify_sources()
        task_results = [context.task_results[task["id"]] for task in tasks]
        blocked = [result["taskId"] for result in task_results if result["status"] == "blocked"]
        all_outputs = []
        for result in task_results:
            all_outputs.extend(result["outputs"])
        receipt = with_document_hash(
            {
                "schema": RECEIPT_SCHEMA,
                "processor": {
                    "id": PROCESSOR_ID,
                    "version": "1.1.0",
                    "python": sys.version.split()[0],
                    "pillow": PILLOW_VERSION,
                },
                "planSha256": plan_hash,
                "planBytesSha256": sha256_bytes(plan_bytes),
                "sandboxId": plan["sandboxId"],
                "projectId": plan["projectId"],
                "runId": plan["runId"],
                "status": "passed" if not blocked else "completed-with-blockers",
                "blockedTaskIds": blocked,
                "sources": [
                    {
                        "sourceId": source["sourceId"],
                        "path": source["path"],
                        "sha256": source["sha256"],
                        "bytes": source["bytes"],
                    }
                    for source in plan["externalSources"]
                ],
                "tasks": task_results,
                "outputs": sorted(all_outputs, key=lambda output: output["path"]),
                "resourceUsage": {
                    "externalSourceFiles": len(context.sources),
                    "externalSourceBytes": context.total_source_bytes,
                    "plannedMaximumOutputFiles": planned_output_files,
                    "taskOutputFiles": context.output_files,
                    "taskOutputBytes": context.output_bytes,
                    "receiptExcludedFromTaskOutputTotals": True,
                },
                "effects": {
                    "sandboxExecution": True,
                    "createOnlyOutputRoot": True,
                    "wholeRunAtomicPublication": True,
                    "sourceMutation": False,
                    "sourceDeletion": False,
                    "providerExecution": False,
                    "runtimeSubmission": False,
                    "candidateApproval": False,
                    "candidatePromotion": False,
                    "targetRepositoryMutation": False,
                    "publication": False,
                    "deployment": False,
                    "forcePush": False,
                },
            }
        )
        receipt_path = staging / "_evavo" / "project-art-sandbox-receipt.json"
        write_json_create_only(context, receipt_path, receipt)
        os.replace(staging, output_root)
        published = True
        return receipt
    finally:
        if not published and staging.exists():
            shutil.rmtree(staging, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()
    try:
        workspace = require_workspace_root(args.workspace_root)
        plan_path = secure_plan_path(workspace, args.plan)
        output_root = secure_output_root(workspace, args.output_root)
        plan_bytes = plan_path.read_bytes()
        if len(plan_bytes) > MAXIMUM_PLAN_BYTES:
            fail("plan exceeds the maximum byte length")
        plan = json.loads(plan_bytes.decode("utf-8-sig"))
        if not isinstance(plan, dict):
            fail("plan must be a JSON object")
        receipt = execute_plan(workspace, plan, plan_bytes, output_root)
    except (OSError, SandboxError, json.JSONDecodeError, KeyError, TypeError) as exc:
        print(f"Project-art sandbox failed: {exc}", file=sys.stderr)
        return 2
    print(
        json.dumps(
            {
                "status": receipt["status"],
                "sandboxId": receipt["sandboxId"],
                "documentSha256": receipt["documentSha256"],
                "outputRoot": str(output_root),
                "receipt": str(output_root / "_evavo" / "project-art-sandbox-receipt.json"),
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
