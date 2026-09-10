#!/usr/bin/env python3
"""Deterministic region-aware RGBA interpolation for reviewed character poses.

This producer preserves the exact reviewed endpoints and improves on the v1 global
translation model by estimating bounded local motion across four overlapping body
bands. Each endpoint is warped toward the intermediate anchor with a smooth
vertical displacement field, then blended in premultiplied alpha. When local
registration is incomplete, incoherent, or could clip opaque content, the tool
falls back to the reviewed v1 global producer and records the reason.

No network access, model inference, style transfer, or creative generation occurs.
Outputs are create-only and accompanied by a canonical evidence receipt.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops

_BASE_PATH = Path(__file__).resolve().with_name("motion_aware_alpha_interpolate.py")
_BASE_SPEC = importlib.util.spec_from_file_location("evavo_motion_alpha_v1", _BASE_PATH)
if _BASE_SPEC is None or _BASE_SPEC.loader is None:
    raise RuntimeError(f"Unable to load base producer: {_BASE_PATH}")
base = importlib.util.module_from_spec(_BASE_SPEC)
sys.modules[_BASE_SPEC.name] = base
_BASE_SPEC.loader.exec_module(base)

TOOL_VERSION = "2.0.0"
RECEIPT_SCHEMA = "evavo.region-aware-alpha-interpolation-receipt.v2"
DEFAULT_BAND_COUNT = 4
DEFAULT_MINIMUM_VALID_BANDS = 3
DEFAULT_MAX_ADJACENT_OFFSET_DELTA = 56.0
DEFAULT_LOCAL_WINDOW_FRACTION = 0.30
MIN_LOCAL_WINDOW_PIXELS = 96
MIN_LOCAL_ALPHA_PIXELS = 256
BAND_CENTER_FRACTIONS = (0.16, 0.39, 0.64, 0.86)


class ProducerError(base.ProducerError):
    """Stable expected failure for the region-aware producer."""


@dataclass(frozen=True)
class BandEvidence:
    index: int
    center_y: float
    window_top: int
    window_bottom: int
    selected_dx: int
    selected_dy: int
    score: float
    zero_offset_score: float
    improvement: float
    accepted: bool
    rejection_reason: str | None
    candidates_evaluated: int


@dataclass(frozen=True)
class RegionalEvidence:
    method: str
    bands: tuple[BandEvidence, ...]
    fallback_reason: str | None
    global_evidence: object | None


def _union_alpha_bbox(before_mask: Image.Image, after_mask: Image.Image):
    return ImageChops.lighter(before_mask, after_mask).getbbox()


def _band_windows(bbox, height: int, band_count: int = DEFAULT_BAND_COUNT):
    if bbox is None or band_count != DEFAULT_BAND_COUNT:
        return []
    _, top, _, bottom = bbox
    subject_height = max(1, bottom - top)
    window_height = max(
        MIN_LOCAL_WINDOW_PIXELS,
        int(round(subject_height * DEFAULT_LOCAL_WINDOW_FRACTION)),
    )
    window_height = min(height, window_height)
    half = window_height / 2.0
    windows = []
    for index, fraction in enumerate(BAND_CENTER_FRACTIONS):
        center = top + subject_height * fraction
        y0 = max(0, min(height - window_height, int(round(center - half))))
        y1 = min(height, y0 + window_height)
        windows.append((index, float(center), y0, y1))
    return windows


def _measure_band(
    before_mask: Image.Image,
    after_mask: Image.Image,
    index: int,
    center_y: float,
    top: int,
    bottom: int,
    horizontal_radius: int,
    vertical_radius: int,
    minimum_score: float,
    minimum_improvement: float,
) -> BandEvidence:
    width = before_mask.width
    before_crop = before_mask.crop((0, top, width, bottom))
    after_crop = after_mask.crop((0, top, width, bottom))
    before_shape = base._silhouette_from_mask(before_crop)
    after_shape = base._silhouette_from_mask(after_crop)
    if before_shape.area < MIN_LOCAL_ALPHA_PIXELS or after_shape.area < MIN_LOCAL_ALPHA_PIXELS:
        return BandEvidence(
            index, center_y, top, bottom, 0, 0, 0.0, 0.0, 0.0,
            False, "region-insufficient-alpha", 0,
        )

    dx, dy, score, zero_score, candidate_count = base._search_registration_offset(
        before_crop,
        after_crop,
        horizontal_radius,
        vertical_radius,
    )
    if not math.isfinite(score) or not math.isfinite(zero_score):
        reason = "region-score-nonfinite"
    else:
        improvement = score - zero_score
        if score < minimum_score:
            reason = "region-low-confidence"
        elif (dx != 0 or dy != 0) and improvement < minimum_improvement:
            reason = "region-low-improvement"
        else:
            reason = None
    improvement = score - zero_score if math.isfinite(score) and math.isfinite(zero_score) else 0.0
    return BandEvidence(
        index=index,
        center_y=center_y,
        window_top=top,
        window_bottom=bottom,
        selected_dx=dx,
        selected_dy=dy,
        score=score if math.isfinite(score) else 0.0,
        zero_offset_score=zero_score if math.isfinite(zero_score) else 0.0,
        improvement=improvement,
        accepted=reason is None,
        rejection_reason=reason,
        candidates_evaluated=candidate_count,
    )


def _offset_distance(left: BandEvidence, right: BandEvidence) -> float:
    return math.hypot(
        right.selected_dx - left.selected_dx,
        right.selected_dy - left.selected_dy,
    )


def _regional_evidence(
    before: Image.Image,
    after: Image.Image,
    amount: float,
    *,
    alpha_threshold: int,
    horizontal_radius: int,
    vertical_radius: int,
    minimum_score: float,
    minimum_improvement: float,
    minimum_valid_bands: int,
    max_adjacent_offset_delta: float,
) -> RegionalEvidence:
    before_mask = base._alpha_mask(before, alpha_threshold)
    after_mask = base._alpha_mask(after, alpha_threshold)
    bbox = _union_alpha_bbox(before_mask, after_mask)
    if bbox is None:
        return RegionalEvidence("region-aware-alpha-registration", tuple(), "regional-empty-alpha", None)

    windows = _band_windows(bbox, before.height)
    bands = tuple(
        _measure_band(
            before_mask,
            after_mask,
            index,
            center,
            top,
            bottom,
            horizontal_radius,
            vertical_radius,
            minimum_score,
            minimum_improvement,
        )
        for index, center, top, bottom in windows
    )
    accepted = [band for band in bands if band.accepted]
    if len(accepted) < minimum_valid_bands:
        return RegionalEvidence(
            "region-aware-alpha-registration",
            bands,
            "regional-insufficient-valid-bands",
            None,
        )

    accepted.sort(key=lambda item: item.center_y)
    for left, right in zip(accepted, accepted[1:]):
        if _offset_distance(left, right) > max_adjacent_offset_delta:
            return RegionalEvidence(
                "region-aware-alpha-registration",
                bands,
                "regional-incoherent-offset-field",
                None,
            )

    before_bbox = before_mask.getbbox()
    after_bbox = after_mask.getbbox()
    for band in accepted:
        before_dx = -amount * band.selected_dx
        before_dy = -amount * band.selected_dy
        after_dx = (1.0 - amount) * band.selected_dx
        after_dy = (1.0 - amount) * band.selected_dy
        if not (
            base._translated_bbox_fits(before_bbox, before_dx, before_dy, before.width, before.height)
            and base._translated_bbox_fits(after_bbox, after_dx, after_dy, after.width, after.height)
        ):
            return RegionalEvidence(
                "region-aware-alpha-registration",
                bands,
                "regional-warp-would-clip-opaque-bounds",
                None,
            )

    return RegionalEvidence("region-aware-alpha-registration", bands, None, None)


def _gradient_mask(width: int, height: int, start_y: float, end_y: float) -> Image.Image:
    if end_y <= start_y:
        end_y = start_y + 1.0
    values = []
    for y in range(height):
        if y <= start_y:
            value = 0
        elif y >= end_y:
            value = 255
        else:
            value = int(round(255.0 * (y - start_y) / (end_y - start_y)))
        values.append(value)
    column = Image.new("L", (1, height))
    column.putdata(values)
    return column.resize((width, height), Image.Resampling.NEAREST)


def _regional_warp(image: Image.Image, accepted_bands: list[BandEvidence], scale: float) -> Image.Image:
    accepted = sorted(accepted_bands, key=lambda item: item.center_y)
    warped = [
        base._translate_premultiplied(
            image,
            scale * band.selected_dx,
            scale * band.selected_dy,
        )
        for band in accepted
    ]
    result = warped[0]
    for index in range(1, len(warped)):
        previous = accepted[index - 1]
        current = accepted[index]
        mask = _gradient_mask(
            image.width,
            image.height,
            previous.center_y,
            current.center_y,
        )
        result = Image.composite(warped[index], result, mask)
    return result


def interpolate_images(
    before: Image.Image,
    after: Image.Image,
    amount: float,
    *,
    alpha_threshold: int = base.DEFAULT_ALPHA_THRESHOLD,
    horizontal_radius: int = base.DEFAULT_HORIZONTAL_RADIUS,
    vertical_radius: int = base.DEFAULT_VERTICAL_RADIUS,
    minimum_score: float = base.DEFAULT_MINIMUM_SCORE,
    minimum_improvement: float = base.DEFAULT_MINIMUM_IMPROVEMENT,
    minimum_valid_bands: int = DEFAULT_MINIMUM_VALID_BANDS,
    max_adjacent_offset_delta: float = DEFAULT_MAX_ADJACENT_OFFSET_DELTA,
):
    if before.size != after.size:
        raise ProducerError("Endpoint dimensions must match exactly")
    if not (0.0 <= amount <= 1.0):
        raise ProducerError("Interpolation amount must be between 0 and 1 inclusive")
    if minimum_valid_bands < 2 or minimum_valid_bands > DEFAULT_BAND_COUNT:
        raise ProducerError("Minimum valid bands must be between 2 and 4")
    if max_adjacent_offset_delta <= 0:
        raise ProducerError("Maximum adjacent offset delta must be positive")

    before_rgba = before.convert("RGBA")
    after_rgba = after.convert("RGBA")
    if amount == 0.0:
        evidence = RegionalEvidence("endpoint", tuple(), None, None)
        return before_rgba.copy(), evidence
    if amount == 1.0:
        evidence = RegionalEvidence("endpoint", tuple(), None, None)
        return after_rgba.copy(), evidence

    evidence = _regional_evidence(
        before_rgba,
        after_rgba,
        amount,
        alpha_threshold=alpha_threshold,
        horizontal_radius=horizontal_radius,
        vertical_radius=vertical_radius,
        minimum_score=minimum_score,
        minimum_improvement=minimum_improvement,
        minimum_valid_bands=minimum_valid_bands,
        max_adjacent_offset_delta=max_adjacent_offset_delta,
    )
    accepted = [band for band in evidence.bands if band.accepted]
    if evidence.fallback_reason is not None:
        output, global_evidence = base.interpolate_images(
            before_rgba,
            after_rgba,
            amount,
            alpha_threshold=alpha_threshold,
            horizontal_radius=horizontal_radius,
            vertical_radius=vertical_radius,
            minimum_score=minimum_score,
            minimum_improvement=minimum_improvement,
        )
        evidence = RegionalEvidence(
            evidence.method,
            evidence.bands,
            evidence.fallback_reason,
            global_evidence,
        )
        return output, evidence

    before_p = _regional_warp(before_rgba, accepted, -amount)
    after_p = _regional_warp(after_rgba, accepted, 1.0 - amount)
    blended = Image.blend(before_p, after_p, amount)
    return base._clear_transparent_rgb(blended.convert("RGBA")), evidence


def _band_receipt(band: BandEvidence) -> dict[str, object]:
    return {
        "index": band.index,
        "centerY": round(band.center_y, 6),
        "window": {"top": band.window_top, "bottom": band.window_bottom},
        "selectedOffsetPixels": {"x": band.selected_dx, "y": band.selected_dy},
        "score": round(band.score, 12),
        "zeroOffsetScore": round(band.zero_offset_score, 12),
        "scoreImprovement": round(band.improvement, 12),
        "accepted": band.accepted,
        "rejectionReason": band.rejection_reason,
        "fullResolutionCandidatesEvaluated": band.candidates_evaluated,
    }


def _global_receipt(evidence) -> dict[str, object] | None:
    if evidence is None:
        return None
    return {
        "selectedOffsetPixels": {"x": evidence.selected_dx, "y": evidence.selected_dy},
        "score": round(evidence.score, 12),
        "zeroOffsetScore": round(evidence.zero_offset_score, 12),
        "scoreImprovement": round(evidence.improvement, 12),
        "fallbackReason": evidence.fallback_reason,
        "registered": evidence.fallback_reason is None,
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
    evidence: RegionalEvidence,
    producer_commit: str,
    producer_tool_blob_sha1: str,
    minimum_valid_bands: int,
    max_adjacent_offset_delta: float,
) -> dict[str, object]:
    fallback_used = evidence.fallback_reason is not None
    return {
        "schema": RECEIPT_SCHEMA,
        "frameId": frame_id,
        "producer": {
            "repository": "EVAVO-STUDIO/evavo-art-studio",
            "tool": "tools/region_aware_alpha_interpolate.py",
            "version": TOOL_VERSION,
            "commit": producer_commit,
            "toolGitBlobSha1": producer_tool_blob_sha1,
            "mode": "deterministic-local-no-network",
            "baseProducer": "tools/motion_aware_alpha_interpolate.py",
        },
        "endpoints": {
            "before": base._source_record(before_data, before_image),
            "after": base._source_record(after_data, after_image),
        },
        "timing": {
            "amount": amount,
            "method": "linear",
            "endpointPixelIdentityPreserved": amount in (0.0, 1.0),
        },
        "regionalRegistration": {
            "method": evidence.method,
            "bandCount": len(evidence.bands),
            "minimumValidBands": minimum_valid_bands,
            "acceptedBandCount": sum(1 for band in evidence.bands if band.accepted),
            "maxAdjacentOffsetDeltaPixels": max_adjacent_offset_delta,
            "bands": [_band_receipt(band) for band in evidence.bands],
            "fallbackUsed": fallback_used,
            "fallbackReason": evidence.fallback_reason,
            "globalFallback": _global_receipt(evidence.global_evidence),
        },
        "interpolation": {
            "method": (
                "region-aware-premultiplied-alpha-linear-interpolation"
                if not fallback_used
                else "v1-global-motion-aware-fallback"
            ),
            "smoothVerticalOffsetField": not fallback_used,
            "premultipliedAlpha": True,
            "clearTransparentRgb": True,
            "colorSpace": "sRGB",
            "rescaleEndpoints": False,
            "cropEndpoints": False,
            "rotation": False,
            "shear": False,
        },
        "output": {
            "sha256": base._sha256(output_data),
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
            "creativeApproval": False,
            "runtimeActivation": False,
        },
    }


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deterministic region-aware alpha interpolation for reviewed EVA poses."
    )
    parser.add_argument("--source-before", type=Path, required=True)
    parser.add_argument("--source-after", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--frame-id", required=True)
    parser.add_argument("--amount", type=float, required=True)
    parser.add_argument("--producer-commit", required=True)
    parser.add_argument("--producer-tool-blob-sha1", required=True)
    parser.add_argument("--expected-width", type=int, default=base.DEFAULT_EXPECTED_WIDTH)
    parser.add_argument("--expected-height", type=int, default=base.DEFAULT_EXPECTED_HEIGHT)
    parser.add_argument("--alpha-threshold", type=int, default=base.DEFAULT_ALPHA_THRESHOLD)
    parser.add_argument("--horizontal-radius", type=int, default=base.DEFAULT_HORIZONTAL_RADIUS)
    parser.add_argument("--vertical-radius", type=int, default=base.DEFAULT_VERTICAL_RADIUS)
    parser.add_argument("--minimum-score", type=float, default=base.DEFAULT_MINIMUM_SCORE)
    parser.add_argument("--minimum-improvement", type=float, default=base.DEFAULT_MINIMUM_IMPROVEMENT)
    parser.add_argument("--minimum-valid-bands", type=int, default=DEFAULT_MINIMUM_VALID_BANDS)
    parser.add_argument("--max-adjacent-offset-delta", type=float, default=DEFAULT_MAX_ADJACENT_OFFSET_DELTA)
    return parser.parse_args(argv)


def run(argv: Iterable[str] | None = None) -> dict[str, object]:
    args = _parse_args(argv)
    if not base.SAFE_FRAME_ID_RE.fullmatch(args.frame_id):
        raise ProducerError("Frame id is invalid")
    if not base.SHA1_RE.fullmatch(args.producer_commit):
        raise ProducerError("Producer commit must be a lowercase 40-character SHA-1")
    if not base.SHA1_RE.fullmatch(args.producer_tool_blob_sha1):
        raise ProducerError("Producer tool blob must be a lowercase 40-character SHA-1")

    resolved_output = args.output.resolve(strict=False)
    resolved_receipt = args.receipt.resolve(strict=False)
    endpoint_paths = {
        args.source_before.resolve(strict=False),
        args.source_after.resolve(strict=False),
    }
    if resolved_output in endpoint_paths or resolved_receipt in endpoint_paths:
        raise ProducerError("Output and receipt must not overwrite reviewed endpoints")

    tool_data = Path(__file__).resolve().read_bytes()
    actual_tool_blob = base._git_blob_sha1(tool_data)
    if actual_tool_blob != args.producer_tool_blob_sha1:
        raise ProducerError(
            "Producer tool bytes do not match --producer-tool-blob-sha1 "
            f"(expected {args.producer_tool_blob_sha1}, got {actual_tool_blob})"
        )

    before_data = base._read_regular_file(args.source_before, "Before source")
    after_data = base._read_regular_file(args.source_after, "After source")
    before_image = base._load_rgba(before_data, "Before source")
    after_image = base._load_rgba(after_data, "After source")
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
        minimum_valid_bands=args.minimum_valid_bands,
        max_adjacent_offset_delta=args.max_adjacent_offset_delta,
    )
    output_data = base._encode_png(output_image)
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
        minimum_valid_bands=args.minimum_valid_bands,
        max_adjacent_offset_delta=args.max_adjacent_offset_delta,
    )
    receipt_data = base._canonical_json_bytes(receipt)
    base._reserve_and_write_pair(args.output, output_data, args.receipt, receipt_data)
    return receipt


def main(argv: Iterable[str] | None = None) -> int:
    try:
        receipt = run(argv)
    except (ProducerError, base.ProducerError) as exc:
        print(f"region-aware alpha interpolation failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": "passed",
        "schema": receipt["schema"],
        "frameId": receipt["frameId"],
        "outputSha256": receipt["output"]["sha256"],
        "fallbackUsed": receipt["regionalRegistration"]["fallbackUsed"],
        "acceptedBandCount": receipt["regionalRegistration"]["acceptedBandCount"],
        "repositoryMutation": False,
        "network": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
