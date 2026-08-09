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
MAXIMUM_SOURCE_BYTES = 2 * 1024 * 1024 * 1024
MAXIMUM_PIXELS = 220_000_000
MAXIMUM_HIDDEN_RGB_PIXELS = 4_000_000
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


def load_image(value: Path) -> Image.Image:
    with Image.open(value) as opened:
        opened.load()
        if opened.width < 1 or opened.height < 1 or opened.width * opened.height > MAXIMUM_PIXELS:
            fail(f"image dimensions exceed the sandbox boundary: {value}")
        return ImageOps.exif_transpose(opened).convert("RGBA")


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


def resized_canvas(image: Image.Image, operation: dict[str, Any], *, pixel: bool = False) -> Image.Image:
    width = int(operation["width"])
    height = int(operation["height"])
    if width < 1 or height < 1 or width * height > MAXIMUM_PIXELS:
        fail("resize dimensions exceed the sandbox boundary")
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


def apply_operation(image: Image.Image, operation: dict[str, Any]) -> Image.Image:
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
        width, height = int(operation["width"]), int(operation["height"])
        if x < 0 or y < 0 or width < 1 or height < 1 or x + width > image.width or y + height > image.height:
            fail("crop rectangle must be inside the source image")
        return image.crop((x, y, x + width, y + height))
    if op == "pad-canvas":
        width, height = int(operation["width"]), int(operation["height"])
        if width < image.width or height < image.height:
            fail("pad-canvas cannot crop the source image")
        canvas = Image.new("RGBA", (width, height), parse_colour(operation.get("background", "#00000000"), "pad-canvas.background"))
        canvas.alpha_composite(image, anchored_position(canvas.size, image.size, str(operation.get("anchor", "centre"))))
        return canvas
    if op == "resize":
        return resized_canvas(image, operation)
    if op == "pixel-resize":
        return resized_canvas(image, operation, pixel=True)
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


def save_image(image: Image.Image, target: Path, output_format: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        fail(f"target already exists inside staging root: {target}")
    if output_format == "png":
        image.save(target, format="PNG", optimize=True, compress_level=9)
    elif output_format == "webp":
        image.save(target, format="WEBP", lossless=True, quality=100, method=6)
    elif output_format == "jpeg":
        flattened = Image.new("RGB", image.size, (0, 0, 0))
        flattened.paste(image.convert("RGB"), mask=image.getchannel("A"))
        flattened.save(target, format="JPEG", quality=95, optimize=True, progressive=False)
    elif output_format == "gif":
        image.save(target, format="GIF", optimize=True)
    else:
        fail(f"unsupported output format: {output_format}")


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
    difference = ImageChops.difference(left.convert("RGBA"), right.convert("RGBA"))
    pixels = difference.tobytes()
    changed = 0
    for offset in range(0, len(pixels), 4):
        if pixels[offset] or pixels[offset + 1] or pixels[offset + 2] or pixels[offset + 3]:
            changed += 1
    return changed / max(1, left.width * left.height)


def create_contact_sheet(frames: list[Image.Image], columns: int) -> Image.Image:
    columns = max(1, min(columns, len(frames)))
    rows = math.ceil(len(frames) / columns)
    cell_width = max(frame.width for frame in frames)
    cell_height = max(frame.height for frame in frames)
    label_height = 18
    sheet = Image.new("RGBA", (columns * cell_width, rows * (cell_height + label_height)), (0, 0, 0, 255))
    draw = ImageDraw.Draw(sheet)
    for index, frame in enumerate(frames):
        column = index % columns
        row = index // columns
        x = column * cell_width + (cell_width - frame.width) // 2
        y = row * (cell_height + label_height)
        sheet.alpha_composite(frame, (x, y))
        draw.text((column * cell_width + 4, y + cell_height + 2), f"{index:04d}", fill=(255, 255, 255, 255))
    return sheet


def write_json_create_only(target: Path, value: Any) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


class RuntimeContext:
    def __init__(self, workspace: Path, staging: Path, plan: dict[str, Any]):
        self.workspace = workspace
        self.staging = staging
        self.plan = plan
        self.sources = {source["sourceId"]: source for source in plan["externalSources"]}
        self.source_paths: dict[str, Path] = {}
        self.task_results: dict[str, dict[str, Any]] = {}
        self.task_output_paths: dict[str, list[Path]] = {}
        self.maximum_source_bytes = int(plan.get("limits", {}).get("maximumSourceBytes", MAXIMUM_SOURCE_BYTES))

    def verify_sources(self) -> None:
        for source_id, source in self.sources.items():
            value = secure_existing_file(self.workspace, source["path"], f"source {source_id}")
            digest, size = sha256_file(value, self.maximum_source_bytes)
            if digest != source["sha256"] or size != source["bytes"]:
                fail(f"source identity changed: {source['path']}")
            self.source_paths[source_id] = value

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


def execute_image_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_path = context.resolve_source_path(task["source"])
    image = load_image(source_path)
    before = {
        "dimensions": {"width": image.width, "height": image.height},
        "alpha": alpha_statistics(image),
        "alphaBoundingBox": alpha_bbox(image),
        "pixelSha256": image_pixel_sha256(image),
    }
    operation_evidence = []
    for operation in task["operations"]:
        operation_before = image_pixel_sha256(image)
        image = apply_operation(image, operation)
        if image.width * image.height > MAXIMUM_PIXELS:
            fail(f"task {task['id']} exceeded the decoded-pixel boundary")
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
    save_image(image, target, task["outputFormat"])
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


def execute_slice_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_path = context.resolve_source_path(task["source"])
    image = load_image(source_path)
    frame_width = int(task["frameWidth"])
    frame_height = int(task["frameHeight"])
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
        save_image(frame, target, "png")
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
    manifest_path = directory / "frames.json"
    write_json_create_only(
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


def fitted_cell(image: Image.Image, width: int, height: int, fit: str, sample: str) -> Image.Image:
    if fit == "strict":
        if image.size != (width, height):
            fail(f"strict sheet cell expected {width}x{height}, received {image.width}x{image.height}")
        return image.copy()
    operation = {
        "width": width,
        "height": height,
        "fit": fit,
        "sampling": sample,
        "background": "#00000000",
    }
    return resized_canvas(image, operation, pixel=sample == "nearest")


def execute_assemble_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_paths = [context.resolve_source_path(source) for source in task["sources"]]
    frames = [load_image(value) for value in source_paths]
    if not frames:
        fail(f"assemble-sheet task {task['id']} has no sources")
    cell = task.get("cell")
    if cell:
        cell_width = int(cell["width"])
        cell_height = int(cell["height"])
        fit = cell["fit"]
        sample = cell["sampling"]
    else:
        cell_width, cell_height = frames[0].size
        fit, sample = "strict", "nearest"
    prepared = [fitted_cell(frame, cell_width, cell_height, fit, sample) for frame in frames]
    columns = int(task["columns"])
    rows = math.ceil(len(prepared) / columns)
    padding = int(task["padding"])
    width = padding * 2 + columns * cell_width
    height = padding * 2 + rows * cell_height
    if width * height > MAXIMUM_PIXELS:
        fail(f"assemble-sheet task {task['id']} exceeds the decoded-pixel boundary")
    sheet = Image.new("RGBA", (width, height), parse_colour(task["background"], "assemble-sheet.background"))
    for index, frame in enumerate(prepared):
        x = padding + (index % columns) * cell_width
        y = padding + (index // columns) * cell_height
        sheet.alpha_composite(frame, (x, y))
    target = target_path(context.staging, task["targetPath"], f"task {task['id']} target")
    save_image(sheet, target, "png")
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


def execute_review_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_paths = [context.resolve_source_path(source) for source in task["sources"]]
    frames = [load_image(value) for value in source_paths]
    if not frames:
        fail(f"sequence-review task {task['id']} has no frames")
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
    write_json_create_only(manifest_path, manifest)
    outputs = [output_record(context.staging, manifest_path, role="review-manifest")]
    output_paths = [manifest_path]
    preview = task["preview"]
    if preview["contactSheet"]:
        sheet = create_contact_sheet(frames, int(preview["columns"]))
        value = target_directory / "contact-sheet.png"
        save_image(sheet, value, "png")
        outputs.append(output_record(context.staging, value, sheet, role="review-contact-sheet"))
        output_paths.append(value)
    if preview["animatedGif"]:
        value = target_directory / "animation-preview.gif"
        duration = int(preview["frameDurationMs"])
        gif_frames = [frame.convert("RGBA") for frame in frames]
        gif_frames[0].save(
            value,
            format="GIF",
            save_all=True,
            append_images=gif_frames[1:],
            duration=duration,
            loop=0,
            disposal=2,
            optimize=False,
            transparency=0,
        )
        outputs.append(output_record(context.staging, value, role="review-animation"))
        output_paths.append(value)
    if preview["onionSkins"] and len(frames) > 1:
        onion_directory = target_directory / "onion-skins"
        onion_directory.mkdir(parents=True, exist_ok=False)
        for index in range(1, len(frames)):
            previous = frames[index - 1].copy()
            current = frames[index].copy()
            red = Image.new("RGBA", previous.size, (255, 0, 0, 0))
            red.putalpha(previous.getchannel("A").point(lambda value: round(value * 0.45)))
            cyan = Image.new("RGBA", current.size, (0, 255, 255, 0))
            cyan.putalpha(current.getchannel("A").point(lambda value: round(value * 0.55)))
            onion = Image.new("RGBA", previous.size, (0, 0, 0, 255))
            onion.alpha_composite(red)
            onion.alpha_composite(cyan)
            value = onion_directory / f"{index - 1:04d}-{index:04d}.png"
            save_image(onion, value, "png")
            outputs.append(output_record(context.staging, value, onion, role="review-onion-skin"))
            output_paths.append(value)
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


def image_compare_metrics(left: Image.Image, right: Image.Image) -> dict[str, Any]:
    if left.size != right.size:
        return {
            "sameDimensions": False,
            "changedPixelFraction": 1.0,
            "meanAbsoluteChannelDelta": 255.0,
            "maximumChannelDelta": 255,
            "alphaChangedPixelFraction": 1.0,
        }
    left_rgba = left.convert("RGBA")
    right_rgba = right.convert("RGBA")
    difference = ImageChops.difference(left_rgba, right_rgba)
    raw = difference.tobytes()
    changed = 0
    alpha_changed = 0
    total_delta = 0
    maximum_delta = 0
    for offset in range(0, len(raw), 4):
        values = raw[offset:offset + 4]
        if any(values):
            changed += 1
        if values[3]:
            alpha_changed += 1
        total_delta += sum(values)
        maximum_delta = max(maximum_delta, *values)
    pixels = max(1, left_rgba.width * left_rgba.height)
    return {
        "sameDimensions": True,
        "changedPixelFraction": changed / pixels,
        "meanAbsoluteChannelDelta": total_delta / (pixels * 4),
        "maximumChannelDelta": maximum_delta,
        "alphaChangedPixelFraction": alpha_changed / pixels,
    }


def execute_compare_task(context: RuntimeContext, task: dict[str, Any]) -> None:
    source_paths = [context.resolve_source_path(source) for source in task["sources"]]
    if len(source_paths) != 2:
        fail(f"image-compare task {task['id']} requires exactly two sources")
    left = load_image(source_paths[0])
    right = load_image(source_paths[1])
    metrics = image_compare_metrics(left, right)
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
    write_json_create_only(manifest_path, manifest)
    outputs = [output_record(context.staging, manifest_path, role="comparison-manifest")]
    output_paths = [manifest_path]
    if task["preview"]["difference"] and left.size == right.size:
        difference = ImageChops.difference(left.convert("RGBA"), right.convert("RGBA"))
        difference_path = target_directory / "difference.png"
        save_image(difference, difference_path, "png")
        outputs.append(output_record(context.staging, difference_path, difference, role="comparison-difference"))
        output_paths.append(difference_path)
    if task["preview"]["overlay"] and left.size == right.size:
        overlay = Image.blend(left.convert("RGBA"), right.convert("RGBA"), 0.5)
        overlay_path = target_directory / "overlay.png"
        save_image(overlay, overlay_path, "png")
        outputs.append(output_record(context.staging, overlay_path, overlay, role="comparison-overlay"))
        output_paths.append(overlay_path)
    context.remember(task["id"], {
        "taskId": task["id"],
        "kind": task["kind"],
        "status": manifest["status"],
        "issueCount": len(issues),
        "metrics": metrics,
        "outputs": outputs,
    }, output_paths)


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
        write_json_create_only(receipt_path, receipt)
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
