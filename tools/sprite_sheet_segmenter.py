#!/usr/bin/env python3
"""Create-only sprite-sheet segmentation for governed game-art workspaces."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import deque
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

from transparency_guard import require_transparency

SCHEMA = "evavo.sprite-sheet-segmentation-plan.v1"
RECEIPT = "evavo.sprite-sheet-segmentation-receipt.v1"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]+$")
MAX_PIXELS = 32_000_000
MAX_COMPONENTS = 512
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def fail(message: str) -> None:
    raise ValueError(message)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def secure_relative(root: Path, value: str, label: str, *, must_exist: bool) -> Path:
    if not isinstance(value, str) or not value or "\x00" in value or "\\" in value:
        fail(f"{label} is invalid")
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts or any(part in {"", "."} for part in relative.parts):
        fail(f"{label} must be a canonical forward-slash relative path")
    candidate = (root / relative).resolve(strict=must_exist)
    if not inside(root, candidate):
        fail(f"{label} escaped workspace")
    current = root
    for part in relative.parts:
        current = current / part
        if current.exists() and current.is_symlink():
            fail(f"{label} contains a symlink")
    if must_exist and (candidate.is_symlink() or not candidate.is_file()):
        fail(f"{label} must be an ordinary file")
    return candidate


def secure_absolute(root: Path, value: Path, label: str, *, must_exist: bool) -> Path:
    candidate = Path(os.path.abspath(value)).resolve(strict=must_exist)
    if not inside(root, candidate):
        fail(f"{label} escaped workspace")
    return candidate


def exact_sha(value: str, label: str) -> str:
    text = str(value).strip().lower()
    if not SHA256.fullmatch(text):
        fail(f"{label} must be lowercase SHA-256")
    return text


def open_rgba(path: Path) -> Image.Image:
    with Image.open(path) as source:
        source.load()
        image = ImageOps.exif_transpose(source).convert("RGBA")
    if image.width * image.height > MAX_PIXELS:
        fail("decoded source exceeds reviewed pixel bound")
    return image


def hard_alpha(image: Image.Image, threshold: int) -> Image.Image:
    alpha = image.getchannel("A").point(lambda x: 255 if x >= threshold else 0)
    result = image.copy()
    result.putalpha(alpha)
    return result


def component_boxes(image: Image.Image, *, threshold: int, min_pixels: int, max_components: int) -> list[tuple[int, int, int, int, int]]:
    width, height = image.size
    alpha = image.getchannel("A")
    mask = bytearray(1 if value >= threshold else 0 for value in alpha.getdata())
    visited = bytearray(width * height)
    boxes: list[tuple[int, int, int, int, int]] = []
    for index, active in enumerate(mask):
        if not active or visited[index]:
            continue
        visited[index] = 1
        queue: deque[int] = deque([index])
        min_x = max_x = index % width
        min_y = max_y = index // width
        pixels = 0
        while queue:
            current = queue.popleft()
            pixels += 1
            x = current % width
            y = current // width
            min_x = min(min_x, x); max_x = max(max_x, x)
            min_y = min(min_y, y); max_y = max(max_y, y)
            if x > 0:
                n = current - 1
                if mask[n] and not visited[n]: visited[n] = 1; queue.append(n)
            if x + 1 < width:
                n = current + 1
                if mask[n] and not visited[n]: visited[n] = 1; queue.append(n)
            if y > 0:
                n = current - width
                if mask[n] and not visited[n]: visited[n] = 1; queue.append(n)
            if y + 1 < height:
                n = current + width
                if mask[n] and not visited[n]: visited[n] = 1; queue.append(n)
        if pixels >= min_pixels:
            boxes.append((min_x, min_y, max_x + 1, max_y + 1, pixels))
            if len(boxes) > max_components:
                fail("component count exceeds reviewed bound")
    boxes.sort(key=lambda box: (box[1], box[0], -(box[4])))
    return boxes


def padded_box(box: tuple[int, int, int, int], width: int, height: int, padding: int) -> tuple[int, int, int, int]:
    left, top, right, bottom = box
    return max(0, left - padding), max(0, top - padding), min(width, right + padding), min(height, bottom + padding)


def unique_colour_count(image: Image.Image, cap: int = 4096) -> int | None:
    colors = set()
    for pixel in image.getdata():
        colors.add(pixel)
        if len(colors) > cap:
            return None
    return len(colors)


def frame_metrics(image: Image.Image) -> dict[str, Any]:
    alpha = list(image.getchannel("A").getdata())
    visible = sum(1 for value in alpha if value > 0)
    partial = sum(1 for value in alpha if 0 < value < 255)
    return {
        "width": image.width,
        "height": image.height,
        "visiblePixels": visible,
        "partialAlphaPixels": partial,
        "partialAlphaRatio": (partial / visible) if visible else 0.0,
        "uniqueColorCount": unique_colour_count(image),
    }


def alpha_mass_grid_boxes(
    image: Image.Image,
    *,
    rows: int,
    columns: int,
    threshold: int,
) -> list[tuple[int, int, int, int, int]]:
    """Derive uneven grid cells from row-local alpha mass without changing pixels."""
    if not 1 <= rows <= 32 or not 1 <= columns <= 32 or rows * columns > MAX_COMPONENTS:
        fail("gridAuto rows and columns are outside reviewed bounds")
    alpha = image.getchannel("A")
    pixels = alpha.load()
    boxes: list[tuple[int, int, int, int, int]] = []
    for row in range(rows):
        top = round(row * image.height / rows)
        bottom = round((row + 1) * image.height / rows)
        weights = [sum(1 for y in range(top, bottom) if pixels[x, y] >= threshold) for x in range(image.width)]
        centers = [(index + 0.5) * image.width / columns for index in range(columns)]
        for _iteration in range(16):
            groups: list[list[tuple[int, int]]] = [[] for _ in centers]
            for x, weight in enumerate(weights):
                if weight:
                    nearest = min(range(columns), key=lambda index: abs(x - centers[index]))
                    groups[nearest].append((x, weight))
            if any(not group for group in groups):
                fail(f"gridAuto row {row} does not contain {columns} separable alpha-mass groups")
            centers = [sum(x * weight for x, weight in group) / sum(weight for _, weight in group) for group in groups]
        boundaries = [0]
        boundaries.extend(round((centers[index] + centers[index + 1]) / 2) for index in range(columns - 1))
        boundaries.append(image.width)
        for column in range(columns):
            left, right = boundaries[column], boundaries[column + 1]
            active = [(x, y) for y in range(top, bottom) for x in range(left, right) if pixels[x, y] >= threshold]
            if not active:
                fail(f"gridAuto row {row} column {column} is empty")
            min_x = min(x for x, _ in active)
            min_y = min(y for _, y in active)
            max_x = max(x for x, _ in active) + 1
            max_y = max(y for _, y in active) + 1
            boxes.append((min_x, min_y, max_x, max_y, len(active)))
    return boxes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()
    try:
        root = Path(os.path.abspath(args.workspace_root)).resolve(strict=True)
        if root.is_symlink() or not root.is_dir():
            fail("workspace root must be an ordinary directory")
        plan_path = secure_absolute(root, args.plan, "plan", must_exist=True)
        if plan_path.is_symlink() or not plan_path.is_file():
            fail("plan must be an ordinary file")
        plan_bytes = plan_path.read_bytes()
        plan_sha = exact_sha(args.plan_sha256, "plan SHA-256")
        if sha256_bytes(plan_bytes) != plan_sha:
            fail("plan SHA-256 mismatch")
        plan = json.loads(plan_bytes.decode("utf-8"))
        if plan.get("schema") != SCHEMA or plan.get("createOnlyOutput") is not True or plan.get("sourceOverwrite") is not False:
            fail("plan authority boundary is invalid")
        source_path = secure_relative(root, plan["input"], "input", must_exist=True)
        source_bytes = source_path.read_bytes()
        if plan.get("sourceSha256") and exact_sha(plan["sourceSha256"], "source SHA-256") != sha256_bytes(source_bytes):
            fail("source SHA-256 mismatch")
        output_root = secure_absolute(root, args.output_root, "output root", must_exist=False)
        if output_root.exists() or output_root.is_symlink():
            fail("output root is create-only")
        output_root.parent.mkdir(parents=True, exist_ok=True)
        output_root.mkdir()

        image = open_rgba(source_path)
        alpha_policy = str(plan.get("alphaPolicy", "required"))
        require_transparency(image, "sprite sheet", alpha_policy)
        threshold = int(plan.get("alphaThreshold", 128))
        if not 1 <= threshold <= 255:
            fail("alphaThreshold is invalid")
        padding = int(plan.get("padding", 0))
        if not 0 <= padding <= 256:
            fail("padding is invalid")
        mode = plan.get("mode", "components")
        segments: list[dict[str, Any]] = []
        if mode == "components":
            min_pixels = int(plan.get("minimumComponentPixels", 16))
            maximum = int(plan.get("maximumComponents", 128))
            if not 1 <= min_pixels <= MAX_PIXELS or not 1 <= maximum <= MAX_COMPONENTS:
                fail("component limits are invalid")
            boxes = component_boxes(image, threshold=threshold, min_pixels=min_pixels, max_components=maximum)
            for index, (left, top, right, bottom, pixels) in enumerate(boxes):
                segments.append({"id": f"frame_{index:03d}", "box": [left, top, right, bottom], "componentPixels": pixels})
        elif mode == "rectangles":
            rectangles = plan.get("rectangles")
            if not isinstance(rectangles, list) or not rectangles or len(rectangles) > MAX_COMPONENTS:
                fail("rectangles are invalid")
            for index, item in enumerate(rectangles):
                if not isinstance(item, dict):
                    fail("rectangle must be an object")
                frame_id = str(item.get("id") or f"frame_{index:03d}")
                if not SAFE_ID.fullmatch(frame_id):
                    fail("rectangle id is invalid")
                x, y, width, height = (int(item[key]) for key in ("x", "y", "width", "height"))
                if x < 0 or y < 0 or width < 1 or height < 1 or x + width > image.width or y + height > image.height:
                    fail("rectangle lies outside source")
                segments.append({"id": frame_id, "box": [x, y, x + width, y + height], "componentPixels": None})
        elif mode == "grid-auto":
            rows = int(plan.get("rows", 0))
            columns = int(plan.get("columns", 0))
            frame_ids = plan.get("frameIds")
            if not isinstance(frame_ids, list) or len(frame_ids) != rows * columns:
                fail("gridAuto frameIds must name every row-major cell")
            if any(not isinstance(frame_id, str) or not SAFE_ID.fullmatch(frame_id) for frame_id in frame_ids):
                fail("gridAuto frameIds contain an invalid id")
            boxes = alpha_mass_grid_boxes(image, rows=rows, columns=columns, threshold=threshold)
            for index, (left, top, right, bottom, pixels) in enumerate(boxes):
                segments.append({"id": frame_ids[index], "box": [left, top, right, bottom], "componentPixels": pixels})
        else:
            fail("mode must be components, rectangles or grid-auto")
        if not segments:
            fail("no segments were produced")

        frames = []
        hard = bool(plan.get("hardAlpha", False))
        trim = bool(plan.get("trimAlpha", True))
        for index, segment in enumerate(segments):
            left, top, right, bottom = padded_box(tuple(segment["box"]), image.width, image.height, padding)
            frame = image.crop((left, top, right, bottom))
            if hard:
                frame = hard_alpha(frame, threshold)
            if trim:
                bbox = frame.getchannel("A").getbbox()
                if bbox:
                    frame = frame.crop(bbox)
            file_name = f"{index:03d}-{segment['id']}.png"
            destination = output_root / file_name
            frame.save(destination, format="PNG", optimize=False, compress_level=9)
            payload = destination.read_bytes()
            frames.append({
                "id": segment["id"],
                "file": file_name,
                "sourceBox": [left, top, right, bottom],
                "sourceComponentPixels": segment["componentPixels"],
                "sha256": sha256_bytes(payload),
                "bytes": len(payload),
                "metrics": frame_metrics(frame),
                "productionApproved": False,
            })

        manifest = {
            "schema": "evavo.sprite-sheet-segmentation-manifest.v1",
            "planSha256": plan_sha,
            "sourceSha256": sha256_bytes(source_bytes),
            "sourceSize": {"width": image.width, "height": image.height},
            "mode": mode,
            "frameCount": len(frames),
            "frames": frames,
            "automaticApproval": False,
            "repositoryMutation": False,
            "storageMutation": False,
            "forcePush": False,
        }
        manifest_path = output_root / "segmentation-manifest.json"
        manifest_path.write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        receipt = {
            "schema": RECEIPT,
            "status": "passed",
            "planSha256": plan_sha,
            "sourceSha256": manifest["sourceSha256"],
            "frameCount": len(frames),
            "manifestSha256": sha256_bytes(manifest_path.read_bytes()),
            "automaticApproval": False,
            "repositoryMutation": False,
            "storageMutation": False,
            "publication": False,
            "forcePush": False,
        }
        (output_root / "receipt.json").write_text(json.dumps(receipt, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(receipt, sort_keys=True))
        return 0
    except (OSError, ValueError, KeyError, UnicodeError, json.JSONDecodeError) as error:
        print(json.dumps({"schema": RECEIPT, "status": "failed", "error": str(error)[:2048]}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
