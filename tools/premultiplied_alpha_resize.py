#!/usr/bin/env python3
"""Resize one SHA-bound RGBA PNG in premultiplied-alpha space.

Designed for deterministic avatar delivery derivation after source-master review.
The output is create-only and never grants creative approval, promotion, upload,
runtime activation, publication or repository authority.
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

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit(f"Pillow unavailable: {exc}")

PLAN_SCHEMA = "evavo.premultiplied-alpha-resize-plan.v1"
RECEIPT_SCHEMA = "evavo.premultiplied-alpha-resize-receipt.v1"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
MAX_BYTES = 512 * 1024 * 1024
MAX_PIXELS = 220_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def fail(message: str) -> None:
    raise ValueError(message)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def secure_relative(root: Path, value: str, label: str, *, must_exist: bool) -> Path:
    if not isinstance(value, str) or not value or "\x00" in value or "\\" in value:
        fail(f"{label} invalid")
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        fail(f"{label} must be a forward-slash workspace-relative path")
    candidate = (root / relative).resolve(strict=must_exist)
    if not inside(root, candidate):
        fail(f"{label} escaped workspace")
    current = root
    for part in relative.parts:
        current = current / part
        if current.exists() and current.is_symlink():
            fail(f"{label} contains symlink")
    return candidate


def regular_file(path_value: Path, label: str) -> bytes:
    if path_value.is_symlink() or not path_value.is_file():
        fail(f"{label} must be a regular file")
    before = path_value.stat()
    if before.st_size <= 0 or before.st_size > MAX_BYTES:
        fail(f"{label} size outside bounds")
    payload = path_value.read_bytes()
    after = path_value.stat()
    if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
    ):
        fail(f"{label} changed while being read")
    return payload


def open_rgba(path_value: Path) -> Image.Image:
    regular_file(path_value, "input")
    with Image.open(path_value) as image:
        image.load()
        if image.width < 1 or image.height < 1 or image.width * image.height > MAX_PIXELS:
            fail("input dimensions outside bounds")
        return image.convert("RGBA")


def parse_plan(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail("plan must be an object")
    expected = {
        "schema",
        "input",
        "sourceSha256",
        "width",
        "height",
        "method",
        "output",
        "createOnlyOutput",
        "sourceOverwrite",
    }
    if set(value) != expected:
        fail("plan fields invalid")
    if value["schema"] != PLAN_SCHEMA:
        fail("plan schema invalid")
    if not isinstance(value["sourceSha256"], str) or not SHA256.fullmatch(value["sourceSha256"]):
        fail("source SHA-256 invalid")
    if not isinstance(value["width"], int) or isinstance(value["width"], bool) or not 1 <= value["width"] <= 8192:
        fail("width invalid")
    if not isinstance(value["height"], int) or isinstance(value["height"], bool) or not 1 <= value["height"] <= 8192:
        fail("height invalid")
    if value["width"] * value["height"] > MAX_PIXELS:
        fail("output dimensions outside pixel budget")
    if value["method"] != "premultiplied-alpha-area":
        fail("method must be premultiplied-alpha-area")
    if value["createOnlyOutput"] is not True or value["sourceOverwrite"] is not False:
        fail("plan authority boundary invalid")
    return value


def clear_fully_transparent_rgb(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    data = bytearray(rgba.tobytes())
    for offset in range(0, len(data), 4):
        if data[offset + 3] == 0:
            data[offset] = 0
            data[offset + 1] = 0
            data[offset + 2] = 0
    return Image.frombytes("RGBA", rgba.size, bytes(data))


def resize_premultiplied_area(source: Image.Image, width: int, height: int) -> Image.Image:
    if source.width < width or source.height < height:
        fail("premultiplied-alpha-area resize is downsample-only")
    premultiplied = source.convert("RGBa")
    resized = premultiplied.resize((width, height), Image.Resampling.BOX)
    return clear_fully_transparent_rgb(resized.convert("RGBA"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    arguments = parser.parse_args()
    try:
        root = Path(os.path.abspath(arguments.workspace_root)).resolve(strict=True)
        if root.is_symlink() or not root.is_dir():
            fail("workspace-root invalid")
        plan_path = Path(os.path.abspath(arguments.plan)).resolve(strict=True)
        if not inside(root, plan_path):
            fail("plan must be inside workspace")
        plan_bytes = regular_file(plan_path, "plan")
        expected_plan_sha = str(arguments.plan_sha256).strip().lower()
        if not SHA256.fullmatch(expected_plan_sha) or sha256_bytes(plan_bytes) != expected_plan_sha:
            fail("plan SHA-256 mismatch")
        plan = parse_plan(json.loads(plan_bytes.decode("utf-8")))

        input_path = secure_relative(root, plan["input"], "input", must_exist=True)
        output_path = secure_relative(root, plan["output"], "output", must_exist=False)
        receipt_path = Path(os.path.abspath(arguments.receipt)).resolve(strict=False)
        if not inside(root, receipt_path):
            fail("receipt must be inside workspace")
        if output_path.exists() or receipt_path.exists():
            fail("output and receipt are create-only")
        if output_path == input_path:
            fail("output may not overwrite input")

        input_bytes = regular_file(input_path, "input")
        if sha256_bytes(input_bytes) != plan["sourceSha256"]:
            fail("source SHA-256 mismatch")
        source = open_rgba(input_path)
        output = resize_premultiplied_area(source, plan["width"], plan["height"])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output.save(output_path, format="PNG", optimize=False, compress_level=9)
        output_bytes = regular_file(output_path, "output")

        receipt = {
            "schema": RECEIPT_SCHEMA,
            "status": "passed",
            "planSha256": expected_plan_sha,
            "sourceSha256": sha256_bytes(input_bytes),
            "outputSha256": sha256_bytes(output_bytes),
            "outputBytes": len(output_bytes),
            "sourceWidth": source.width,
            "sourceHeight": source.height,
            "width": output.width,
            "height": output.height,
            "method": "premultiplied-alpha-area",
            "transparentRgbCleared": True,
            "createOnlyOutput": True,
            "sourceOverwrite": False,
            "providerExecution": False,
            "automaticApproval": False,
            "candidatePromotion": False,
            "repositoryMutation": False,
            "publication": False,
            "runtimeActivation": False,
            "websiteActivation": False,
            "forcePush": False,
        }
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.write_bytes(canonical_json(receipt))
        print(json.dumps(receipt, sort_keys=True))
        return 0
    except (OSError, ValueError, KeyError, UnicodeError, json.JSONDecodeError) as exc:
        print(json.dumps({"schema": RECEIPT_SCHEMA, "status": "failed", "error": str(exc)[:1024]}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
