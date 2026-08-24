#!/usr/bin/env python3
"""Encode one reviewed EVA atlas PNG to WebP and prove decoded parity.

This tool is intentionally narrow. It accepts one SHA-bound atlas clean master,
writes one create-only WebP derivative, decodes that derivative again, and emits
one create-only receipt only when alpha is exact and visible-RGB error remains
inside the plan's explicit bounds. It grants no approval, upload or activation
authority.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, features
import PIL

PLAN_SCHEMA = "evavo.eva-hires-atlas-webp-encode-plan.v1"
RECEIPT_SCHEMA = "evavo.eva-hires-atlas-webp-encode-receipt.v1"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
FRAME_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
MAX_PLAN_BYTES = 2 * 1024 * 1024
MAX_ATLAS_PIXELS = 40_000_000
MAX_OUTPUT_BYTES = 128 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = MAX_ATLAS_PIXELS


def fail(message: str) -> None:
    raise ValueError(message)


def canonical(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
        + "\n"
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def secure_relative(root: Path, value: Any, label: str, *, must_exist: bool) -> Path:
    if not isinstance(value, str) or not value or "\x00" in value or "\\" in value:
        fail(f"{label} must be a forward-slash workspace-relative path")
    candidate = Path(value)
    if candidate.is_absolute() or any(part in {"", ".", "..", ".git"} for part in candidate.parts):
        fail(f"{label} is not a safe workspace-relative path")
    resolved = (root / candidate).resolve(strict=must_exist)
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"{label} escaped workspace") from exc
    current = root
    for part in candidate.parts:
        current = current / part
        if current.exists() and current.is_symlink():
            fail(f"{label} contains a symbolic link")
    return resolved


def regular_file(path: Path, label: str, *, maximum: int) -> bytes:
    if path.is_symlink() or not path.is_file():
        fail(f"{label} must be one ordinary file")
    size = path.stat().st_size
    if size < 1 or size > maximum:
        fail(f"{label} byte length is outside the allowed range")
    return path.read_bytes()


def strict_int(value: Any, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        fail(f"{label} must be an integer between {minimum} and {maximum}")
    return value


def strict_number(value: Any, label: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        fail(f"{label} must be numeric")
    result = float(value)
    if not minimum <= result <= maximum:
        fail(f"{label} must be between {minimum} and {maximum}")
    return result


def alpha_sha(image: Image.Image) -> str:
    return sha256_bytes(image.getchannel("A").tobytes())


def percentile_from_histogram(histogram: list[int], percentile: float) -> int:
    total = sum(histogram)
    if total <= 0:
        return 0
    threshold = total * percentile
    cumulative = 0
    for value, count in enumerate(histogram):
        cumulative += count
        if cumulative >= threshold:
            return value
    return 255


def visible_rgb_metrics(source: Image.Image, encoded: Image.Image) -> dict[str, Any]:
    alpha = source.getchannel("A")
    visible_mask = alpha.point(lambda value: 255 if value > 0 else 0)
    visible_pixels = sum(1 for count_index, count in enumerate(visible_mask.histogram()) if False)
    mask_histogram = visible_mask.histogram()
    visible_count = int(mask_histogram[255])
    if visible_count <= 0:
        fail("atlas contains no visible pixels")

    difference = ImageChops.difference(source.convert("RGB"), encoded.convert("RGB"))
    combined = [0] * 256
    total_absolute_delta = 0
    maximum = 0
    for channel in difference.split():
        histogram = channel.histogram(mask=visible_mask)
        for delta, count in enumerate(histogram):
            if count:
                combined[delta] += count
                total_absolute_delta += delta * count
                maximum = max(maximum, delta)
    sample_count = visible_count * 3
    return {
        "visiblePixelCount": visible_count,
        "sampleCount": sample_count,
        "meanAbsoluteDelta": round(total_absolute_delta / sample_count, 6),
        "p95AbsoluteDelta": percentile_from_histogram(combined, 0.95),
        "maximumAbsoluteDelta": maximum,
    }


def validate_frame_regions(frames: Any, width: int, height: int) -> list[dict[str, Any]]:
    if not isinstance(frames, list) or not 1 <= len(frames) <= 36:
        fail("frames must contain between 1 and 36 atlas regions")
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for index, raw in enumerate(frames):
        if not isinstance(raw, dict) or set(raw) != {"frameId", "x", "y", "width", "height"}:
            fail(f"frames[{index}] has an invalid shape")
        frame_id = raw.get("frameId")
        if not isinstance(frame_id, str) or not FRAME_ID.fullmatch(frame_id) or frame_id in seen:
            fail(f"frames[{index}].frameId is invalid or duplicate")
        x = strict_int(raw.get("x"), f"frames[{index}].x", 0, width - 1)
        y = strict_int(raw.get("y"), f"frames[{index}].y", 0, height - 1)
        frame_width = strict_int(raw.get("width"), f"frames[{index}].width", 1, width)
        frame_height = strict_int(raw.get("height"), f"frames[{index}].height", 1, height)
        if x + frame_width > width or y + frame_height > height:
            fail(f"frames[{index}] escapes atlas bounds")
        seen.add(frame_id)
        result.append({"frameId": frame_id, "x": x, "y": y, "width": frame_width, "height": frame_height})
    return result


def parity(source: Image.Image, encoded: Image.Image, frames: list[dict[str, Any]]) -> dict[str, Any]:
    source_alpha = alpha_sha(source)
    encoded_alpha = alpha_sha(encoded)
    atlas_metrics = visible_rgb_metrics(source, encoded)
    frame_metrics = []
    for frame in frames:
        box = (
            frame["x"],
            frame["y"],
            frame["x"] + frame["width"],
            frame["y"] + frame["height"],
        )
        source_crop = source.crop(box)
        encoded_crop = encoded.crop(box)
        try:
            metrics = visible_rgb_metrics(source_crop, encoded_crop)
            frame_metrics.append({"frameId": frame["frameId"], **metrics})
        finally:
            source_crop.close()
            encoded_crop.close()
    return {
        "alphaExact": source_alpha == encoded_alpha,
        "sourceAlphaSha256": source_alpha,
        "encodedAlphaSha256": encoded_alpha,
        "atlas": atlas_metrics,
        "frames": frame_metrics,
    }


def assert_parity(evidence: dict[str, Any], limits: dict[str, float]) -> None:
    if evidence["alphaExact"] is not True:
        fail("encoded WebP alpha channel does not exactly match clean master")
    all_metrics = [evidence["atlas"], *evidence["frames"]]
    for metrics in all_metrics:
        label = metrics.get("frameId", "atlas")
        if metrics["meanAbsoluteDelta"] > limits["mean"]:
            fail(f"visible RGB mean delta exceeds limit for {label}")
        if metrics["p95AbsoluteDelta"] > limits["p95"]:
            fail(f"visible RGB p95 delta exceeds limit for {label}")
        if metrics["maximumAbsoluteDelta"] > limits["maximum"]:
            fail(f"visible RGB maximum delta exceeds limit for {label}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()

    output_path: Path | None = None
    receipt_path: Path | None = None
    try:
        root = Path(os.path.abspath(args.workspace_root)).resolve(strict=True)
        if root.is_symlink() or not root.is_dir():
            fail("workspace root must be one existing ordinary directory")

        plan_path = Path(os.path.abspath(args.plan)).resolve(strict=True)
        try:
            plan_path.relative_to(root)
        except ValueError as exc:
            raise ValueError("plan must be inside workspace root") from exc
        plan_bytes = regular_file(plan_path, "plan", maximum=MAX_PLAN_BYTES)
        expected_plan = str(args.plan_sha256).strip().lower()
        if not SHA256.fullmatch(expected_plan) or sha256_bytes(plan_bytes) != expected_plan:
            fail("plan SHA-256 mismatch")
        plan = json.loads(plan_bytes.decode("utf-8"))
        if plan.get("schema") != PLAN_SCHEMA:
            fail("plan schema is invalid")
        if plan.get("createOnlyOutput") is not True or plan.get("sourceOverwrite") is not False:
            fail("plan authority boundary is invalid")

        source_path = secure_relative(root, plan.get("input"), "input", must_exist=True)
        source_bytes = regular_file(source_path, "input", maximum=MAX_OUTPUT_BYTES)
        source_sha = str(plan.get("sourceSha256") or "").lower()
        if not SHA256.fullmatch(source_sha) or sha256_bytes(source_bytes) != source_sha:
            fail("input atlas SHA-256 mismatch")

        output_path = secure_relative(root, plan.get("output"), "output", must_exist=False)
        receipt_path = Path(os.path.abspath(args.receipt)).resolve(strict=False)
        try:
            receipt_path.relative_to(root)
        except ValueError as exc:
            raise ValueError("receipt must be inside workspace root") from exc
        if output_path.exists() or receipt_path.exists():
            fail("output and receipt are create-only")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.parent.mkdir(parents=True, exist_ok=True)

        width = strict_int(plan.get("width"), "width", 1, 8192)
        height = strict_int(plan.get("height"), "height", 1, 8192)
        if width * height > MAX_ATLAS_PIXELS:
            fail("atlas dimensions exceed decoded-pixel budget")
        frames = validate_frame_regions(plan.get("frames"), width, height)
        encoding = plan.get("encoding")
        if not isinstance(encoding, dict):
            fail("encoding must be an object")
        quality = strict_int(encoding.get("quality"), "encoding.quality", 1, 100)
        method = strict_int(encoding.get("method"), "encoding.method", 0, 6)
        if encoding.get("lossless") is not False or encoding.get("exact") is not True:
            fail("encoding must use lossy WebP with exact transparent-RGB handling")

        parity_plan = plan.get("parity")
        if not isinstance(parity_plan, dict) or parity_plan.get("requireAlphaExact") is not True:
            fail("parity policy must require exact alpha")
        limits = {
            "mean": strict_number(parity_plan.get("maximumVisibleRgbMeanAbsoluteDelta"), "parity.mean", 0, 255),
            "p95": strict_number(parity_plan.get("maximumVisibleRgbP95AbsoluteDelta"), "parity.p95", 0, 255),
            "maximum": strict_number(parity_plan.get("maximumVisibleRgbAbsoluteDelta"), "parity.maximum", 0, 255),
        }

        with Image.open(source_path) as source_open:
            source_open.load()
            source = source_open.convert("RGBA")
        try:
            if source.size != (width, height):
                fail("input atlas dimensions do not match plan")
            source.save(
                output_path,
                format="WEBP",
                quality=quality,
                method=method,
                lossless=False,
                exact=True,
            )
            output_bytes = regular_file(output_path, "encoded output", maximum=MAX_OUTPUT_BYTES)
            with Image.open(output_path) as encoded_open:
                encoded_open.load()
                encoded = encoded_open.convert("RGBA")
            try:
                if encoded.size != source.size:
                    fail("decoded WebP dimensions changed")
                evidence = parity(source, encoded, frames)
                assert_parity(evidence, limits)
            finally:
                encoded.close()
        finally:
            source.close()

        receipt = {
            "schema": RECEIPT_SCHEMA,
            "status": "passed",
            "planSha256": expected_plan,
            "sourceSha256": source_sha,
            "outputSha256": sha256_bytes(output_bytes),
            "outputBytes": len(output_bytes),
            "width": width,
            "height": height,
            "frameCount": len(frames),
            "encoding": {
                "format": "webp",
                "quality": quality,
                "method": method,
                "lossless": False,
                "exact": True,
                "pillowVersion": PIL.__version__,
                "libwebpVersion": features.version("webp"),
            },
            "parityLimits": limits,
            "parity": evidence,
            "createOnlyOutput": True,
            "sourceOverwrite": False,
            "automaticApproval": False,
            "creativeApproval": False,
            "candidatePromotion": False,
            "cloudinaryUpload": False,
            "runtimeActivation": False,
            "websiteActivation": False,
            "repositoryMutation": False,
            "publication": False,
            "forcePush": False,
        }
        receipt_path.write_bytes(canonical(receipt))
        print(json.dumps(receipt, ensure_ascii=False, sort_keys=True))
        return 0
    except (OSError, ValueError, KeyError, UnicodeError, json.JSONDecodeError) as exc:
        for candidate in (receipt_path, output_path):
            if candidate is not None and candidate.exists():
                try:
                    candidate.unlink()
                except OSError:
                    pass
        print(json.dumps({"schema": RECEIPT_SCHEMA, "status": "failed", "error": str(exc)[:1024]}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
