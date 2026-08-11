#!/usr/bin/env python3
"""Validate and publish exact final-to-first animation seam evidence."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageChops
except ImportError as exc:  # pragma: no cover
    raise SystemExit(f"Pillow is unavailable: {exc}")

PLAN_SCHEMA = "evavo.project-art-loop-closure-plan.v1"
REVIEW_SCHEMA = "evavo.project-art-loop-closure-review.v1"
RECEIPT_SCHEMA = "evavo.project-art-loop-closure-receipt.v1"
PROCESSOR_ID = "python-pillow-project-art-loop-closure"
LIMITS = {
    "maximumRequestBytes": 16 * 1024 * 1024,
    "maximumSourceBytes": 512 * 1024 * 1024,
    "maximumTotalSourceBytes": 2 * 1024 * 1024 * 1024,
    "maximumDecodedPixels": 220_000_000,
    "maximumFrames": 1_000,
}
MAXIMUM_PLAN_BYTES = 32 * 1024 * 1024
SHA256_CHARS = set("0123456789abcdef")
AUTHORITY_KEYS = (
    "providerExecution",
    "sourceMutation",
    "sourceDeletion",
    "candidateApproval",
    "candidatePromotion",
    "targetRepositoryMutation",
    "gitCommit",
    "gitPush",
    "publication",
    "deployment",
    "forcePush",
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
Image.MAX_IMAGE_PIXELS = LIMITS["maximumDecodedPixels"]


class LoopClosureError(ValueError):
    """Stable fail-closed loop-closure error."""


def fail(code: str, message: str | None = None) -> None:
    raise LoopClosureError(f"{code}: {message or code}")


def is_record(value: Any) -> bool:
    return isinstance(value, dict)


def exact_keys(value: Any, expected: set[str], code: str, label: str) -> dict[str, Any]:
    if not is_record(value) or set(value) != expected:
        fail(code, f"{label} keys are invalid")
    return value


def canonical_json(value: Any) -> str:
    if value is None or isinstance(value, (str, bool)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            fail("PROJECT_ART_LOOP_CLOSURE_CANONICAL_JSON_INVALID")
        if value == 0:
            return "0"
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if is_record(value):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical_json(value[key])
            for key in sorted(value)
        ) + "}"
    fail("PROJECT_ART_LOOP_CLOSURE_CANONICAL_JSON_INVALID")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(value: Path, maximum_bytes: int) -> tuple[str, int]:
    metadata = value.stat()
    if metadata.st_size < 1 or metadata.st_size > maximum_bytes:
        fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", str(value))
    digest = hashlib.sha256()
    observed = 0
    with value.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            observed += len(chunk)
            if observed > maximum_bytes:
                fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", str(value))
            digest.update(chunk)
    after = value.stat()
    if (
        after.st_size != metadata.st_size
        or after.st_mtime_ns != metadata.st_mtime_ns
        or after.st_ctime_ns != metadata.st_ctime_ns
        or after.st_ino != metadata.st_ino
        or after.st_dev != metadata.st_dev
        or observed != metadata.st_size
    ):
        fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", str(value))
    return digest.hexdigest(), observed


def validate_hash(document: dict[str, Any]) -> str:
    digest = document.get("documentSha256")
    if (
        not isinstance(digest, str)
        or len(digest) != 64
        or any(character not in SHA256_CHARS for character in digest)
    ):
        fail("PROJECT_ART_LOOP_CLOSURE_DOCUMENT_HASH_INVALID")
    unsigned = dict(document)
    unsigned.pop("documentSha256", None)
    observed = sha256_bytes(canonical_json(unsigned).encode("utf-8"))
    if observed != digest:
        fail("PROJECT_ART_LOOP_CLOSURE_DOCUMENT_HASH_MISMATCH")
    return digest


def with_hash(document: dict[str, Any]) -> dict[str, Any]:
    unsigned = dict(document)
    unsigned.pop("documentSha256", None)
    unsigned["documentSha256"] = sha256_bytes(canonical_json(unsigned).encode("utf-8"))
    return unsigned


def require_workspace(value: Path) -> Path:
    lexical = Path(os.path.abspath(value))
    if lexical.is_symlink() or not lexical.is_dir():
        fail("PROJECT_ART_LOOP_CLOSURE_DIRECTORY_UNSAFE", str(lexical))
    return lexical.resolve(strict=True)


def canonical_relative(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 4096
        or "\\" in value
        or "\x00" in value
    ):
        fail("PROJECT_ART_LOOP_CLOSURE_PATH_INVALID", label)
    candidate = Path(value)
    if candidate.is_absolute() or ".." in candidate.parts or candidate.as_posix() != value:
        fail("PROJECT_ART_LOOP_CLOSURE_PATH_INVALID", label)
    return value


def secure_file(root: Path, relative: str, label: str) -> Path:
    canonical = canonical_relative(relative, label)
    current = root
    for segment in Path(canonical).parts:
        current = current / segment
        if current.is_symlink():
            fail("PROJECT_ART_LOOP_CLOSURE_PATH_SYMLINK", label)
    if not current.is_file() or current.is_symlink():
        fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", label)
    metadata = current.stat()
    if metadata.st_nlink != 1:
        fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", label)
    resolved = current.resolve(strict=True)
    try:
        resolved.relative_to(root)
    except ValueError:
        fail("PROJECT_ART_LOOP_CLOSURE_PATH_ESCAPE", label)
    return resolved


def read_plan(root: Path, value: Path) -> dict[str, Any]:
    lexical = Path(os.path.abspath(value if value.is_absolute() else root / value))
    try:
        lexical.relative_to(root)
    except ValueError:
        fail("PROJECT_ART_LOOP_CLOSURE_PATH_ESCAPE", "plan")
    plan_path = secure_file(root, lexical.relative_to(root).as_posix(), "plan")
    if plan_path.stat().st_size > MAXIMUM_PLAN_BYTES:
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID")
    try:
        text = plan_path.read_bytes().decode("utf-8", errors="strict")
        plan = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError):
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID")
    if not is_record(plan):
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID")
    validate_hash(plan)
    return plan


def output_root(root: Path, value: Path) -> Path:
    lexical = Path(os.path.abspath(value if value.is_absolute() else root / value))
    try:
        relation = lexical.relative_to(root)
    except ValueError:
        fail("PROJECT_ART_LOOP_CLOSURE_PATH_ESCAPE", "output-root")
    if relation == Path(".") or lexical.exists() or lexical.is_symlink():
        fail("PROJECT_ART_LOOP_CLOSURE_OUTPUT_INVALID")
    parent = lexical.parent
    if not parent.is_dir() or parent.is_symlink():
        fail("PROJECT_ART_LOOP_CLOSURE_OUTPUT_INVALID")
    current = root
    for segment in parent.relative_to(root).parts:
        current = current / segment
        if current.is_symlink():
            fail("PROJECT_ART_LOOP_CLOSURE_PATH_SYMLINK", "output-root")
    return lexical


def png_header(value: Path) -> dict[str, Any]:
    with value.open("rb") as handle:
        header = handle.read(33)
    if (
        len(header) != 33
        or header[:8] != PNG_SIGNATURE
        or int.from_bytes(header[8:12], "big") != 13
        or header[12:16] != b"IHDR"
    ):
        fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", str(value))
    width = int.from_bytes(header[16:20], "big")
    height = int.from_bytes(header[20:24], "big")
    bit_depth = header[24]
    colour_type = header[25]
    interlaced = header[28] == 1
    if width < 1 or height < 1 or width * height > LIMITS["maximumDecodedPixels"]:
        fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", str(value))
    return {
        "format": "png",
        "width": width,
        "height": height,
        "bitDepth": bit_depth,
        "colourType": colour_type,
        "alphaChannel": colour_type in (4, 6),
        "interlaced": interlaced,
    }


def validate_authority(value: Any) -> dict[str, bool]:
    exact_keys(value, set(AUTHORITY_KEYS), "PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID", "authority")
    if any(value[key] is not False for key in AUTHORITY_KEYS):
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID", "false authority is required")
    return {key: False for key in AUTHORITY_KEYS}


def validate_plan(plan: dict[str, Any], workspace: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    exact_keys(
        plan,
        {
            "schema", "reviewId", "projectId", "purpose", "compiledAt",
            "requestSha256", "workspace", "frames", "seam", "expected",
            "thresholds", "preview", "limits", "execution", "authority",
            "documentSha256",
        },
        "PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID",
        "plan",
    )
    if plan["schema"] != PLAN_SCHEMA:
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID")
    if plan["limits"] != LIMITS:
        fail("PROJECT_ART_LOOP_CLOSURE_LIMIT_DRIFT")
    expected_workspace = {
        "root": str(workspace),
        "sourcePathsAreRelative": True,
        "symbolicLinksAllowed": False,
    }
    if plan["workspace"] != expected_workspace:
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID", "workspace binding drifted")
    if plan["execution"] != {
        "runtime": "python-pillow-loop-closure",
        "entrypoint": "tools/run_project_art_loop_closure.py",
        "outputRootMustNotExist": True,
        "wholeRunAtomicPublication": True,
        "createOnlyReceipt": True,
        "sourceHashesRevalidatedBeforeExecution": True,
        "sourceHashesRevalidatedAfterExecution": True,
        "requiresExplicitExecution": True,
    }:
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID", "execution contract drifted")
    validate_authority(plan["authority"])
    frames = plan["frames"]
    if not isinstance(frames, list) or not 2 <= len(frames) <= LIMITS["maximumFrames"]:
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID", "frame count drifted")
    if plan["seam"] != {
        "fromFrameIndex": len(frames) - 1,
        "toFrameIndex": 0,
        "identicalClosureAccepted": True,
    }:
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID", "seam drifted")
    thresholds = plan["thresholds"]
    exact_keys(
        thresholds,
        {
            "maximumChangedFraction", "maximumMeanChannelDelta",
            "maximumAlphaChangedFraction", "maximumCentroidShiftPixels",
        },
        "PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID",
        "thresholds",
    )
    for key, maximum in (
        ("maximumChangedFraction", 1),
        ("maximumMeanChannelDelta", 255),
        ("maximumAlphaChangedFraction", 1),
        ("maximumCentroidShiftPixels", 1_000_000),
    ):
        value = thresholds[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= maximum:
            fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID", key)
    preview = plan["preview"]
    if set(preview) != {"difference", "overlay", "onionSkin"} or any(
        not isinstance(preview[key], bool) for key in preview
    ):
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID", "preview")
    expected = plan["expected"]
    if set(expected) != {"width", "height", "requireAlpha"}:
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID", "expected")
    return frames, plan


def frame_identity(root: Path, frame: dict[str, Any], index: int) -> tuple[Path, dict[str, Any]]:
    exact_keys(
        frame,
        {"frameIndex", "path", "sha256", "bytes", "mediaType", "image"},
        "PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID",
        f"frames[{index}]",
    )
    if frame["frameIndex"] != index or frame["mediaType"] != "image/png":
        fail("PROJECT_ART_LOOP_CLOSURE_PLAN_INVALID", f"frames[{index}]")
    value = secure_file(root, frame["path"], f"frames[{index}]")
    observed_hash, observed_bytes = sha256_file(value, LIMITS["maximumSourceBytes"])
    observed_header = png_header(value)
    if (
        observed_hash != frame["sha256"]
        or observed_bytes != frame["bytes"]
        or observed_header != frame["image"]
    ):
        fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", frame["path"])
    return value, {
        "frameIndex": index,
        "path": frame["path"],
        "sha256": observed_hash,
        "bytes": observed_bytes,
        "image": observed_header,
    }


def alpha_centroid(image: Image.Image) -> dict[str, float] | None:
    alpha = image.getchannel("A")
    values = alpha.tobytes()
    width, height = image.size
    total = weighted_x = weighted_y = 0
    for y in range(height):
        offset = y * width
        for x in range(width):
            weight = values[offset + x]
            total += weight
            weighted_x += x * weight
            weighted_y += y * weight
    if total == 0:
        return None
    return {"x": weighted_x / total, "y": weighted_y / total}


def metrics(first: Image.Image, last: Image.Image) -> tuple[dict[str, Any], Image.Image]:
    if first.size != last.size:
        fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", "seam dimensions")
    first_rgba = first.convert("RGBA")
    last_rgba = last.convert("RGBA")
    difference = ImageChops.difference(last_rgba, first_rgba)
    first_bytes = first_rgba.tobytes()
    last_bytes = last_rgba.tobytes()
    pixels = first_rgba.width * first_rgba.height
    changed = alpha_changed = total_delta = maximum_delta = 0
    for offset in range(0, len(first_bytes), 4):
        deltas = [abs(last_bytes[offset + channel] - first_bytes[offset + channel]) for channel in range(4)]
        if any(deltas):
            changed += 1
        if deltas[3]:
            alpha_changed += 1
        total_delta += sum(deltas)
        maximum_delta = max(maximum_delta, *deltas)
    first_centroid = alpha_centroid(first_rgba)
    last_centroid = alpha_centroid(last_rgba)
    centroid_shift = None
    if first_centroid and last_centroid:
        centroid_shift = math.dist(
            (first_centroid["x"], first_centroid["y"]),
            (last_centroid["x"], last_centroid["y"]),
        )
    result = {
        "identical": first_bytes == last_bytes,
        "changedPixelFraction": changed / pixels,
        "meanChannelDelta": total_delta / (pixels * 4),
        "maximumChannelDelta": maximum_delta,
        "alphaChangedFraction": alpha_changed / pixels,
        "firstAlphaCentroid": first_centroid,
        "lastAlphaCentroid": last_centroid,
        "alphaCentroidShiftPixels": centroid_shift,
        "firstPixelSha256": sha256_bytes(first_bytes),
        "lastPixelSha256": sha256_bytes(last_bytes),
    }
    first_rgba.close()
    last_rgba.close()
    return result, difference


def issue_list(observed: dict[str, Any], thresholds: dict[str, Any]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    checks = (
        ("changedPixelFraction", "maximumChangedFraction", "loop-closure-excessive-frame-change"),
        ("meanChannelDelta", "maximumMeanChannelDelta", "loop-closure-mean-channel-delta-exceeded"),
        ("alphaChangedFraction", "maximumAlphaChangedFraction", "loop-closure-alpha-change-exceeded"),
        ("alphaCentroidShiftPixels", "maximumCentroidShiftPixels", "loop-closure-centroid-shift-exceeded"),
    )
    for metric_key, threshold_key, code in checks:
        value = observed[metric_key]
        if value is not None and value > thresholds[threshold_key]:
            issues.append({
                "code": code,
                "observed": value,
                "maximum": thresholds[threshold_key],
            })
    return issues


def create_only_json(value: Path, document: dict[str, Any]) -> None:
    payload = (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    descriptor = os.open(value, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        os.close(descriptor)


def output_record(root: Path, value: Path, role: str) -> dict[str, Any]:
    digest, size = sha256_file(value, LIMITS["maximumSourceBytes"])
    return {
        "role": role,
        "path": value.relative_to(root).as_posix(),
        "sha256": digest,
        "bytes": size,
    }


def execute(workspace: Path, plan: dict[str, Any], output: Path) -> dict[str, Any]:
    frames, plan = validate_plan(plan, workspace)
    identities: list[dict[str, Any]] = []
    resolved: list[Path] = []
    total_bytes = total_pixels = 0
    for index, frame in enumerate(frames):
        source, identity = frame_identity(workspace, frame, index)
        resolved.append(source)
        identities.append(identity)
        total_bytes += identity["bytes"]
        total_pixels += identity["image"]["width"] * identity["image"]["height"]
        if total_bytes > LIMITS["maximumTotalSourceBytes"] or total_pixels > LIMITS["maximumDecodedPixels"]:
            fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", "aggregate boundary")

    first_path = resolved[plan["seam"]["toFrameIndex"]]
    last_path = resolved[plan["seam"]["fromFrameIndex"]]
    with Image.open(first_path) as opened_first, Image.open(last_path) as opened_last:
        opened_first.load()
        opened_last.load()
        first = opened_first.convert("RGBA")
        last = opened_last.convert("RGBA")
    try:
        expected = plan["expected"]
        if expected["width"] is not None and (
            first.width != expected["width"] or first.height != expected["height"]
        ):
            fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", "expected canvas")
        if expected["requireAlpha"] and (
            first.getchannel("A").getextrema() == (255, 255)
            or last.getchannel("A").getextrema() == (255, 255)
        ):
            fail("PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH", "meaningful alpha is required")
        observed, difference = metrics(first, last)
        issues = issue_list(observed, plan["thresholds"])
        status = "passed" if not issues else "blocked"
        review = with_hash({
            "schema": REVIEW_SCHEMA,
            "reviewId": plan["reviewId"],
            "projectId": plan["projectId"],
            "planSha256": plan["documentSha256"],
            "status": status,
            "seam": plan["seam"],
            "frames": [
                identities[plan["seam"]["fromFrameIndex"]],
                identities[plan["seam"]["toFrameIndex"]],
            ],
            "thresholds": plan["thresholds"],
            "metrics": observed,
            "issues": issues,
            "creativeApprovalPerformed": False,
            "runtimeApprovalPerformed": False,
            "authority": {key: False for key in AUTHORITY_KEYS},
        })

        staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.staging-", dir=output.parent))
        try:
            create_only_json(staging / "loop-closure.json", review)
            records = [output_record(staging, staging / "loop-closure.json", "loop-closure-review")]
            if plan["preview"]["difference"]:
                difference.save(staging / "difference.png", format="PNG")
                records.append(output_record(staging, staging / "difference.png", "loop-closure-difference"))
            if plan["preview"]["overlay"]:
                overlay = Image.blend(last, first, 0.5)
                try:
                    overlay.save(staging / "overlay.png", format="PNG")
                    records.append(output_record(staging, staging / "overlay.png", "loop-closure-overlay"))
                finally:
                    overlay.close()
            if plan["preview"]["onionSkin"]:
                red = Image.new("RGBA", first.size, (255, 0, 0, 0))
                cyan = Image.new("RGBA", first.size, (0, 255, 255, 0))
                onion = Image.new("RGBA", first.size, (0, 0, 0, 255))
                try:
                    red.putalpha(last.getchannel("A").point(lambda value: round(value * 0.45)))
                    cyan.putalpha(first.getchannel("A").point(lambda value: round(value * 0.55)))
                    onion.alpha_composite(red)
                    onion.alpha_composite(cyan)
                    onion.save(staging / "onion-skin.png", format="PNG")
                    records.append(output_record(staging, staging / "onion-skin.png", "loop-closure-onion-skin"))
                finally:
                    red.close()
                    cyan.close()
                    onion.close()

            for index, frame in enumerate(frames):
                frame_identity(workspace, frame, index)

            receipt = with_hash({
                "schema": RECEIPT_SCHEMA,
                "reviewId": plan["reviewId"],
                "projectId": plan["projectId"],
                "processorId": PROCESSOR_ID,
                "planSha256": plan["documentSha256"],
                "reviewSha256": review["documentSha256"],
                "status": status,
                "sourceHashesRevalidatedBeforeExecution": True,
                "sourceHashesRevalidatedAfterExecution": True,
                "wholeRunAtomicPublication": True,
                "outputs": records,
                "authority": {key: False for key in AUTHORITY_KEYS},
            })
            create_only_json(staging / "receipt.json", receipt)
            os.replace(staging, output)
            return receipt
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        finally:
            difference.close()
    finally:
        first.close()
        last.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-root", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output-root", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        workspace = require_workspace(Path(args.workspace_root))
        plan = read_plan(workspace, Path(args.plan))
        output = output_root(workspace, Path(args.output_root))
        receipt = execute(workspace, plan, output)
    except LoopClosureError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception as error:  # pragma: no cover - stable outer boundary
        print(f"PROJECT_ART_LOOP_CLOSURE_RUNTIME_FAILED: {error}", file=sys.stderr)
        return 1
    print("Project Art loop-closure review completed.")
    print(f"- status: {receipt['status']}")
    print(f"- plan SHA-256: {receipt['planSha256']}")
    print(f"- review SHA-256: {receipt['reviewSha256']}")
    print("- sourceHashesRevalidatedBeforeExecution=true")
    print("- sourceHashesRevalidatedAfterExecution=true")
    print("- wholeRunAtomicPublication=true")
    print("- no source, provider, repository, Git, deployment or publication mutation occurred")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
