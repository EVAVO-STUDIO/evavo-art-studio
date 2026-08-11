#!/usr/bin/env python3
"""Execute an exact, create-only EVAVO project-art sandbox plan with Pillow."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
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

PLAN_SCHEMA = "evavo.project-art-sandbox-plan.v1"
RECEIPT_SCHEMA = "evavo.project-art-sandbox-receipt.v1"
PROCESSOR_ID = "python-pillow-project-art-sandbox"
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
REVIEW_LABEL_HEIGHT = 18
SHA256_CHARS = set("0123456789abcdef")
Image.MAX_IMAGE_PIXELS = MAXIMUM_PIXELS


class SandboxError(ValueError):
    """Bounded sandbox failure."""


def fail(message: str) -> None:
    raise SandboxError(message)


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


def canonical_json(value: Any) -> str:
    if value is None or isinstance(value, (str, int, float, bool)):
        if isinstance(value, float) and not math.isfinite(value):
            fail("canonical JSON cannot contain non-finite numbers")
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
        return ImageOps.exif_transpose(opened).convert("RGBA")


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
    rgb = enhancer(image.convert("RGB")).enhance(factor).convert("RGBA")
    rgb.putalpha(alpha)
    return rgb


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
        width, height = require_pixel_budget(
            int(operation["width"]),
            int(operation["height"]),
            "crop target",
            maximum_pixels,
        )
        if x < 0 or y < 0 or width < 1 or height < 1 or x + width > image.width or y + height > image.height:
            fail("crop rectangle must be inside the source image")
        return image.crop((x, y, x + width, y + height))
    if op == "pad-canvas":
        width, height = require_pixel_budget(
            int(operation["width"]),
            int(operation["height"]),
            "pad-canvas target",
            maximum_pixels,
        )
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
    if op == "gaussian-blur":
        radius = float(operation.get("radius", 1.0))
        alpha = image.getchannel("A")
        result = image.convert("RGB").filter(ImageFilter.GaussianBlur(radius=radius)).convert("RGBA")
        result.putalpha(alpha)
        return result
    if op == "unsharp-mask":
        radius = float(operation.get("radius", 2.0))
        percent = int(operation.get("percent", 150))
        threshold = int(operation.get("threshold", 3))
        alpha = image.getchannel("A")
        result = image.convert("RGB").filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold)).convert("RGBA")
        result.putalpha(alpha)
        return result
    if op == "alpha-erode":
        width = int(operation.get("width", 1))
        result = image.copy()
        result.putalpha(result.getchannel("A").filter(ImageFilter.MinFilter(width * 2 + 1)))
        return result
    if op == "alpha-dilate":
        width = int(operation.get("width", 1))
        result = image.copy()
        result.putalpha(result.getchannel("A").filter(ImageFilter.MaxFilter(width * 2 + 1)))
        return result
    if op == "alpha-threshold":
        threshold = int(operation.get("threshold", 128))
        output = image.copy()
        output.putalpha(output.getchannel("A").point(lambda value: 255 if value >= threshold else 0))
        return output
    if op == "connected-matte-to-alpha":
        return connected_matte_to_alpha(image, operation)
    if op == "edge-decontaminate":
        return edge_decontaminate(image, operation)
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
        return quantized.convert("RGBA")
    if op == "autocontrast":
        red, green, blue, alpha = image.split()
        cutoff = float(operation.get("cutoff", 0.0))
        return Image.merge(
            "RGBA",
            (
                ImageOps.autocontrast(red, cutoff=cutoff),
                ImageOps.autocontrast(green, cutoff=cutoff),
                ImageOps.autocontrast(blue, cutoff=cutoff),
                alpha,
            ),
        )
    if op == "levels":
        return levels(image, operation)
    if op == "outline":
        return outline(image, operation)
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
        changed = sum(1 for pixel in difference.getdata() if any(pixel))
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
        if expected.get("meaningfulAlpha") is True and alpha["transparentPixels"] + alpha["partialPixels"] == 0:
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
    sheet = Image.new("RGBA", (width, height), parse_colour(task["background"], "assemble-sheet.background"))
    try:
        for index, source_path in enumerate(source_paths):
            frame = load_image(
                source_path,
                context.maximum_decoded_pixels,
                f"assemble-sheet task {task['id']} source {index}",
            )
            prepared = frame
            try:
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
                "outputs": [output_record(context.staging, target, sheet, role="sprite-sheet")],
            },
            [target],
        )
    finally:
        sheet.close()


def execute_review_task(context: RuntimeContext, task: dict[str, Any]) -> None:
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
        require_active_pixel_budget(
            [source_pixels, maximum_frame_pixels * 2],
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
            bbox = alpha_bbox(frame)
            centroid = alpha_centroid(frame)
            if expected_width is not None and frame.width != int(expected_width):
                issues.append({"code": "width-mismatch", "frameIndex": index, "expected": expected_width, "actual": frame.width})
            if expected_height is not None and frame.height != int(expected_height):
                issues.append({"code": "height-mismatch", "frameIndex": index, "expected": expected_height, "actual": frame.height})
            if frame.size != first_size:
                issues.append({"code": "sequence-dimension-drift", "frameIndex": index, "expected": list(first_size), "actual": list(frame.size)})
            if task.get("requireAlpha", False) and alpha["transparentPixels"] + alpha["partialPixels"] == 0:
                issues.append({"code": "alpha-required", "frameIndex": index})
            if bbox is None and task.get("rejectBlankFrames", True):
                issues.append({"code": "blank-frame", "frameIndex": index})
            frame_records.append(
                {
                    "frameIndex": index,
                    "source": str(source_path),
                    "pixelSha256": image_pixel_sha256(frame),
                    "dimensions": {"width": frame.width, "height": frame.height},
                    "alpha": alpha,
                    "alphaBoundingBox": bbox,
                    "alphaCentroid": centroid,
                }
            )
        transitions = []
        thresholds = task["thresholds"]
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
            transition = {
                "fromFrameIndex": index - 1,
                "toFrameIndex": index,
                "changedPixelFraction": changed,
                "alphaCentroidShiftPixels": shift,
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
        manifest = {
            "schema": "evavo.project-art-sequence-review.v1",
            "taskId": task["id"],
            "status": "passed" if not issues else "blocked",
            "frames": frame_records,
            "transitions": transitions,
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
            duration = int(preview["frameDurationMs"])
            save_animation(context, frames, value, duration)
            outputs.append(output_record(context.staging, value, role="review-animation"))
            output_paths.append(value)
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
            layer_width = int(layer.get("width", source_width))
            layer_height = int(layer.get("height", source_height))
            require_pixel_budget(
                layer_width,
                layer_height,
                f"image-composite task {task['id']} layer {index}",
                context.maximum_decoded_pixels,
            )
            mask_pixels = 0
            mask_index = layer.get("maskSourceIndex")
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
            blend_mode = layer.get("blendMode", "normal")
            canvas_multiplier = 3 if blend_mode == "normal" else 9
            layer_multiplier = 6 if mask_index is not None else 4
            require_active_pixel_budget(
                [
                    canvas_pixels * canvas_multiplier,
                    layer_width * layer_height * layer_multiplier,
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
        for values in difference.getdata():
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
                    "version": "1.0.0",
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
