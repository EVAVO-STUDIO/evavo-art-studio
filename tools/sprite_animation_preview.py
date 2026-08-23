#!/usr/bin/env python3
"""Render a create-only sprite animation review GIF and frame strip from exact frame plans."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageOps

SCHEMA = "evavo.sprite-animation-preview-plan.v1"
RECEIPT = "evavo.sprite-animation-preview-receipt.v1"
SHA256_LENGTH = 64
MAX_FRAMES = 512
MAX_PIXELS = 64_000_000
MAX_PLAN_BYTES = 8 * 1024 * 1024
MAX_FRAME_BYTES = 256 * 1024 * 1024
MAX_DURATION_MS = 60_000

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def fail(message: str) -> None:
    raise ValueError(message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def valid_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == SHA256_LENGTH
        and all(character in "0123456789abcdef" for character in value)
    )


def same_identity(left: os.stat_result, right: os.stat_result) -> bool:
    return (
        left.st_dev == right.st_dev
        and left.st_ino == right.st_ino
        and left.st_mode == right.st_mode
        and left.st_nlink == right.st_nlink
        and left.st_size == right.st_size
        and left.st_mtime_ns == right.st_mtime_ns
        and left.st_ctime_ns == right.st_ctime_ns
    )


def stable_bytes(file: Path, maximum: int, label: str) -> bytes:
    before = file.lstat()
    if (
        not stat.S_ISREG(before.st_mode)
        or file.is_symlink()
        or before.st_nlink != 1
        or before.st_size <= 0
        or before.st_size > maximum
    ):
        fail(f"{label} must be a bounded ordinary file")
    descriptor = os.open(file, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(descriptor)
        if not same_identity(before, opened):
            fail(f"{label} identity changed before read")
        chunks: list[bytes] = []
        remaining = opened.st_size
        while remaining:
            chunk = os.read(descriptor, min(1024 * 1024, remaining))
            if not chunk:
                fail(f"{label} short read")
            chunks.append(chunk)
            remaining -= len(chunk)
        after = os.fstat(descriptor)
        if not same_identity(opened, after) or not same_identity(after, file.lstat()):
            fail(f"{label} changed during read")
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def secure_source(root: Path, value: Any, label: str) -> Path:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        fail(f"{label} invalid")
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts or any(part in {"", "."} for part in relative.parts):
        fail(f"{label} invalid")
    requested = root / relative
    requested_state = requested.lstat()
    if requested.is_symlink() or not stat.S_ISREG(requested_state.st_mode) or requested_state.st_nlink != 1:
        fail(f"{label} must be an ordinary non-link file")
    resolved = requested.resolve(strict=True)
    if not inside(root, resolved) or requested.absolute() != resolved:
        fail(f"{label} escaped or linked outside the workspace")
    return resolved


def workspace_path(root: Path, value: str, label: str, *, must_exist: bool) -> Path:
    requested = Path(os.path.abspath(value))
    if must_exist:
        requested_state = requested.lstat()
        if requested.is_symlink() or not stat.S_ISREG(requested_state.st_mode) or requested_state.st_nlink != 1:
            fail(f"{label} must be an ordinary non-link file")
        candidate = requested.resolve(strict=True)
        if requested != candidate:
            fail(f"{label} linked path forbidden")
    else:
        candidate = requested.resolve(strict=False)
    if not inside(root, candidate):
        fail(f"{label} escaped root")
    return candidate


def checker(size: tuple[int, int], step: int = 8) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size, (24, 24, 24, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, height, step):
        for x in range(0, width, step):
            if (x // step + y // step) % 2:
                draw.rectangle(
                    (x, y, min(width - 1, x + step - 1), min(height - 1, y + step - 1)),
                    fill=(48, 48, 48, 255),
                )
    return image


def integer(value: Any, minimum: int, maximum: int, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum or value > maximum:
        fail(f"{label} invalid")
    return value


def number(value: Any, minimum: float, maximum: float, label: str) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        fail(f"{label} invalid")
    result = float(value)
    if result < minimum or result > maximum:
        fail(f"{label} invalid")
    return result


def render_preview(
    *,
    workspace_root: str,
    plan_path: str,
    plan_sha256: str,
    output_root: str,
) -> dict[str, Any]:
    requested_root = Path(os.path.abspath(workspace_root))
    root = requested_root.resolve(strict=True)
    if requested_root != root or requested_root.is_symlink():
        fail("workspace root linked path forbidden")
    root_state = root.lstat()
    if root.is_symlink() or not stat.S_ISDIR(root_state.st_mode):
        fail("workspace root invalid")

    plan_file = workspace_path(root, plan_path, "plan", must_exist=True)
    plan_bytes = stable_bytes(plan_file, MAX_PLAN_BYTES, "plan")
    expected_plan_sha = str(plan_sha256).lower().strip()
    if not valid_sha256(expected_plan_sha) or digest(plan_bytes) != expected_plan_sha:
        fail("plan SHA-256 mismatch")
    try:
        plan = json.loads(plan_bytes.decode("utf-8", errors="strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"plan JSON invalid: {exc}")
    if not isinstance(plan, dict):
        fail("plan root invalid")
    if (
        plan.get("schema") != SCHEMA
        or plan.get("createOnlyOutput") is not True
        or plan.get("repositoryMutation") is not False
    ):
        fail("plan boundary invalid")

    frames = plan.get("frames")
    if not isinstance(frames, list) or not frames or len(frames) > MAX_FRAMES:
        fail("frames invalid")
    scale = integer(plan.get("scale", 4), 1, 16, "scale")
    fps = number(plan.get("fps", 8), 0.5, 60, "fps")
    background = plan.get("background", "checker")
    if background not in {"checker", "transparent"}:
        fail("background invalid")
    default_duration = max(1, round(1000 / fps))

    final_output = workspace_path(root, output_root, "output root", must_exist=False)
    if final_output.exists() or final_output.is_symlink():
        fail("output root is create-only")
    parent = Path(os.path.abspath(output_root)).parent
    parent_state = parent.lstat()
    parent_real = parent.resolve(strict=True)
    if (
        parent.is_symlink()
        or not stat.S_ISDIR(parent_state.st_mode)
        or parent != parent_real
        or not inside(root, parent_real)
    ):
        fail("output root parent invalid")

    staging: Path | None = Path(tempfile.mkdtemp(prefix=f".{final_output.name}.preview-", dir=parent_real))
    os.chmod(staging, 0o700)
    try:
        rendered: list[Image.Image] = []
        records: list[dict[str, Any]] = []
        durations: list[int] = []
        cell_width = 0
        cell_height = 0

        for index, item in enumerate(frames):
            if not isinstance(item, dict):
                fail(f"frame {index} invalid")
            source = secure_source(root, item.get("path"), f"frame {index}")
            source_bytes = stable_bytes(source, MAX_FRAME_BYTES, f"frame {index}")
            expected_source_sha = item.get("sha256")
            if not valid_sha256(expected_source_sha) or digest(source_bytes) != expected_source_sha:
                fail(f"frame {index} hash mismatch")
            requested_duration = item.get("durationMs")
            effective_duration = (
                default_duration
                if requested_duration is None
                else integer(requested_duration, 1, MAX_DURATION_MS, f"frame {index} durationMs")
            )

            with Image.open(source) as source_image:
                source_image.load()
                image = ImageOps.exif_transpose(source_image).convert("RGBA")
            if image.width * image.height <= 0 or image.width * image.height > MAX_PIXELS:
                fail(f"frame {index} pixel bound invalid")
            cell_width = max(cell_width, image.width)
            cell_height = max(cell_height, image.height)
            rendered.append(image)
            durations.append(effective_duration)
            records.append(
                {
                    "path": item["path"],
                    "sha256": digest(source_bytes),
                    "durationMs": effective_duration,
                }
            )

        if cell_width * cell_height * len(rendered) > MAX_PIXELS:
            fail("preview exceeds pixel bound")

        gif_frames: list[Image.Image] = []
        for image in rendered:
            frame = (
                checker((cell_width, cell_height))
                if background == "checker"
                else Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
            )
            frame.alpha_composite(
                image,
                ((cell_width - image.width) // 2, (cell_height - image.height) // 2),
            )
            gif_frames.append(
                frame.resize(
                    (cell_width * scale, cell_height * scale),
                    Image.Resampling.NEAREST,
                ).convert("P", palette=Image.Palette.ADAPTIVE, colors=255)
            )

        gif_path = staging / "animation-preview.gif"
        gif_frames[0].save(
            gif_path,
            save_all=True,
            append_images=gif_frames[1:],
            duration=durations,
            loop=0,
            disposal=2,
            optimize=False,
            transparency=255,
        )

        strip = Image.new(
            "RGBA",
            (cell_width * len(rendered), cell_height),
            (0, 0, 0, 0),
        )
        for index, image in enumerate(rendered):
            strip.alpha_composite(
                image,
                (
                    index * cell_width + (cell_width - image.width) // 2,
                    (cell_height - image.height) // 2,
                ),
            )
        strip_path = staging / "frame-strip.png"
        strip.resize(
            (strip.width * scale, strip.height * scale),
            Image.Resampling.NEAREST,
        ).save(strip_path, "PNG", compress_level=9)

        gif_bytes = stable_bytes(gif_path, MAX_FRAME_BYTES, "animation preview GIF")
        strip_bytes = stable_bytes(strip_path, MAX_FRAME_BYTES, "animation frame strip")
        receipt = {
            "schema": RECEIPT,
            "status": "passed",
            "planSha256": expected_plan_sha,
            "frameCount": len(frames),
            "fps": fps,
            "scale": scale,
            "timingMode": "per-frame-or-fps-fallback",
            "defaultFrameDurationMs": default_duration,
            "gifSha256": digest(gif_bytes),
            "stripSha256": digest(strip_bytes),
            "frames": records,
            "reviewOnly": True,
            "automaticApproval": False,
            "repositoryMutation": False,
            "storageMutation": False,
            "publication": False,
            "forcePush": False,
        }
        receipt_bytes = (json.dumps(receipt, sort_keys=True, indent=2) + "\n").encode("utf-8")
        receipt_path = staging / "receipt.json"
        descriptor = os.open(receipt_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            offset = 0
            while offset < len(receipt_bytes):
                written = os.write(descriptor, receipt_bytes[offset:])
                if written <= 0:
                    fail("receipt short write")
                offset += written
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

        os.rename(staging, final_output)
        staging = None
        return receipt
    finally:
        if staging is not None:
            shutil.rmtree(staging, ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--plan-sha256", required=True)
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args(argv)
    try:
        receipt = render_preview(
            workspace_root=args.workspace_root,
            plan_path=args.plan,
            plan_sha256=args.plan_sha256,
            output_root=args.output_root,
        )
        print(json.dumps(receipt, sort_keys=True))
        return 0
    except (OSError, ValueError, KeyError, UnicodeError, json.JSONDecodeError) as exc:
        print(
            json.dumps({"schema": RECEIPT, "status": "failed", "error": str(exc)[:2048]}),
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
