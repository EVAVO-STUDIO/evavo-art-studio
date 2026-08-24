#!/usr/bin/env python3
"""Build one fixed-grid EVA high-resolution atlas clean master.

The executor preserves the Runtime-authored frame order and rectangles exactly.
It never trims, rotates, resizes, reorders or shelf-packs frames. Every source is
SHA-bound, every decoded RGBA region is reverified after PNG encoding, and the
output directory is create-only and atomic. The result is an intermediate PNG
clean master only, never an approved web-delivery asset.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image
import PIL

PLAN_SCHEMA = "evavo.eva-hires-atlas-clean-master-plan.v1"
MANIFEST_SCHEMA = "evavo.eva-hires-atlas-clean-master-manifest.v1"
RECEIPT_SCHEMA = "evavo.eva-hires-atlas-clean-master-receipt.v1"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
FRAME_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
RELEASE_ID = re.compile(r"^eva-v0\.13\.0-hires-reauthored-r[1-9][0-9]*$")
MAX_PLAN_BYTES = 4 * 1024 * 1024
MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_ATLAS_PIXELS = 40_000_000
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


def pixel_sha(image: Image.Image) -> str:
    return sha256_bytes(image.convert("RGBA").tobytes())


def secure_relative(root: Path, value: Any, label: str, *, must_exist: bool) -> Path:
    if not isinstance(value, str) or not value or "\x00" in value or "\\" in value:
        fail(f"{label} must be a forward-slash workspace-relative path")
    relative = Path(value)
    if relative.is_absolute() or any(part in {"", ".", "..", ".git"} for part in relative.parts):
        fail(f"{label} is not a safe workspace-relative path")
    resolved = (root / relative).resolve(strict=must_exist)
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"{label} escaped workspace") from exc
    current = root
    for part in relative.parts:
        current = current / part
        if current.exists() and current.is_symlink():
            fail(f"{label} contains a symbolic link")
    return resolved


def regular_bytes(path: Path, label: str, maximum: int) -> bytes:
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


def rectangles_overlap(left: dict[str, int], right: dict[str, int]) -> bool:
    return not (
        left["x"] + left["width"] <= right["x"]
        or right["x"] + right["width"] <= left["x"]
        or left["y"] + left["height"] <= right["y"]
        or right["y"] + right["height"] <= left["y"]
    )


def validate_plan(plan: Any) -> tuple[int, int, list[dict[str, Any]]]:
    if not isinstance(plan, dict) or plan.get("schema") != PLAN_SCHEMA:
        fail("plan schema is invalid")
    if plan.get("characterId") != "eva-female":
        fail("plan character identity is invalid")
    release_id = plan.get("candidateReleaseId")
    if not isinstance(release_id, str) or not RELEASE_ID.fullmatch(release_id):
        fail("plan candidate release identity is invalid")
    if plan.get("createOnlyOutput") is not True or plan.get("sourceMutation") is not False:
        fail("plan authority boundary is invalid")
    authority = plan.get("authority")
    if not isinstance(authority, dict) or any(value is not False for value in authority.values()):
        fail("plan authority must remain all false")

    width = strict_int(plan.get("width"), "width", 1, 8192)
    height = strict_int(plan.get("height"), "height", 1, 8192)
    if width * height > MAX_ATLAS_PIXELS:
        fail("atlas exceeds decoded-pixel budget")
    frames = plan.get("frames")
    if not isinstance(frames, list) or len(frames) != 36:
        fail("clean-master plan must contain exactly 36 frames")

    ids: set[str] = set()
    paths: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for index, raw in enumerate(frames):
        if not isinstance(raw, dict):
            fail(f"frames[{index}] must be an object")
        frame_id = raw.get("frameId")
        if not isinstance(frame_id, str) or not FRAME_ID.fullmatch(frame_id) or frame_id in ids:
            fail(f"frames[{index}].frameId is invalid or duplicate")
        source_path = raw.get("sourcePath")
        if not isinstance(source_path, str) or source_path in paths:
            fail(f"frames[{index}].sourcePath is invalid or duplicate")
        source_sha = str(raw.get("sourceSha256") or "")
        if not SHA256.fullmatch(source_sha):
            fail(f"frames[{index}].sourceSha256 is invalid")
        source_bytes = strict_int(raw.get("sourceBytes"), f"frames[{index}].sourceBytes", 1, MAX_SOURCE_BYTES)
        rect = raw.get("rect")
        if not isinstance(rect, dict) or set(rect) != {"x", "y", "width", "height"}:
            fail(f"frames[{index}].rect is invalid")
        normalized_rect = {
            "x": strict_int(rect.get("x"), f"frames[{index}].rect.x", 0, width - 1),
            "y": strict_int(rect.get("y"), f"frames[{index}].rect.y", 0, height - 1),
            "width": strict_int(rect.get("width"), f"frames[{index}].rect.width", 1, width),
            "height": strict_int(rect.get("height"), f"frames[{index}].rect.height", 1, height),
        }
        if normalized_rect["x"] + normalized_rect["width"] > width or normalized_rect["y"] + normalized_rect["height"] > height:
            fail(f"frames[{index}] escapes atlas bounds")
        entry = {
            "frameId": frame_id,
            "sourcePath": source_path,
            "sourceSha256": source_sha,
            "sourceBytes": source_bytes,
            "rect": normalized_rect,
        }
        for previous in normalized:
            if rectangles_overlap(previous["rect"], normalized_rect):
                fail(f"frame rectangles overlap: {previous['frameId']} and {frame_id}")
        ids.add(frame_id)
        paths.add(source_path)
        normalized.append(entry)
    return width, height, normalized


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()

    temporary: Path | None = None
    try:
        workspace = Path(os.path.abspath(args.workspace_root)).resolve(strict=True)
        if workspace.is_symlink() or not workspace.is_dir():
            fail("workspace root must be one existing ordinary directory")
        plan_path = Path(os.path.abspath(args.plan)).resolve(strict=True)
        try:
            plan_path.relative_to(workspace)
        except ValueError as exc:
            raise ValueError("plan must be inside workspace root") from exc
        plan_bytes = regular_bytes(plan_path, "plan", MAX_PLAN_BYTES)
        expected_plan_sha = str(args.plan_sha256).strip().lower()
        if not SHA256.fullmatch(expected_plan_sha) or sha256_bytes(plan_bytes) != expected_plan_sha:
            fail("plan SHA-256 mismatch")
        plan = json.loads(plan_bytes.decode("utf-8"))
        width, height, frames = validate_plan(plan)

        output_root = Path(os.path.abspath(args.output_root)).resolve(strict=False)
        if output_root.exists() or output_root.is_symlink():
            fail("output root is create-only and already exists")
        parent = output_root.parent.resolve(strict=True)
        temporary = Path(tempfile.mkdtemp(prefix=f".{output_root.name}.eva-atlas-", dir=parent))
        image_path = temporary / "atlas.png"
        manifest_path = temporary / "manifest.json"
        receipt_path = temporary / "receipt.json"

        atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        frame_evidence: list[dict[str, Any]] = []
        try:
            for index, frame in enumerate(frames):
                source_path = secure_relative(workspace, frame["sourcePath"], f"frames[{index}].sourcePath", must_exist=True)
                source_file_bytes = regular_bytes(source_path, f"frames[{index}] source", MAX_SOURCE_BYTES)
                if len(source_file_bytes) != frame["sourceBytes"] or sha256_bytes(source_file_bytes) != frame["sourceSha256"]:
                    fail(f"frames[{index}] source identity changed")
                with Image.open(source_path) as opened:
                    opened.load()
                    encoded_has_alpha = "A" in opened.getbands() or "transparency" in opened.info
                    if not encoded_has_alpha:
                        fail(f"frames[{index}] source must encode alpha")
                    source = opened.convert("RGBA")
                try:
                    rect = frame["rect"]
                    if source.size != (rect["width"], rect["height"]):
                        fail(f"frames[{index}] dimensions do not match fixed rectangle")
                    source_pixel_sha = pixel_sha(source)
                    atlas.paste(source, (rect["x"], rect["y"]))
                    frame_evidence.append({
                        "frameId": frame["frameId"],
                        "sourcePath": frame["sourcePath"],
                        "sourceSha256": frame["sourceSha256"],
                        "sourceBytes": frame["sourceBytes"],
                        "sourceRgbaSha256": source_pixel_sha,
                        "rect": rect,
                    })
                finally:
                    source.close()
            atlas.save(image_path, format="PNG", optimize=False, compress_level=9)
        finally:
            atlas.close()

        image_bytes = regular_bytes(image_path, "atlas clean master", 512 * 1024 * 1024)
        with Image.open(image_path) as encoded:
            encoded.load()
            decoded = encoded.convert("RGBA")
        try:
            if decoded.size != (width, height):
                fail("encoded atlas dimensions changed")
            for index, evidence in enumerate(frame_evidence):
                rect = evidence["rect"]
                crop = decoded.crop((rect["x"], rect["y"], rect["x"] + rect["width"], rect["y"] + rect["height"]))
                try:
                    observed = pixel_sha(crop)
                finally:
                    crop.close()
                if observed != evidence["sourceRgbaSha256"]:
                    fail(f"encoded atlas changed RGBA pixels for frame {index}: {evidence['frameId']}")
                evidence["encodedRgbaSha256"] = observed
                evidence["rgbaExact"] = True
        finally:
            decoded.close()

        manifest = {
            "schema": MANIFEST_SCHEMA,
            "characterId": "eva-female",
            "candidateReleaseId": plan["candidateReleaseId"],
            "tierId": plan.get("tierId"),
            "atlasId": plan.get("atlasId"),
            "atlasIndex": plan.get("atlasIndex"),
            "width": width,
            "height": height,
            "frameCount": len(frame_evidence),
            "frames": frame_evidence,
            "image": {
                "path": "atlas.png",
                "sha256": sha256_bytes(image_bytes),
                "bytes": len(image_bytes),
                "format": "png",
                "pixelFormat": "RGBA8888",
            },
            "planSha256": expected_plan_sha,
            "sourceMutation": False,
            "repositoryMutation": False,
            "publication": False,
        }
        manifest_bytes = canonical(manifest)
        manifest_path.write_bytes(manifest_bytes)
        receipt = {
            "schema": RECEIPT_SCHEMA,
            "status": "passed",
            "characterId": "eva-female",
            "candidateReleaseId": plan["candidateReleaseId"],
            "tierId": plan.get("tierId"),
            "atlasId": plan.get("atlasId"),
            "atlasIndex": plan.get("atlasIndex"),
            "planSha256": expected_plan_sha,
            "frameCount": len(frame_evidence),
            "width": width,
            "height": height,
            "imageSha256": manifest["image"]["sha256"],
            "imageBytes": manifest["image"]["bytes"],
            "manifestSha256": sha256_bytes(manifest_bytes),
            "allFrameRgbaExact": all(frame["rgbaExact"] for frame in frame_evidence),
            "pillowVersion": PIL.__version__,
            "createOnlyOutput": True,
            "atomicPublication": True,
            "sourceMutation": False,
            "creativeApproval": False,
            "webpDeliveryApproval": False,
            "candidatePromotion": False,
            "cloudinaryUpload": False,
            "runtimeActivation": False,
            "websiteActivation": False,
            "repositoryMutation": False,
            "publication": False,
            "forcePush": False,
        }
        receipt_path.write_bytes(canonical(receipt))
        os.replace(temporary, output_root)
        temporary = None
        print(json.dumps(receipt, ensure_ascii=False, sort_keys=True))
        return 0
    except (OSError, ValueError, KeyError, UnicodeError, json.JSONDecodeError) as exc:
        if temporary is not None and temporary.exists():
            shutil.rmtree(temporary, ignore_errors=True)
        print(json.dumps({"schema": RECEIPT_SCHEMA, "status": "failed", "error": str(exc)[:1024]}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
