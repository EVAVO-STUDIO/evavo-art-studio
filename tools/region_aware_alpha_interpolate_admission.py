#!/usr/bin/env python3
"""Admission-compatible region-aware interpolation for reviewed EVA transitions.

The pixel producer is region_aware_alpha_interpolate.py. This wrapper preserves the
established evavo.motion-aware-alpha-interpolation-receipt.v1 admission surface so
existing Runtime verification remains independent and fail-closed, while extending
the receipt with explicit regional evidence. Both the region-aware producer and its
v1 global fallback are byte-verified before any output is written.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Iterable

REGION_TOOL_BLOB_SHA1 = "5ad3e97d4e653a11418603f3f7b40fc7644689b6"
BASE_TOOL_BLOB_SHA1 = "e5e4a2d24d2b82d31356c0a8adbf1d4a3f64deb4"
TOOL_VERSION = "2.1.0"
RECEIPT_SCHEMA = "evavo.motion-aware-alpha-interpolation-receipt.v1"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load producer dependency: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_THIS_DIR = Path(__file__).resolve().parent
region = _load_module("evavo_region_alpha_v2", _THIS_DIR / "region_aware_alpha_interpolate.py")
base = region.base


class ProducerError(base.ProducerError):
    """Stable expected failure for the admission producer."""


def _verify_dependency_bytes() -> None:
    region_bytes = (Path(region.__file__).resolve()).read_bytes()
    base_bytes = (Path(base.__file__).resolve()).read_bytes()
    actual_region = base._git_blob_sha1(region_bytes)
    actual_base = base._git_blob_sha1(base_bytes)
    if actual_region != REGION_TOOL_BLOB_SHA1:
        raise ProducerError(
            "Region-aware producer dependency drifted "
            f"(expected {REGION_TOOL_BLOB_SHA1}, got {actual_region})"
        )
    if actual_base != BASE_TOOL_BLOB_SHA1:
        raise ProducerError(
            "Global motion-aware fallback dependency drifted "
            f"(expected {BASE_TOOL_BLOB_SHA1}, got {actual_base})"
        )


def _band_record(band) -> dict[str, object]:
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


def _registration_summary(evidence) -> dict[str, object]:
    accepted = [band for band in evidence.bands if band.accepted]
    regional_used = evidence.fallback_reason is None and bool(accepted)
    global_evidence = evidence.global_evidence

    if regional_used:
        selected_x = int(round(sum(band.selected_dx for band in accepted) / len(accepted)))
        selected_y = int(round(sum(band.selected_dy for band in accepted) / len(accepted)))
        score = min(band.score for band in accepted)
        zero_score = min(band.zero_offset_score for band in accepted)
        improvement = min(band.improvement for band in accepted)
        registered = True
        fallback_used = False
        fallback_reason = None
        strategy = "four-band-local-alpha-registration-with-smooth-vertical-warp"
        candidate_count = sum(band.candidates_evaluated for band in accepted)
    elif global_evidence is not None:
        selected_x = global_evidence.selected_dx
        selected_y = global_evidence.selected_dy
        score = global_evidence.score
        zero_score = global_evidence.zero_offset_score
        improvement = global_evidence.improvement
        registered = global_evidence.fallback_reason is None
        fallback_used = not registered
        fallback_reason = global_evidence.fallback_reason
        strategy = "v1-global-alpha-registration-after-regional-rejection"
        candidate_count = global_evidence.full_resolution_candidates_evaluated
    else:
        selected_x = selected_y = 0
        score = zero_score = improvement = 1.0
        registered = True
        fallback_used = False
        fallback_reason = None
        strategy = "exact-endpoint"
        candidate_count = 0

    return {
        "method": (
            "region-aware-alpha-registration"
            if regional_used
            else "alpha-silhouette-bounded-translation-registration"
        ),
        "selectedOffsetPixels": {"x": selected_x, "y": selected_y},
        "score": round(score, 12),
        "zeroOffsetScore": round(zero_score, 12),
        "scoreImprovement": round(improvement, 12),
        "registered": registered,
        "fallbackUsed": fallback_used,
        "fallbackReason": fallback_reason,
        "search": {
            "strategy": strategy,
            "fullResolutionCandidatesEvaluated": candidate_count,
        },
        "regional": {
            "attempted": evidence.method != "endpoint",
            "used": regional_used,
            "fallbackReason": evidence.fallback_reason,
            "bandCount": len(evidence.bands),
            "acceptedBandCount": len(accepted),
            "bands": [_band_record(band) for band in evidence.bands],
        },
    }


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Admission-compatible deterministic region-aware interpolation."
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
    parser.add_argument("--minimum-valid-bands", type=int, default=region.DEFAULT_MINIMUM_VALID_BANDS)
    parser.add_argument("--max-adjacent-offset-delta", type=float, default=region.DEFAULT_MAX_ADJACENT_OFFSET_DELTA)
    return parser.parse_args(argv)


def run(argv: Iterable[str] | None = None) -> dict[str, object]:
    args = _parse_args(argv)
    if not base.SAFE_FRAME_ID_RE.fullmatch(args.frame_id):
        raise ProducerError("Frame id is invalid")
    if not base.SHA1_RE.fullmatch(args.producer_commit):
        raise ProducerError("Producer commit must be a lowercase 40-character SHA-1")
    if not base.SHA1_RE.fullmatch(args.producer_tool_blob_sha1):
        raise ProducerError("Producer tool blob must be a lowercase 40-character SHA-1")

    tool_data = Path(__file__).resolve().read_bytes()
    actual_tool_blob = base._git_blob_sha1(tool_data)
    if actual_tool_blob != args.producer_tool_blob_sha1:
        raise ProducerError(
            "Admission producer bytes do not match --producer-tool-blob-sha1 "
            f"(expected {args.producer_tool_blob_sha1}, got {actual_tool_blob})"
        )
    _verify_dependency_bytes()

    resolved_output = args.output.resolve(strict=False)
    resolved_receipt = args.receipt.resolve(strict=False)
    endpoint_paths = {
        args.source_before.resolve(strict=False),
        args.source_after.resolve(strict=False),
    }
    if resolved_output in endpoint_paths or resolved_receipt in endpoint_paths:
        raise ProducerError("Output and receipt must not overwrite reviewed endpoints")

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

    output_image, evidence = region.interpolate_images(
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
    registration = _registration_summary(evidence)
    interpolation_method = (
        "registered-premultiplied-alpha-linear-interpolation"
        if registration["registered"]
        else "premultiplied-alpha-linear-interpolation"
    )
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "frameId": args.frame_id,
        "producer": {
            "repository": "EVAVO-STUDIO/evavo-art-studio",
            "tool": "tools/region_aware_alpha_interpolate_admission.py",
            "version": TOOL_VERSION,
            "commit": args.producer_commit,
            "toolGitBlobSha1": args.producer_tool_blob_sha1,
            "mode": "deterministic-local-no-network",
            "dependencies": {
                "regionAwareTool": {
                    "path": "tools/region_aware_alpha_interpolate.py",
                    "gitBlobSha1": REGION_TOOL_BLOB_SHA1,
                },
                "globalFallbackTool": {
                    "path": "tools/motion_aware_alpha_interpolate.py",
                    "gitBlobSha1": BASE_TOOL_BLOB_SHA1,
                },
            },
        },
        "endpoints": {
            "before": base._source_record(before_data, before_image),
            "after": base._source_record(after_data, after_image),
        },
        "timing": {
            "amount": args.amount,
            "method": "linear",
            "endpointPixelIdentityPreserved": args.amount in (0.0, 1.0),
        },
        "registration": registration,
        "interpolation": {
            "method": interpolation_method,
            "regionalWarpUsed": registration["regional"]["used"],
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
    receipt_data = base._canonical_json_bytes(receipt)
    base._reserve_and_write_pair(args.output, output_data, args.receipt, receipt_data)
    return receipt


def main(argv: Iterable[str] | None = None) -> int:
    try:
        receipt = run(argv)
    except (ProducerError, base.ProducerError) as exc:
        print(f"region-aware admission interpolation failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": "passed",
        "schema": receipt["schema"],
        "frameId": receipt["frameId"],
        "outputSha256": receipt["output"]["sha256"],
        "registered": receipt["registration"]["registered"],
        "fallbackUsed": receipt["registration"]["fallbackUsed"],
        "regionalWarpUsed": receipt["registration"]["regional"]["used"],
        "repositoryMutation": False,
        "network": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
