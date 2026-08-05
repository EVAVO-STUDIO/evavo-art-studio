#!/usr/bin/env python3
"""Execute a bounded, create-only EVAVO image processing plan with Pillow."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import deque
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageOps, __version__ as PILLOW_VERSION
except ImportError as exc:  # pragma: no cover - explicit availability boundary
    raise SystemExit(f"Pillow is unavailable: {exc}")

PLAN_SCHEMA = "evavo.image-processing-plan.v2"
RECEIPT_SCHEMA = "evavo.image-processing-receipt.v1"
PROCESSOR_ID = "python-pillow-fallback"
MAXIMUM_INPUT_BYTES = 512 * 1024 * 1024
MAXIMUM_PLAN_BYTES = 16 * 1024 * 1024
MAXIMUM_PIXELS = 220_000_000
SHA256 = set("0123456789abcdef")
Image.MAX_IMAGE_PIXELS = MAXIMUM_PIXELS


def fail(message: str) -> None:
    raise ValueError(message)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_json(value: Any) -> str:
    if value is None or isinstance(value, (str, int, float, bool)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical_json(value[key])
            for key in sorted(value)
        ) + "}"
    fail(f"unsupported value in canonical JSON: {type(value).__name__}")


def validate_plan_hash(plan: dict[str, Any]) -> None:
    digest = plan.get("planSha256")
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(character not in SHA256 for character in digest)
    ):
        fail("plan self hash is missing or invalid")
    unhashed = dict(plan)
    unhashed.pop("planSha256", None)
    observed = hashlib.sha256(canonical_json(unhashed).encode("utf-8")).hexdigest()
    if observed != digest:
        fail("plan self hash mismatch")


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


def secure_path(root: Path, value: Path, label: str) -> Path:
    lexical = Path(os.path.abspath(value if value.is_absolute() else root / value))
    if not within(root, lexical):
        fail(f"{label} escaped workspace-root")
    current = root
    for segment in lexical.relative_to(root).parts:
        current = current / segment
        if current.is_symlink():
            fail(f"{label} contains a symbolic path component: {current}")
        if not current.exists():
            break
    return lexical


def regular_file(value: Path, label: str) -> None:
    if value.is_symlink() or not value.is_file():
        fail(f"{label} must be a regular file: {value}")


def canonical_relative_path(value: str, label: str) -> str:
    candidate = Path(value)
    if not value or candidate.is_absolute() or ".." in candidate.parts or "\\" in value:
        fail(f"{label} must be a non-empty forward-slash relative path")
    normalized = candidate.as_posix()
    if normalized != value or value in {".", ".."}:
        fail(f"{label} is not canonical")
    return value


def parse_colour(value: str, label: str) -> tuple[int, int, int]:
    if not isinstance(value, str) or len(value) != 7 or not value.startswith("#"):
        fail(f"{label} must use #RRGGBB")
    try:
        return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))  # type: ignore[return-value]
    except ValueError as exc:
        raise ValueError(f"{label} must use #RRGGBB") from exc


def alpha_counts(image: Image.Image) -> dict[str, int]:
    rgba = image.convert("RGBA")
    transparent = partial = opaque = 0
    for alpha in rgba.getchannel("A").tobytes():
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


def connected_matte_to_alpha(image: Image.Image, options: dict[str, Any]) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    matte = parse_colour(str(options.get("matteColour", "#000000")), "matteColour")
    threshold = float(options.get("connectionDistance", 32.0))
    if threshold < 0 or threshold > 441:
        fail("connectionDistance must be between 0 and 441")
    threshold_squared = threshold * threshold
    pixels = rgba.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def eligible(x: int, y: int) -> bool:
        red, green, blue, alpha = pixels[x, y]
        if alpha == 0:
            return True
        distance = (
            (red - matte[0]) * (red - matte[0])
            + (green - matte[1]) * (green - matte[1])
            + (blue - matte[2]) * (blue - matte[2])
        )
        return distance <= threshold_squared

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
        pixels[x, y] = (red, green, blue, 0)
        removed += 1
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    minimum_fraction = float(options.get("minimumBorderMatteFraction", 0.01))
    if not 0 <= minimum_fraction <= 1:
        fail("minimumBorderMatteFraction must be between 0 and 1")
    if removed / max(1, width * height) < minimum_fraction:
        fail("connected matte coverage is below the approved minimum")
    return rgba


def luminance_to_alpha(image: Image.Image, options: dict[str, Any]) -> Image.Image:
    source = image.convert("RGBA")
    black_point = float(options.get("blackPoint", 0.0))
    white_point = float(options.get("whitePoint", 255.0))
    gamma = float(options.get("gamma", 1.0))
    invert = bool(options.get("invert", False))
    if not (0 <= black_point < white_point <= 255) or not (0.1 <= gamma <= 4):
        fail("luminance alpha points or gamma are invalid")
    colour = parse_colour(str(options.get("outputColour", "#ffffff")), "outputColour")
    denominator = white_point - black_point
    output = Image.new("RGBA", source.size)
    source_pixels = source.load()
    output_pixels = output.load()
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, source_alpha = source_pixels[x, y]
            luminance = (54 * red + 183 * green + 19 * blue + 128) >> 8
            normalized = max(0.0, min(1.0, (luminance - black_point) / denominator))
            if invert:
                normalized = 1.0 - normalized
            alpha = round((normalized**gamma) * (source_alpha / 255.0) * 255.0)
            output_pixels[x, y] = (*colour, alpha)
    return output


def resized_inside(image: Image.Image, width: int, height: int, allow_upscale: bool) -> Image.Image:
    if width < 1 or height < 1:
        fail("target canvas dimensions must be positive")
    scale = min(width / image.width, height / image.height)
    if not allow_upscale:
        scale = min(1.0, scale)
    target = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    if target == image.size:
        return image.copy()
    return image.resize(target, Image.Resampling.LANCZOS)


def canvas_normalize(
    image: Image.Image,
    width: int,
    height: int,
    alpha_policy: str,
    options: dict[str, Any],
) -> Image.Image:
    allow_upscale = bool(options.get("allowUpscale", False))
    resized = resized_inside(image.convert("RGBA"), width, height, allow_upscale)
    folded = alpha_policy.casefold()
    transparent = "alpha" in folded and "black-stage" not in folded and "opaque" not in folded
    background = (
        (0, 0, 0, 0)
        if transparent
        else (*parse_colour(str(options.get("canvasColour", "#000000")), "canvasColour"), 255)
    )
    canvas = Image.new("RGBA", (width, height), background)
    anchor = str(options.get("anchor", "centre")).casefold()
    left = (width - resized.width) // 2
    if anchor in {"bottom", "bottom-centre", "bottom-center", "south"}:
        top = height - resized.height
    elif anchor in {"top", "top-centre", "top-center", "north"}:
        top = 0
    else:
        top = (height - resized.height) // 2
    canvas.alpha_composite(resized, (left, top))
    return canvas


def flatten_if_required(image: Image.Image, alpha_policy: str, options: dict[str, Any]) -> Image.Image:
    folded = alpha_policy.casefold()
    if "opaque" not in folded and "black-stage" not in folded:
        return image
    colour = parse_colour(str(options.get("canvasColour", "#000000")), "canvasColour")
    flattened = Image.new("RGBA", image.size, (*colour, 255))
    flattened.alpha_composite(image.convert("RGBA"))
    return flattened


def save_image(image: Image.Image, output: Path, runtime_format: str) -> str:
    format_name = runtime_format.lower().lstrip(".")
    if format_name == "jpg":
        format_name = "jpeg"
    if format_name not in {"png", "webp", "jpeg"}:
        fail(f"unsupported runtime format: {runtime_format}")
    if format_name == "jpeg":
        image.convert("RGB").save(
            output,
            format="JPEG",
            quality=95,
            optimize=True,
            progressive=False,
        )
    elif format_name == "webp":
        image.save(output, format="WEBP", lossless=True, quality=100, method=6)
    else:
        image.save(output, format="PNG", optimize=True, compress_level=9)
    return format_name


def execute(
    plan: dict[str, Any],
    plan_bytes: bytes,
    input_path: Path,
    output_path: Path,
    receipt_path: Path,
) -> dict[str, Any]:
    if plan.get("schema") != PLAN_SCHEMA:
        fail(f"plan must use {PLAN_SCHEMA}")
    validate_plan_hash(plan)
    if (
        plan.get("providerExecution") is not False
        or plan.get("sourceOverwrite") is not False
        or plan.get("sourceDeletion") is not False
        or plan.get("createOnlyOutput") is not True
    ):
        fail("plan effect boundary changed")
    provider_operations = plan.get("providerOperations") or []
    if not isinstance(provider_operations, list) or provider_operations:
        fail("provider operations cannot enter deterministic Pillow processing")
    route = plan.get("selectedRoute") or {}
    if route.get("processorId") != PROCESSOR_ID:
        fail(f"selected route must be {PROCESSOR_ID}")
    if output_path.exists() or receipt_path.exists():
        fail("output and receipt paths must be create-only")
    regular_file(input_path, "input")
    source_bytes = input_path.read_bytes()
    if len(source_bytes) > MAXIMUM_INPUT_BYTES:
        fail("input exceeds maximum byte length")
    source_hash = sha256_bytes(source_bytes)
    if source_hash != plan.get("sourceSha256"):
        fail("source SHA-256 does not match the plan")
    if plan.get("sourceBytes") is not None and plan.get("sourceBytes") != len(source_bytes):
        fail("source byte length does not match the plan")
    with Image.open(input_path) as opened:
        opened.load()
        if opened.width * opened.height > MAXIMUM_PIXELS:
            fail("input exceeds maximum decoded pixels")
        image = ImageOps.exif_transpose(opened).convert("RGBA")
    source_dimensions = {"width": image.width, "height": image.height}
    source_alpha = alpha_counts(image)
    options = dict(plan.get("processorOptions") or {})
    operations = list(plan.get("deterministicOperations") or [])
    supported = {
        "inspect",
        "background-preserve",
        "connected-matte-to-alpha",
        "luminance-to-alpha",
        "canvas-normalize",
        "resize",
        "convert",
        "optimize",
        "alpha-analyze",
        "palette-normalize",
    }
    unsupported = [operation for operation in operations if operation not in supported]
    if unsupported:
        fail(f"Pillow fallback does not support: {', '.join(unsupported)}")
    background_operations = {
        operation
        for operation in operations
        if operation in {"background-preserve", "connected-matte-to-alpha", "luminance-to-alpha"}
    }
    if len(background_operations) > 1:
        fail("background operations are mutually exclusive")
    if "connected-matte-to-alpha" in operations:
        image = connected_matte_to_alpha(image, options)
    if "luminance-to-alpha" in operations:
        image = luminance_to_alpha(image, options)
    target = plan.get("targetCanvas") or {}
    target_width = int(target.get("width", image.width))
    target_height = int(target.get("height", image.height))
    if "canvas-normalize" in operations:
        image = canvas_normalize(
            image,
            target_width,
            target_height,
            str(plan.get("alphaPolicy", "preserve")),
            options,
        )
    elif "resize" in operations:
        image = resized_inside(
            image,
            target_width,
            target_height,
            bool(options.get("allowUpscale", False)),
        )
    if "palette-normalize" in operations:
        palette = str(options.get("palette", "grayscale"))
        if palette == "grayscale":
            alpha = image.getchannel("A")
            grayscale = ImageOps.grayscale(image.convert("RGB"))
            image = Image.merge("RGBA", (grayscale, grayscale, grayscale, alpha))
        else:
            fail(f"unsupported palette normalization: {palette}")
    image = flatten_if_required(
        image,
        str(plan.get("alphaPolicy", "preserve")),
        options,
    )
    if plan.get("exactCanvasRequired") is True and image.size != (target_width, target_height):
        fail("exact canvas requirement was not satisfied")
    output_alpha = alpha_counts(image)
    alpha_policy = str(plan.get("alphaPolicy", "preserve")).casefold()
    if (
        "meaningful" in alpha_policy
        and output_alpha["transparentPixels"] + output_alpha["partialPixels"] == 0
    ):
        fail("meaningful transparency is required but the output is fully opaque")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    expected_extensions = {
        "png": {".png"},
        "webp": {".webp"},
        "jpeg": {".jpg", ".jpeg"},
        "jpg": {".jpg", ".jpeg"},
    }
    runtime_format = str(plan.get("runtimeFormat", output_path.suffix)).lower().lstrip(".")
    if output_path.suffix.lower() not in expected_extensions.get(runtime_format, set()):
        fail("output path extension differs from runtimeFormat")
    format_name = save_image(
        image,
        output_path,
        runtime_format,
    )
    if format_name == "jpeg" and "alpha" in alpha_policy:
        fail("JPEG cannot satisfy an alpha policy")
    output_bytes = output_path.read_bytes()
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "processor": {
            "id": PROCESSOR_ID,
            "version": PILLOW_VERSION,
            "python": sys.version.split()[0],
        },
        "planSha256": plan["planSha256"],
        "planBytesSha256": sha256_bytes(plan_bytes),
        "source": {
            "path": canonical_relative_path(
                str(plan.get("sourcePath", input_path.name)),
                "sourcePath",
            ),
            "sha256": source_hash,
            "bytes": len(source_bytes),
            "dimensions": source_dimensions,
            "alpha": source_alpha,
        },
        "output": {
            "path": str(output_path),
            "sha256": sha256_bytes(output_bytes),
            "bytes": len(output_bytes),
            "dimensions": {"width": image.width, "height": image.height},
            "alpha": output_alpha,
            "format": format_name,
        },
        "targetPath": canonical_relative_path(str(plan.get("targetPath", "output.png")), "targetPath"),
        "operations": operations,
        "exactCanvasRequired": plan.get("exactCanvasRequired") is True,
        "createOnlyOutput": True,
        "sourceOverwrite": False,
        "providerExecution": False,
        "publication": False,
    }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    with receipt_path.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(receipt, indent=2) + "\n")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    output_path: Path | None = None
    receipt_path: Path | None = None
    try:
        workspace = require_workspace_root(args.workspace_root)
        plan_path = secure_path(workspace, args.plan, "plan")
        input_path = secure_path(workspace, args.input, "input")
        output_path = secure_path(workspace, args.output, "output")
        receipt_path = secure_path(workspace, args.receipt, "receipt")
        regular_file(plan_path, "plan")
        regular_file(input_path, "input")
        if output_path == receipt_path:
            fail("output and receipt paths must differ")
        plan_bytes = plan_path.read_bytes()
        if len(plan_bytes) > MAXIMUM_PLAN_BYTES:
            fail("plan exceeds maximum byte length")
        plan = json.loads(plan_bytes.decode("utf-8-sig"))
        receipt = execute(plan, plan_bytes, input_path, output_path, receipt_path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        for candidate in (output_path, receipt_path):
            if candidate is not None and candidate.exists() and not candidate.is_dir():
                candidate.unlink(missing_ok=True)
        print(f"Pillow image processing failed: {exc}", file=sys.stderr)
        return 2
    print(
        json.dumps(
            {
                "status": "passed",
                "processor": PROCESSOR_ID,
                "outputSha256": receipt["output"]["sha256"],
                "receipt": str(receipt_path),
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
