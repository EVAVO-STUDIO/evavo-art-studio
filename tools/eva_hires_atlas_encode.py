#!/usr/bin/env python3
"""Encode one exact EVA high-resolution fixed-grid atlas candidate.

This is a deterministic-plan executor, not a planner or approval surface. It reads
exactly 36 SHA-bound RGBA PNG frames from one governed workspace, pastes them at
the rectangles declared by Avatar Runtime, writes one create-only WebP atlas and
one create-only JSON receipt, and grants no upload/promotion/runtime authority.
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

from PIL import Image, features

PLAN_SCHEMA = "evavo.eva-hires-atlas-encoding-plan.v1"
RECEIPT_SCHEMA = "evavo.eva-hires-atlas-encoding-receipt.v1"
CHARACTER_ID = "eva-female"
FRAME_COUNT = 36
COLUMNS = 6
ROWS = 6
PADDING = 4
QUALITY = 92
METHOD = 6
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RELEASE_RE = re.compile(r"^eva-v0\.13\.0-hires-reauthored-r[1-9][0-9]*$")
TIER_GEOMETRY = {
    "desktop-hires": (512, 768, 3120, 4656),
    "retina-hires": (768, 1152, 4656, 6960),
}


def fail(message: str) -> None:
    raise ValueError(message)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ordinary_file(path: Path, label: str) -> Path:
    lexical = Path(os.path.abspath(path))
    if lexical.is_symlink() or not lexical.is_file():
        fail(f"{label} must be one ordinary file")
    return lexical.resolve(strict=True)


def ordinary_directory(path: Path, label: str) -> Path:
    lexical = Path(os.path.abspath(path))
    if lexical.is_symlink() or not lexical.is_dir():
        fail(f"{label} must be one ordinary directory")
    return lexical.resolve(strict=True)


def create_only_file(path: Path, label: str) -> Path:
    lexical = Path(os.path.abspath(path))
    if lexical.exists() or lexical.is_symlink():
        fail(f"{label} must be create-only")
    parent = lexical.parent
    if parent.is_symlink() or not parent.is_dir():
        fail(f"{label} parent must be one existing ordinary directory")
    return lexical


def inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def safe_workspace_source(root: Path, relative: Any, label: str) -> Path:
    if not isinstance(relative, str) or not relative or "\\" in relative or relative.startswith("/"):
        fail(f"{label} must be one safe workspace-relative path")
    parts = relative.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        fail(f"{label} contains an unsafe path component")
    lexical = root.joinpath(*parts)
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink():
            fail(f"{label} contains a symbolic-link component")
    resolved = ordinary_file(lexical, label)
    if not inside(root, resolved):
        fail(f"{label} escaped the workspace")
    return resolved


def validate_sha(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        fail(f"{label} must be lowercase SHA-256")
    return value


def validate_plan(plan: dict[str, Any], raw: bytes, expected_sha: str) -> tuple[dict[str, Any], tuple[int, int, int, int]]:
    validate_sha(expected_sha, "planSha256")
    observed = sha256_bytes(raw)
    if observed != expected_sha:
        fail("plan byte SHA-256 mismatch")
    if plan.get("schema") != PLAN_SCHEMA or plan.get("characterId") != CHARACTER_ID:
        fail("plan schema or character identity is invalid")
    release_id = plan.get("candidateReleaseId")
    if not isinstance(release_id, str) or not RELEASE_RE.fullmatch(release_id):
        fail("candidate release identity is invalid")
    tier_id = plan.get("tierId")
    geometry = TIER_GEOMETRY.get(tier_id)
    if geometry is None:
        fail("tier identity is invalid")
    frame_width, frame_height, atlas_width, atlas_height = geometry
    if plan.get("frameCount") != FRAME_COUNT or plan.get("atlasIndex") not in range(5):
        fail("atlas frame count or index is invalid")
    if plan.get("width") != atlas_width or plan.get("height") != atlas_height:
        fail("atlas dimensions are invalid")
    if plan.get("columns") != COLUMNS or plan.get("rows") != ROWS or plan.get("paddingPixels") != PADDING:
        fail("fixed-grid geometry is invalid")
    if plan.get("format") != "image/webp":
        fail("atlas output format must be image/webp")
    encoding = plan.get("encoding")
    expected_encoding = {
        "quality": QUALITY,
        "method": METHOD,
        "lossless": False,
        "exact": True,
        "alphaQuality": 100,
    }
    if encoding != expected_encoding:
        fail("atlas encoding settings are invalid")
    authority = plan.get("authority")
    if not isinstance(authority, dict) or not authority or any(value is not False for value in authority.values()):
        fail("atlas encoding authority must remain all false")
    placements = plan.get("placements")
    if not isinstance(placements, list) or len(placements) != FRAME_COUNT:
        fail("atlas must contain exactly 36 placements")
    ids: set[str] = set()
    paths: set[str] = set()
    for local_index, placement in enumerate(placements):
        if not isinstance(placement, dict) or placement.get("localFrameIndex") != local_index:
            fail("placement order is invalid")
        frame_id = placement.get("frameId")
        relative = placement.get("sourceRelativePath")
        if not isinstance(frame_id, str) or not frame_id or frame_id in ids:
            fail("placement frame identity is invalid or duplicated")
        if not isinstance(relative, str) or relative in paths:
            fail("placement source path is invalid or duplicated")
        ids.add(frame_id)
        paths.add(relative)
        validate_sha(placement.get("sourceSha256"), f"placements[{local_index}].sourceSha256")
        rect = placement.get("frameRect")
        row = local_index // COLUMNS
        column = local_index % COLUMNS
        expected_rect = {
            "x": column * (frame_width + PADDING * 2) + PADDING,
            "y": row * (frame_height + PADDING * 2) + PADDING,
            "width": frame_width,
            "height": frame_height,
        }
        if rect != expected_rect:
            fail(f"placement rectangle drift at index {local_index}")
    return plan, geometry


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--atlas", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()

    atlas_tmp: Path | None = None
    receipt_tmp: Path | None = None
    try:
        workspace = ordinary_directory(args.workspace_root, "workspaceRoot")
        plan_path = ordinary_file(args.plan, "plan")
        atlas_path = create_only_file(args.atlas, "atlas")
        receipt_path = create_only_file(args.receipt, "receipt")
        if atlas_path == receipt_path:
            fail("atlas and receipt outputs must be distinct")
        raw = plan_path.read_bytes()
        plan_value = json.loads(raw.decode("utf-8"))
        if not isinstance(plan_value, dict):
            fail("plan root must be an object")
        plan, geometry = validate_plan(plan_value, raw, args.plan_sha256)
        frame_width, frame_height, atlas_width, atlas_height = geometry

        atlas_tmp = atlas_path.with_name(f".{atlas_path.name}.{os.getpid()}.tmp")
        receipt_tmp = receipt_path.with_name(f".{receipt_path.name}.{os.getpid()}.tmp")
        if atlas_tmp.exists() or receipt_tmp.exists():
            fail("temporary output collision")

        canvas = Image.new("RGBA", (atlas_width, atlas_height), (0, 0, 0, 0))
        verified: list[dict[str, Any]] = []
        try:
            for index, placement in enumerate(plan["placements"]):
                source = safe_workspace_source(workspace, placement["sourceRelativePath"], f"source frame {index}")
                source_sha = sha256_file(source)
                if source_sha != placement["sourceSha256"]:
                    fail(f"source SHA-256 mismatch for {placement['frameId']}")
                with Image.open(source) as image:
                    image.load()
                    if image.format != "PNG" or image.size != (frame_width, frame_height):
                        fail(f"source frame format/dimensions invalid for {placement['frameId']}")
                    rgba = image.convert("RGBA")
                    try:
                        rect = placement["frameRect"]
                        canvas.alpha_composite(rgba, (rect["x"], rect["y"]))
                    finally:
                        rgba.close()
                verified.append({
                    "localFrameIndex": index,
                    "frameId": placement["frameId"],
                    "sourceRelativePath": placement["sourceRelativePath"],
                    "sourceSha256": source_sha,
                    "frameRect": placement["frameRect"],
                })

            canvas.save(
                atlas_tmp,
                format="WEBP",
                quality=QUALITY,
                method=METHOD,
                lossless=False,
                exact=True,
                alpha_quality=100,
            )
        finally:
            canvas.close()

        atlas_sha = sha256_file(atlas_tmp)
        atlas_bytes = atlas_tmp.stat().st_size
        encoder = {
            "pillowVersion": Image.__version__,
            "webp": features.version("webp"),
            "quality": QUALITY,
            "method": METHOD,
            "lossless": False,
            "exact": True,
            "alphaQuality": 100,
        }
        receipt_body = {
            "schema": RECEIPT_SCHEMA,
            "characterId": CHARACTER_ID,
            "candidateReleaseId": plan["candidateReleaseId"],
            "tierId": plan["tierId"],
            "atlasId": plan["atlasId"],
            "atlasIndex": plan["atlasIndex"],
            "planSha256": args.plan_sha256,
            "frameCount": FRAME_COUNT,
            "size": {"width": atlas_width, "height": atlas_height},
            "format": "image/webp",
            "encoder": encoder,
            "atlas": {
                "fileName": atlas_path.name,
                "sha256": atlas_sha,
                "bytes": atlas_bytes,
            },
            "placements": verified,
            "guarantees": {
                "sourceSha256Verified": True,
                "sourceDimensionsVerified": True,
                "fixedGridPlacementVerified": True,
                "transparentCanvasAndPadding": True,
                "frameOrderPreserved": True,
            },
            "authority": {
                "providerExecution": False,
                "creativeApproval": False,
                "candidatePromotion": False,
                "cloudinaryUpload": False,
                "runtimeActivation": False,
                "websiteActivation": False,
                "deployment": False,
                "publication": False,
                "repositoryMutation": False,
                "gitCommit": False,
                "gitPush": False,
                "forcePush": False,
            },
        }
        receipt = dict(receipt_body)
        receipt["receiptSha256"] = sha256_bytes(canonical_json(receipt_body).encode("utf-8"))
        receipt_tmp.write_text(json.dumps(receipt, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")

        os.replace(atlas_tmp, atlas_path)
        atlas_tmp = None
        try:
            os.replace(receipt_tmp, receipt_path)
            receipt_tmp = None
        except Exception:
            atlas_path.unlink(missing_ok=True)
            raise

        print(json.dumps({
            "ok": True,
            "schema": RECEIPT_SCHEMA,
            "atlasId": plan["atlasId"],
            "frameCount": FRAME_COUNT,
            "atlasSha256": atlas_sha,
            "receiptSha256": receipt["receiptSha256"],
            "authority": receipt["authority"],
        }, sort_keys=True))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"EVA hires atlas encoding failed: {exc}", file=sys.stderr)
        return 2
    finally:
        for candidate in (atlas_tmp, receipt_tmp):
            if candidate is not None:
                try:
                    candidate.unlink()
                except FileNotFoundError:
                    pass


if __name__ == "__main__":
    raise SystemExit(main())
