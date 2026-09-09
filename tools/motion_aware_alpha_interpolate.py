#!/usr/bin/env python3
"""Deterministically reconstruct an in-between RGBA frame from reviewed endpoints.

The producer performs no model inference and no creative synthesis. It searches for
one conservative whole-frame translation using thresholded alpha silhouettes, then
moves both reviewed endpoints toward their intermediate motion anchor before doing
premultiplied-alpha linear interpolation. If registration is not trustworthy, the
producer falls back to an unwarped premultiplied-alpha crossfade and records why.

Outputs are create-only. A canonical JSON receipt binds the input/output hashes,
producer identity, registration evidence, interpolation amount, and safety policy.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image

TOOL_VERSION = "1.0.0"
RECEIPT_SCHEMA = "evavo.motion-aware-alpha-interpolation-receipt.v1"
DEFAULT_ALPHA_THRESHOLD = 8
DEFAULT_HORIZONTAL_RADIUS = 72
DEFAULT_VERTICAL_RADIUS = 96
DEFAULT_MINIMUM_SCORE = 0.18
DEFAULT_MINIMUM_IMPROVEMENT = 0.01
DEFAULT_EXPECTED_WIDTH = 1024
DEFAULT_EXPECTED_HEIGHT = 1536
COARSE_SCALE = 4
COARSE_CANDIDATE_COUNT = 8
FULL_REFINE_RADIUS = 3
SHA1_RE = re.compile(r"^[a-f0-9]{40}$")
SAFE_FRAME_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$")


class ProducerError(RuntimeError):
    """Expected producer failure with a stable human-readable message."""


@dataclass(frozen=True)
class BinarySilhouette:
    width: int
    height: int
    padded_bits: int
    rows: tuple[int, ...]
    area: int
    bbox: tuple[int, int, int, int] | None


@dataclass(frozen=True)
class RegistrationEvidence:
    selected_dx: int
    selected_dy: int
    score: float
    zero_offset_score: float
    improvement: float
    fallback_reason: str | None
    before_dx: float
    before_dy: float
    after_dx: float
    after_dy: float
    coarse_scale: int
    full_resolution_candidates_evaluated: int


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _git_blob_sha1(data: bytes) -> str:
    prefix = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(prefix + data).hexdigest()


def _canonical_json_bytes(value: object) -> bytes:
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        + "\n"
    ).encode("utf-8")


def _read_regular_file(path: Path, label: str) -> bytes:
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise ProducerError(f"{label} does not exist: {path}") from exc
    if resolved.is_symlink() or not resolved.is_file():
        raise ProducerError(f"{label} must be a regular non-symbolic file: {path}")
    try:
        return resolved.read_bytes()
    except OSError as exc:
        raise ProducerError(f"Unable to read {label}: {path}") from exc


def _load_rgba(data: bytes, label: str) -> Image.Image:
    try:
        with Image.open(io.BytesIO(data)) as opened:
            opened.load()
            return opened.convert("RGBA")
    except Exception as exc:
        raise ProducerError(f"{label} is not a readable raster image") from exc


def _alpha_mask(image: Image.Image, threshold: int) -> Image.Image:
    alpha = image.getchannel("A")
    return alpha.point(lambda value: 255 if value > threshold else 0, mode="L")


def _silhouette_from_mask(mask: Image.Image) -> BinarySilhouette:
    if mask.mode != "L":
        mask = mask.convert("L")
    binary = mask.point(lambda value: 255 if value else 0, mode="1")
    width, height = binary.size
    row_bytes = (width + 7) // 8
    padded_bits = row_bytes * 8
    packed = binary.tobytes()
    rows: list[int] = []
    area = 0
    for y in range(height):
        chunk = packed[y * row_bytes : (y + 1) * row_bytes]
        row = int.from_bytes(chunk, "big")
        rows.append(row)
        area += row.bit_count()
    return BinarySilhouette(
        width=width,
        height=height,
        padded_bits=padded_bits,
        rows=tuple(rows),
        area=area,
        bbox=mask.getbbox(),
    )


def _shifted_row(row: int, dx: int, padded_bits: int) -> int:
    if dx > 0:
        return row >> dx
    if dx < 0:
        return (row << (-dx)) & ((1 << padded_bits) - 1)
    return row


def _normalized_overlap(
    before: BinarySilhouette,
    after: BinarySilhouette,
    dx: int,
    dy: int,
) -> float:
    if before.area <= 0 or after.area <= 0:
        return float("nan")
    if before.width != after.width or before.height != after.height:
        return float("nan")

    y_start = max(0, dy)
    y_end = min(before.height, after.height + dy)
    if y_end <= y_start:
        return 0.0

    overlap = 0
    for dest_y in range(y_start, y_end):
        source_y = dest_y - dy
        shifted = _shifted_row(after.rows[source_y], dx, before.padded_bits)
        overlap += (before.rows[dest_y] & shifted).bit_count()

    denominator = math.sqrt(before.area * after.area)
    if denominator <= 0:
        return float("nan")
    return overlap / denominator


def _candidate_sort_key(candidate: tuple[int, int, float]) -> tuple[float, int, int, int]:
    dx, dy, score = candidate
    finite_score = score if math.isfinite(score) else -math.inf
    return (-finite_score, dx * dx + dy * dy, dy, dx)


def _scaled_silhouette(mask: Image.Image, scale: int) -> BinarySilhouette:
    width, height = mask.size
    scaled = mask.resize(
        (max(1, math.ceil(width / scale)), max(1, math.ceil(height / scale))),
        Image.Resampling.NEAREST,
    )
    return _silhouette_from_mask(scaled)


def _search_registration_offset(
    before_mask: Image.Image,
    after_mask: Image.Image,
    horizontal_radius: int,
    vertical_radius: int,
) -> tuple[int, int, float, float, int]:
    full_before = _silhouette_from_mask(before_mask)
    full_after = _silhouette_from_mask(after_mask)
    zero_score = _normalized_overlap(full_before, full_after, 0, 0)

    coarse_before = _scaled_silhouette(before_mask, COARSE_SCALE)
    coarse_after = _scaled_silhouette(after_mask, COARSE_SCALE)
    coarse_rx = math.ceil(horizontal_radius / COARSE_SCALE)
    coarse_ry = math.ceil(vertical_radius / COARSE_SCALE)
    coarse_candidates: list[tuple[int, int, float]] = []
    for dy in range(-coarse_ry, coarse_ry + 1):
        for dx in range(-coarse_rx, coarse_rx + 1):
            coarse_candidates.append(
                (dx, dy, _normalized_overlap(coarse_before, coarse_after, dx, dy))
            )
    coarse_candidates.sort(key=_candidate_sort_key)

    full_offsets: set[tuple[int, int]] = {(0, 0)}
    for coarse_dx, coarse_dy, _ in coarse_candidates[:COARSE_CANDIDATE_COUNT]:
        center_x = coarse_dx * COARSE_SCALE
        center_y = coarse_dy * COARSE_SCALE
        for local_dy in range(-FULL_REFINE_RADIUS, FULL_REFINE_RADIUS + 1):
            for local_dx in range(-FULL_REFINE_RADIUS, FULL_REFINE_RADIUS + 1):
                dx = center_x + local_dx
                dy = center_y + local_dy
                if abs(dx) <= horizontal_radius and abs(dy) <= vertical_radius:
                    full_offsets.add((dx, dy))

    candidates = [
        (dx, dy, _normalized_overlap(full_before, full_after, dx, dy))
        for dx, dy in full_offsets
    ]
    candidates.sort(key=_candidate_sort_key)
    best_dx, best_dy, best_score = candidates[0]
    return best_dx, best_dy, best_score, zero_score, len(candidates)


def _translated_bbox_fits(
    bbox: tuple[int, int, int, int] | None,
    dx: float,
    dy: float,
    width: int,
    height: int,
) -> bool:
    if bbox is None:
        return False
    left, top, right, bottom = bbox
    epsilon = 1e-7
    return (
        left + dx >= -epsilon
        and top + dy >= -epsilon
        and right + dx <= width + epsilon
        and bottom + dy <= height + epsilon
    )


def _registration_evidence(
    before_mask: Image.Image,
    after_mask: Image.Image,
    amount: float,
    horizontal_radius: int,
    vertical_radius: int,
    minimum_score: float,
    minimum_improvement: float,
) -> RegistrationEvidence:
    before_silhouette = _silhouette_from_mask(before_mask)
    after_silhouette = _silhouette_from_mask(after_mask)
    if before_silhouette.area <= 0 or after_silhouette.area <= 0:
        return RegistrationEvidence(
            0, 0, 0.0, 0.0, 0.0, "registration-empty-alpha",
            0.0, 0.0, 0.0, 0.0, COARSE_SCALE, 0,
        )

    dx, dy, score, zero_score, candidate_count = _search_registration_offset(
        before_mask,
        after_mask,
        horizontal_radius,
        vertical_radius,
    )
    if not math.isfinite(score) or not math.isfinite(zero_score):
        fallback_reason = "registration-score-nonfinite"
    else:
        improvement = score - zero_score
        if score < minimum_score:
            fallback_reason = "registration-low-confidence"
        elif (dx != 0 or dy != 0) and improvement < minimum_improvement:
            fallback_reason = "registration-low-confidence"
        else:
            fallback_reason = None

    improvement = (
        score - zero_score
        if math.isfinite(score) and math.isfinite(zero_score)
        else 0.0
    )

    # dx/dy is the translation that aligns AFTER toward BEFORE. To preserve the
    # global movement rather than pinning everything to BEFORE, both endpoints
    # move toward the interpolated anchor. This keeps t=0 and t=1 exact.
    before_dx = -amount * dx
    before_dy = -amount * dy
    after_dx = (1.0 - amount) * dx
    after_dy = (1.0 - amount) * dy

    if fallback_reason is None:
        if not (
            _translated_bbox_fits(
                before_silhouette.bbox,
                before_dx,
                before_dy,
                before_silhouette.width,
                before_silhouette.height,
            )
            and _translated_bbox_fits(
                after_silhouette.bbox,
                after_dx,
                after_dy,
                after_silhouette.width,
                after_silhouette.height,
            )
        ):
            fallback_reason = "registration-would-clip-opaque-bounds"

    if fallback_reason is not None:
        before_dx = before_dy = after_dx = after_dy = 0.0

    return RegistrationEvidence(
        selected_dx=dx,
        selected_dy=dy,
        score=score if math.isfinite(score) else 0.0,
        zero_offset_score=zero_score if math.isfinite(zero_score) else 0.0,
        improvement=improvement,
        fallback_reason=fallback_reason,
        before_dx=before_dx,
        before_dy=before_dy,
        after_dx=after_dx,
        after_dy=after_dy,
        coarse_scale=COARSE_SCALE,
        full_resolution_candidates_evaluated=candidate_count,
    )


def _translate_premultiplied(image: Image.Image, dx: float, dy: float) -> Image.Image:
    premultiplied = image.convert("RGBa")
    if abs(dx) < 1e-12 and abs(dy) < 1e-12:
        return premultiplied
    return premultiplied.transform(
        image.size,
        Image.Transform.AFFINE,
        (1.0, 0.0, -dx, 0.0, 1.0, -dy),
        resample=Image.Resampling.BICUBIC,
        fillcolor=(0, 0, 0, 0),
    )


def _clear_transparent_rgb(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    zero_alpha = rgba.getchannel("A").point(
        lambda value: 255 if value == 0 else 0,
        mode="L",
    )
    rgba.paste((0, 0, 0, 0), (0, 0), zero_alpha)
    return rgba


def interpolate_images(
    before: Image.Image,
    after: Image.Image,
    amount: float,
    *,
    alpha_threshold: int = DEFAULT_ALPHA_THRESHOLD,
    horizontal_radius: int = DEFAULT_HORIZONTAL_RADIUS,
    vertical_radius: int = DEFAULT_VERTICAL_RADIUS,
    minimum_score: float = DEFAULT_MINIMUM_SCORE,
    minimum_improvement: float = DEFAULT_MINIMUM_IMPROVEMENT,
) -> tuple[Image.Image, RegistrationEvidence]:
    if before.size != after.size:
        raise ProducerError("Endpoint dimensions must match exactly")
    if not (0.0 <= amount <= 1.0):
        raise ProducerError("Interpolation amount must be between 0 and 1 inclusive")
    if not (0 <= alpha_threshold <= 254):
        raise ProducerError("Alpha threshold must be between 0 and 254")
    if horizontal_radius < 0 or vertical_radius < 0:
        raise ProducerError("Registration radii must be non-negative")
    if not (0.0 <= minimum_score <= 1.0):
        raise ProducerError("Minimum registration score must be between 0 and 1")
    if not (0.0 <= minimum_improvement <= 1.0):
        raise ProducerError("Minimum score improvement must be between 0 and 1")

    before_rgba = before.convert("RGBA")
    after_rgba = after.convert("RGBA")

    if amount == 0.0:
        evidence = RegistrationEvidence(
            0, 0, 1.0, 1.0, 0.0, None,
            0.0, 0.0, 0.0, 0.0, COARSE_SCALE, 0,
        )
        return before_rgba.copy(), evidence
    if amount == 1.0:
        evidence = RegistrationEvidence(
            0, 0, 1.0, 1.0, 0.0, None,
            0.0, 0.0, 0.0, 0.0, COARSE_SCALE, 0,
        )
        return after_rgba.copy(), evidence

    before_mask = _alpha_mask(before_rgba, alpha_threshold)
    after_mask = _alpha_mask(after_rgba, alpha_threshold)
    evidence = _registration_evidence(
        before_mask,
        after_mask,
        amount,
        horizontal_radius,
        vertical_radius,
        minimum_score,
        minimum_improvement,
    )

    before_p = _translate_premultiplied(
        before_rgba,
        evidence.before_dx,
        evidence.before_dy,
    )
    after_p = _translate_premultiplied(
        after_rgba,
        evidence.after_dx,
        evidence.after_dy,
    )
    blended_p = Image.blend(before_p, after_p, amount)
    return _clear_transparent_rgb(blended_p.convert("RGBA")), evidence


def _encode_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(
        buffer,
        format="PNG",
        optimize=False,
        compress_level=9,
    )
    return buffer.getvalue()


def _source_record(data: bytes, image: Image.Image) -> dict[str, object]:
    return {
        "sha256": _sha256(data),
        "gitBlobSha1": _git_blob_sha1(data),
        "bytes": len(data),
        "width": image.width,
        "height": image.height,
        "mode": "RGBA",
    }


def build_receipt(
    *,
    frame_id: str,
    amount: float,
    before_data: bytes,
    after_data: bytes,
    before_image: Image.Image,
    after_image: Image.Image,
    output_data: bytes,
    output_image: Image.Image,
    evidence: RegistrationEvidence,
    producer_commit: str,
    producer_tool_blob_sha1: str,
    alpha_threshold: int,
    horizontal_radius: int,
    vertical_radius: int,
    minimum_score: float,
    minimum_improvement: float,
) -> dict[str, object]:
    fallback_used = evidence.fallback_reason is not None
    return {
        "schema": RECEIPT_SCHEMA,
        "frameId": frame_id,
        "producer": {
            "repository": "EVAVO-STUDIO/evavo-art-studio",
            "tool": "tools/motion_aware_alpha_interpolate.py",
            "version": TOOL_VERSION,
            "commit": producer_commit,
            "toolGitBlobSha1": producer_tool_blob_sha1,
            "mode": "deterministic-local-no-network",
        },
        "endpoints": {
            "before": _source_record(before_data, before_image),
            "after": _source_record(after_data, after_image),
        },
        "timing": {
            "amount": amount,
            "method": "linear",
            "endpointPixelIdentityPreserved": amount in (0.0, 1.0),
        },
        "registration": {
            "method": "alpha-silhouette-bounded-translation-registration",
            "alphaMaskThreshold": alpha_threshold,
            "horizontalSearchRadiusPixels": horizontal_radius,
            "verticalSearchRadiusPixels": vertical_radius,
            "scoreMethod": "normalized-alpha-overlap",
            "tieBreak": "smallest-offset-then-y-then-x",
            "minimumAcceptedScore": minimum_score,
            "minimumImprovementOverZeroOffset": minimum_improvement,
            "selectedOffsetPixels": {
                "x": evidence.selected_dx,
                "y": evidence.selected_dy,
            },
            "score": round(evidence.score, 12),
            "zeroOffsetScore": round(evidence.zero_offset_score, 12),
            "scoreImprovement": round(evidence.improvement, 12),
            "appliedEndpointTranslationsPixels": {
                "before": {
                    "x": round(evidence.before_dx, 12),
                    "y": round(evidence.before_dy, 12),
                },
                "after": {
                    "x": round(evidence.after_dx, 12),
                    "y": round(evidence.after_dy, 12),
                },
            },
            "registered": not fallback_used,
            "fallbackUsed": fallback_used,
            "fallbackReason": evidence.fallback_reason,
            "search": {
                "strategy": "deterministic-coarse-to-full-resolution-refinement",
                "coarseScale": evidence.coarse_scale,
                "fullResolutionCandidatesEvaluated": evidence.full_resolution_candidates_evaluated,
            },
        },
        "interpolation": {
            "method": "registered-premultiplied-alpha-linear-interpolation"
            if not fallback_used
            else "premultiplied-alpha-linear-interpolation",
            "premultipliedAlpha": True,
            "clearTransparentRgb": True,
            "colorSpace": "sRGB",
            "rescaleEndpoints": False,
            "cropEndpoints": False,
            "rotation": False,
            "shear": False,
        },
        "output": {
            "sha256": _sha256(output_data),
            "bytes": len(output_data),
            "width": output_image.width,
            "height": output_image.height,
            "format": "PNG",
        },
        "constraints": {
            "network": False,
            "modelInference": False,
            "styleTransfer": False,
            "creativeGeneration": False,
            "sourceMutation": False,
            "createOnlyOutput": True,
        },
    }


def _reserve_and_write_pair(
    output_path: Path,
    output_data: bytes,
    receipt_path: Path,
    receipt_data: bytes,
) -> None:
    if output_path == receipt_path:
        raise ProducerError("Output and receipt paths must be different")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)

    output_handle = None
    receipt_handle = None
    try:
        output_handle = output_path.open("xb")
        try:
            receipt_handle = receipt_path.open("xb")
        except Exception:
            output_handle.close()
            output_handle = None
            output_path.unlink(missing_ok=True)
            raise

        output_handle.write(output_data)
        output_handle.flush()
        os.fsync(output_handle.fileno())
        receipt_handle.write(receipt_data)
        receipt_handle.flush()
        os.fsync(receipt_handle.fileno())
    except FileExistsError as exc:
        raise ProducerError(f"Create-only target already exists: {exc.filename}") from exc
    except OSError as exc:
        raise ProducerError(f"Unable to write create-only outputs: {exc}") from exc
    finally:
        if output_handle is not None:
            output_handle.close()
        if receipt_handle is not None:
            receipt_handle.close()


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deterministic motion-aware alpha interpolation for reviewed EVA poses."
    )
    parser.add_argument("--source-before", type=Path, required=True)
    parser.add_argument("--source-after", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--frame-id", required=True)
    parser.add_argument("--amount", type=float, required=True)
    parser.add_argument("--producer-commit", required=True)
    parser.add_argument("--producer-tool-blob-sha1", required=True)
    parser.add_argument("--expected-width", type=int, default=DEFAULT_EXPECTED_WIDTH)
    parser.add_argument("--expected-height", type=int, default=DEFAULT_EXPECTED_HEIGHT)
    parser.add_argument("--alpha-threshold", type=int, default=DEFAULT_ALPHA_THRESHOLD)
    parser.add_argument("--horizontal-radius", type=int, default=DEFAULT_HORIZONTAL_RADIUS)
    parser.add_argument("--vertical-radius", type=int, default=DEFAULT_VERTICAL_RADIUS)
    parser.add_argument("--minimum-score", type=float, default=DEFAULT_MINIMUM_SCORE)
    parser.add_argument(
        "--minimum-improvement",
        type=float,
        default=DEFAULT_MINIMUM_IMPROVEMENT,
    )
    return parser.parse_args(argv)


def run(argv: Iterable[str] | None = None) -> dict[str, object]:
    args = _parse_args(argv)
    if not SAFE_FRAME_ID_RE.fullmatch(args.frame_id):
        raise ProducerError("Frame id is invalid")
    if not SHA1_RE.fullmatch(args.producer_commit):
        raise ProducerError("Producer commit must be a lowercase 40-character SHA-1")
    if not SHA1_RE.fullmatch(args.producer_tool_blob_sha1):
        raise ProducerError("Producer tool blob must be a lowercase 40-character SHA-1")
    if args.output.resolve(strict=False) in {
        args.source_before.resolve(strict=False),
        args.source_after.resolve(strict=False),
    }:
        raise ProducerError("Output must not overwrite either reviewed endpoint")
    if args.receipt.resolve(strict=False) in {
        args.source_before.resolve(strict=False),
        args.source_after.resolve(strict=False),
    }:
        raise ProducerError("Receipt must not overwrite either reviewed endpoint")

    tool_data = Path(__file__).resolve().read_bytes()
    actual_tool_blob = _git_blob_sha1(tool_data)
    if actual_tool_blob != args.producer_tool_blob_sha1:
        raise ProducerError(
            "Producer tool bytes do not match --producer-tool-blob-sha1 "
            f"(expected {args.producer_tool_blob_sha1}, got {actual_tool_blob})"
        )

    before_data = _read_regular_file(args.source_before, "Before source")
    after_data = _read_regular_file(args.source_after, "After source")
    before_image = _load_rgba(before_data, "Before source")
    after_image = _load_rgba(after_data, "After source")
    if before_image.size != after_image.size:
        raise ProducerError("Reviewed endpoint dimensions do not match")
    if before_image.size != (args.expected_width, args.expected_height):
        raise ProducerError(
            "Reviewed endpoint dimensions do not match the expected canvas "
            f"{args.expected_width}x{args.expected_height}"
        )

    output_image, evidence = interpolate_images(
        before_image,
        after_image,
        args.amount,
        alpha_threshold=args.alpha_threshold,
        horizontal_radius=args.horizontal_radius,
        vertical_radius=args.vertical_radius,
        minimum_score=args.minimum_score,
        minimum_improvement=args.minimum_improvement,
    )
    output_data = _encode_png(output_image)
    receipt = build_receipt(
        frame_id=args.frame_id,
        amount=args.amount,
        before_data=before_data,
        after_data=after_data,
        before_image=before_image,
        after_image=after_image,
        output_data=output_data,
        output_image=output_image,
        evidence=evidence,
        producer_commit=args.producer_commit,
        producer_tool_blob_sha1=args.producer_tool_blob_sha1,
        alpha_threshold=args.alpha_threshold,
        horizontal_radius=args.horizontal_radius,
        vertical_radius=args.vertical_radius,
        minimum_score=args.minimum_score,
        minimum_improvement=args.minimum_improvement,
    )
    receipt_data = _canonical_json_bytes(receipt)
    _reserve_and_write_pair(args.output, output_data, args.receipt, receipt_data)
    return receipt


def main(argv: Iterable[str] | None = None) -> int:
    try:
        receipt = run(argv)
    except ProducerError as exc:
        print(f"motion-aware alpha interpolation failed: {exc}", file=sys.stderr)
        return 2
    print(
        json.dumps(
            {
                "status": "passed",
                "schema": receipt["schema"],
                "frameId": receipt["frameId"],
                "outputSha256": receipt["output"]["sha256"],
                "fallbackUsed": receipt["registration"]["fallbackUsed"],
                "repositoryMutation": False,
                "network": False,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
