#!/usr/bin/env python3
"""Execute deterministic, create-only image edits from an exact work order."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import tempfile
from collections import deque
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps, __version__ as PILLOW_VERSION
except ImportError as error:  # pragma: no cover
    raise RuntimeError("Pillow is required: install requirements-image-pipeline.txt") from error

from image_style_features import (
    alpha_statistics,
    corner_colour,
    feature_vector,
    load_image,
    resolve_inside,
    sha256_file,
)

WORK_ORDER_SCHEMA = "evavo.image-reference-work-order.v1"
RECEIPT_SCHEMA = "evavo.image-processing-receipt.v1"
CONTRACT_ID = "evavo.executable-image-pipeline.v1"
RESAMPLE = getattr(Image, "Resampling", Image).LANCZOS
EDIT_OPERATIONS = {
    "crop-safe",
    "canvas-normalize",
    "resize",
    "connected-matte-to-alpha",
    "luminance-to-alpha",
    "edge-decontaminate",
    "hidden-rgb-rebuild",
    "palette-normalize",
    "linework-strengthen",
    "convert",
    "optimize",
    "background-preserve",
}


def fail(message: str) -> None:
    raise ValueError(message)


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def read_json(path: Path) -> Any:
    if path.is_symlink() or not path.is_file():
        fail(f"not a regular JSON file: {path}")
    return json.loads(path.read_text(encoding="utf-8-sig"))


def target_canvas(work_order: dict[str, Any]) -> tuple[int, int]:
    value = work_order.get("targetCanvas")
    if isinstance(value, list) and len(value) == 2:
        width, height = value
    elif isinstance(value, dict):
        width, height = value.get("width"), value.get("height")
    else:
        fail("work order targetCanvas must be [width,height] or an object")
    if not isinstance(width, int) or not isinstance(height, int) or width < 1 or height < 1:
        fail("work order targetCanvas is invalid")
    return width, height


def operation_parameters(work_order: dict[str, Any], operation: str) -> dict[str, Any]:
    parameters = work_order.get("operationParameters") or {}
    value = parameters.get(operation) if isinstance(parameters, dict) else None
    return value if isinstance(value, dict) else {}


def parse_colour(value: Any, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    if isinstance(value, list) and len(value) == 3 and all(isinstance(channel, int) and 0 <= channel <= 255 for channel in value):
        return tuple(value)  # type: ignore[return-value]
    if isinstance(value, str) and len(value) == 7 and value.startswith("#"):
        try:
            return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))  # type: ignore[return-value]
        except ValueError:
            pass
    return fallback


def safe_crop(image: Image.Image, parameters: dict[str, Any]) -> Image.Image:
    alpha = image.getchannel("A")
    alpha_info = alpha_statistics(image)
    if alpha_info["meaningfulAlpha"]:
        mask = alpha.point(lambda value: 255 if value > 8 else 0)
    else:
        background = corner_colour(image)
        difference = ImageChops.difference(image.convert("RGB"), Image.new("RGB", image.size, background)).convert("L")
        tolerance = int(parameters.get("tolerance", 18))
        mask = difference.point(lambda value: 255 if value > tolerance else 0)
    bbox = mask.getbbox()
    if bbox is None:
        fail("crop-safe found no visible subject")
    padding_ratio = float(parameters.get("paddingRatio", 0.06))
    padding_ratio = min(0.40, max(0.0, padding_ratio))
    left, top, right, bottom = bbox
    padding = round(max(right - left, bottom - top) * padding_ratio)
    box = (
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    )
    return image.crop(box)


def connected_matte_to_alpha(image: Image.Image, parameters: dict[str, Any]) -> Image.Image:
    if image.width * image.height > 25_000_000:
        fail("connected matte removal exceeds the bounded 25M-pixel implementation; use a reviewed mask")
    matte = parse_colour(parameters.get("matteColor"), corner_colour(image))
    tolerance = min(96, max(0, int(parameters.get("tolerance", 28))))
    pixels = image.load()
    width, height = image.size
    connected = bytearray(width * height)
    candidate = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            r, g, b, _ = pixels[x, y]
            if max(abs(r - matte[0]), abs(g - matte[1]), abs(b - matte[2])) <= tolerance:
                candidate[y * width + x] = 1
    queue: deque[int] = deque()
    for x in range(width):
        for index in (x, (height - 1) * width + x):
            if candidate[index] and not connected[index]:
                connected[index] = 1
                queue.append(index)
    for y in range(height):
        for index in (y * width, y * width + width - 1):
            if candidate[index] and not connected[index]:
                connected[index] = 1
                queue.append(index)
    while queue:
        index = queue.popleft()
        x = index % width
        y = index // width
        if x > 0:
            neighbour = index - 1
            if candidate[neighbour] and not connected[neighbour]:
                connected[neighbour] = 1
                queue.append(neighbour)
        if x + 1 < width:
            neighbour = index + 1
            if candidate[neighbour] and not connected[neighbour]:
                connected[neighbour] = 1
                queue.append(neighbour)
        if y > 0:
            neighbour = index - width
            if candidate[neighbour] and not connected[neighbour]:
                connected[neighbour] = 1
                queue.append(neighbour)
        if y + 1 < height:
            neighbour = index + width
            if candidate[neighbour] and not connected[neighbour]:
                connected[neighbour] = 1
                queue.append(neighbour)
    alpha = image.getchannel("A")
    alpha_pixels = bytearray(alpha.tobytes())
    for index, remove in enumerate(connected):
        if remove:
            alpha_pixels[index] = 0
    output_alpha = Image.frombytes("L", image.size, bytes(alpha_pixels))
    feather = min(4.0, max(0.0, float(parameters.get("featherRadius", 0.75))))
    if feather:
        output_alpha = output_alpha.filter(ImageFilter.GaussianBlur(feather))
    output = image.copy()
    output.putalpha(output_alpha)
    return output


def luminance_to_alpha(image: Image.Image, parameters: dict[str, Any]) -> Image.Image:
    luminance = image.convert("RGB").convert("L")
    if parameters.get("invert") is True:
        luminance = ImageOps.invert(luminance)
    gamma = min(4.0, max(0.25, float(parameters.get("gamma", 1.0))))
    if gamma != 1.0:
        table = [round((value / 255.0) ** gamma * 255.0) for value in range(256)]
        luminance = luminance.point(table)
    luminance = ImageChops.multiply(luminance, image.getchannel("A"))
    rgb_mode = str(parameters.get("rgbMode") or "white")
    if rgb_mode == "preserve":
        output = image.copy()
    else:
        colour = parse_colour(parameters.get("foregroundColor"), (255, 255, 255))
        output = Image.new("RGBA", image.size, (*colour, 255))
    output.putalpha(luminance)
    return output


def edge_decontaminate(image: Image.Image, parameters: dict[str, Any]) -> Image.Image:
    matte = parse_colour(parameters.get("matteColor"), corner_colour(image))
    minimum_alpha = min(254, max(1, int(parameters.get("minimumAlpha", 4))))
    pixels = list(image.getdata())
    output: list[tuple[int, int, int, int]] = []
    for r, g, b, alpha in pixels:
        if minimum_alpha <= alpha < 255:
            fraction = alpha / 255.0
            channels = []
            for observed, background in zip((r, g, b), matte):
                value = (observed - background * (1.0 - fraction)) / max(fraction, 1e-6)
                channels.append(max(0, min(255, round(value))))
            output.append((channels[0], channels[1], channels[2], alpha))
        else:
            output.append((r, g, b, alpha))
    result = Image.new("RGBA", image.size)
    result.putdata(output)
    return result


def hidden_rgb_rebuild(image: Image.Image, parameters: dict[str, Any]) -> Image.Image:
    iterations = min(16, max(1, int(parameters.get("iterations", 6))))
    red, green, blue, alpha = image.split()
    known = alpha.point(lambda value: 255 if value > 0 else 0)
    channels = [red, green, blue]
    for _ in range(iterations):
        expanded = known.filter(ImageFilter.MaxFilter(3))
        frontier = ImageChops.subtract(expanded, known)
        if frontier.getbbox() is None:
            break
        new_channels: list[Image.Image] = []
        for channel in channels:
            weighted = ImageChops.multiply(channel, known)
            neighbourhood = weighted.filter(ImageFilter.BoxBlur(1))
            weights = known.filter(ImageFilter.BoxBlur(1))
            channel_pixels = bytearray(channel.tobytes())
            neighbourhood_pixels = neighbourhood.tobytes()
            weight_pixels = weights.tobytes()
            frontier_pixels = frontier.tobytes()
            for index, active in enumerate(frontier_pixels):
                if active and weight_pixels[index]:
                    channel_pixels[index] = max(0, min(255, round(neighbourhood_pixels[index] * 255 / weight_pixels[index])))
            new_channels.append(Image.frombytes("L", image.size, bytes(channel_pixels)))
        channels = new_channels
        known = expanded
    return Image.merge("RGBA", (*channels, alpha))


def palette_normalize(image: Image.Image, parameters: dict[str, Any]) -> Image.Image:
    red_target = parse_colour(parameters.get("redAccent"), (255, 36, 78))
    contrast = min(3.0, max(0.5, float(parameters.get("contrast", 1.25))))
    rgb = image.convert("RGB")
    grayscale = ImageEnhance.Contrast(ImageOps.autocontrast(rgb.convert("L"))).enhance(contrast)
    source_pixels = rgb.getdata()
    gray_pixels = grayscale.getdata()
    output: list[tuple[int, int, int, int]] = []
    alpha_pixels = image.getchannel("A").getdata()
    for (r, g, b), value, alpha in zip(source_pixels, gray_pixels, alpha_pixels):
        is_red = r >= 72 and r >= g * 1.35 and r >= b * 1.35 and r - min(g, b) >= 28
        if is_red:
            scale = max(0.35, value / 255.0)
            colour = tuple(max(0, min(255, round(channel * scale))) for channel in red_target)
            output.append((colour[0], colour[1], colour[2], alpha))
        else:
            output.append((value, value, value, alpha))
    result = Image.new("RGBA", image.size)
    result.putdata(output)
    return result


def linework_strengthen(image: Image.Image, parameters: dict[str, Any]) -> Image.Image:
    contrast = min(3.0, max(0.5, float(parameters.get("contrast", 1.18))))
    radius = min(4.0, max(0.1, float(parameters.get("radius", 1.1))))
    percent = min(300, max(0, int(parameters.get("percent", 125))))
    threshold = min(32, max(0, int(parameters.get("threshold", 2))))
    alpha = image.getchannel("A")
    rgb = ImageEnhance.Contrast(image.convert("RGB")).enhance(contrast)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold))
    output = rgb.convert("RGBA")
    output.putalpha(alpha)
    return output


def canvas_background(alpha_policy: str, parameters: dict[str, Any]) -> tuple[int, int, int, int]:
    lower = alpha_policy.lower()
    if "alpha" in lower or "transparent" in lower or "overlay" in lower:
        return (0, 0, 0, 0)
    if "black-stage" in lower or "authored-black" in lower:
        return (0, 0, 0, 255)
    colour = parse_colour(parameters.get("backgroundColor"), (0, 0, 0))
    return (*colour, 255)


def canvas_normalize(image: Image.Image, canvas: tuple[int, int], alpha_policy: str, parameters: dict[str, Any]) -> Image.Image:
    width, height = canvas
    scale = min(width / image.width, height / image.height)
    resized_size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    resized = image.resize(resized_size, RESAMPLE)
    output = Image.new("RGBA", canvas, canvas_background(alpha_policy, parameters))
    anchor = str(parameters.get("anchor") or "center")
    x = (width - resized.width) // 2
    y = height - resized.height if anchor == "bottom-center" else (height - resized.height) // 2
    output.alpha_composite(resized, (x, y))
    return output


def exact_resize(image: Image.Image, canvas: tuple[int, int], parameters: dict[str, Any]) -> Image.Image:
    allow_distortion = parameters.get("allowDistortion") is True
    source_ratio = image.width / image.height
    target_ratio = canvas[0] / canvas[1]
    if not allow_distortion and abs(source_ratio - target_ratio) / max(source_ratio, target_ratio) > 0.02:
        fail("resize would distort aspect ratio; use canvas-normalize")
    return image.resize(canvas, RESAMPLE)


def validate_output_format(output: Path, runtime_format: str) -> str:
    suffix = output.suffix.lower()
    if suffix not in {".png", ".webp"}:
        fail("runtime output must be PNG or WebP")
    normalized = runtime_format.lower().lstrip(".")
    if normalized in {"png", "webp"} and suffix != f".{normalized}":
        fail("output extension does not match work-order runtimeFormat")
    if normalized not in {"png", "webp", "webp-lossless-or-png", "png-or-webp"}:
        fail(f"unsupported runtimeFormat: {runtime_format}")
    return suffix


def save_candidate(image: Image.Image, temporary: Path, suffix: str) -> None:
    if suffix == ".png":
        image.save(temporary, format="PNG", optimize=True, compress_level=9)
    else:
        image.save(temporary, format="WEBP", lossless=True, quality=100, method=6, exact=True)


def execute(repo: Path, source_root: Path, output_root: Path, work_order_path: Path, output_relative: str) -> tuple[dict[str, Any], Path, bytes]:
    contract = read_json(repo / "config" / "executable-image-pipeline.v1.json")
    work_order_bytes = work_order_path.read_bytes()
    work_order = json.loads(work_order_bytes.decode("utf-8-sig"))
    if contract.get("contract") != CONTRACT_ID:
        fail("unexpected executable image pipeline contract")
    if work_order.get("schema") != WORK_ORDER_SCHEMA:
        fail("unexpected image work-order schema")
    if work_order.get("decision") != "edit":
        fail("deterministic processor accepts edit decisions only; keep uses the source and recreate or variation requires a separate provider receipt")
    source = resolve_inside(source_root, str(work_order.get("sourcePath")))
    source_sha, source_size = sha256_file(source, int(contract["limits"]["maximumSourceBytes"]))
    if source_sha != str(work_order.get("sourceSha256") or "").lower():
        fail("source image changed after review")
    output = resolve_inside(output_root, output_relative, must_exist=False)
    if output == source or output.exists():
        fail("candidate output must be create-only and distinct from source")
    canvas = target_canvas(work_order)
    alpha_policy = str(work_order.get("alphaPolicy") or "")
    runtime_format = str(work_order.get("runtimeFormat") or "")
    if not alpha_policy or not runtime_format:
        fail("work order lacks alphaPolicy or runtimeFormat")
    suffix = validate_output_format(output, runtime_format)
    operations = work_order.get("operations") or ["canvas-normalize", "convert", "optimize"]
    if not isinstance(operations, list) or not operations:
        fail("work-order operations must be a non-empty list")
    unknown = [operation for operation in operations if operation not in EDIT_OPERATIONS]
    if unknown:
        fail(f"unsupported deterministic operations: {unknown}")

    image = load_image(source, int(contract["limits"]["maximumDecodedPixels"]))
    before = feature_vector(image)
    applied: list[dict[str, Any]] = []
    for operation in operations:
        parameters = operation_parameters(work_order, operation)
        before_size = list(image.size)
        if operation == "crop-safe":
            image = safe_crop(image, parameters)
        elif operation == "connected-matte-to-alpha":
            image = connected_matte_to_alpha(image, parameters)
        elif operation == "luminance-to-alpha":
            image = luminance_to_alpha(image, parameters)
        elif operation == "edge-decontaminate":
            image = edge_decontaminate(image, parameters)
        elif operation == "hidden-rgb-rebuild":
            image = hidden_rgb_rebuild(image, parameters)
        elif operation == "palette-normalize":
            image = palette_normalize(image, parameters)
        elif operation == "linework-strengthen":
            image = linework_strengthen(image, parameters)
        elif operation == "canvas-normalize":
            image = canvas_normalize(image, canvas, alpha_policy, parameters)
        elif operation == "resize":
            image = exact_resize(image, canvas, parameters)
        elif operation in {"convert", "optimize", "background-preserve"}:
            pass
        applied.append({"operation": operation, "parameters": parameters, "beforeSize": before_size, "afterSize": list(image.size)})

    if image.size != canvas:
        fail(f"processed image does not match target canvas {canvas}; add canvas-normalize or resize")
    after = feature_vector(image)
    lower_alpha = alpha_policy.lower()
    if "meaningful-alpha-required" in lower_alpha and not after["alpha"]["meaningfulAlpha"]:
        fail("processed image does not have meaningful alpha")
    if "opaque" in lower_alpha and not after["alpha"]["fullyOpaque"]:
        fail("processed image violates opaque alpha policy")
    if after["alpha"]["fullyTransparent"] or after["activeRatio"] < 0.001:
        fail("processed image is blank or fully transparent")

    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{output.stem}.", suffix=suffix, dir=output.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        save_candidate(image, temporary, suffix)
        candidate_sha, candidate_size = sha256_file(temporary, int(contract["limits"]["maximumSourceBytes"]))
        if candidate_size < int(contract["limits"]["minimumCandidateBytes"]):
            fail("candidate output is unexpectedly small")
        decoded = load_image(temporary, int(contract["limits"]["maximumDecodedPixels"]))
        decoded_features = feature_vector(decoded)
        if decoded.size != canvas:
            fail("saved candidate decoded to the wrong dimensions")
        current_source_sha, current_source_size = sha256_file(source, int(contract["limits"]["maximumSourceBytes"]))
        if current_source_sha != source_sha or current_source_size != source_size:
            fail("source image changed during processing")
        receipt: dict[str, Any] = {
            "schema": RECEIPT_SCHEMA,
            "contract": CONTRACT_ID,
            "status": "passed",
            "backend": {"id": "python-pillow", "version": PILLOW_VERSION},
            "workOrderPath": str(work_order_path.resolve()),
            "workOrderSha256": hashlib.sha256(work_order_bytes).hexdigest(),
            "sourcePath": str(work_order["sourcePath"]),
            "sourceSha256": source_sha,
            "sourceSizeBytes": source_size,
            "candidatePath": Path(output_relative).as_posix(),
            "candidateSha256": candidate_sha,
            "candidateSizeBytes": candidate_size,
            "targetCanvas": list(canvas),
            "alphaPolicy": alpha_policy,
            "runtimeFormat": suffix.lstrip("."),
            "operations": applied,
            "beforeFeatures": before,
            "afterFeatures": decoded_features,
            "effects": contract["effects"],
        }
        receipt["receiptSha256"] = sha256_json(receipt)
        receipt_bytes = (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        os.replace(temporary, output)
        return receipt, output, receipt_bytes
    finally:
        temporary.unlink(missing_ok=True)


def atomic_receipt(path: Path, receipt_bytes: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        fail(f"processing receipt already exists: {path}")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(receipt_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--work-order", type=Path, required=True)
    parser.add_argument("--output", required=True, help="candidate path relative to --output-root")
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    output: Path | None = None
    try:
        receipt, output, receipt_bytes = execute(
            args.repo.resolve(),
            args.source_root.resolve(),
            args.output_root.resolve(),
            args.work_order.resolve(),
            args.output,
        )
        atomic_receipt(args.receipt.resolve(), receipt_bytes)
    except (OSError, UnicodeError, ValueError, TypeError, KeyError, json.JSONDecodeError, RuntimeError) as error:
        if output is not None:
            output.unlink(missing_ok=True)
        print(f"image work-order processing failed: {error}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": "passed",
        "candidate": str(output),
        "candidateSha256": receipt["candidateSha256"],
        "receipt": str(args.receipt.resolve()),
        "receiptSha256": receipt["receiptSha256"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
