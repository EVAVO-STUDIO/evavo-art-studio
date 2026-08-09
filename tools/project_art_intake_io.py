from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError

from project_art_intake_contract import (
    MAXIMUM_IMAGE_PIXELS,
    canonical_json,
    fail,
    sha256_bytes,
    sha256_file,
)

Image.MAX_IMAGE_PIXELS = MAXIMUM_IMAGE_PIXELS

def within(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def absolute_existing_directory(value: Any, label: str) -> Path:
    if not isinstance(value, str) or not value:
        fail(f"{label} must be a non-empty absolute path.")
    lexical = Path(os.path.abspath(value))
    if not lexical.is_absolute() or lexical.is_symlink() or not lexical.is_dir():
        fail(f"{label} must be an existing non-symbolic directory.")
    return lexical.resolve(strict=True)


def secure_source(value: Any, allowed_roots: list[Path], label: str) -> Path:
    if not isinstance(value, str) or not value:
        fail(f"{label} must be a non-empty absolute path.")
    lexical = Path(os.path.abspath(value))
    root = next((candidate for candidate in allowed_roots if within(candidate, lexical)), None)
    if root is None:
        fail(f"{label} is outside every allowed source root.")
    current = root
    for segment in lexical.relative_to(root).parts:
        current = current / segment
        if current.is_symlink():
            fail(f"{label} contains a symbolic-link component.")
        if not current.exists():
            fail(f"{label} does not exist.")
    if not lexical.is_file():
        fail(f"{label} must be a regular file.")
    resolved = lexical.resolve(strict=True)
    if not within(root, resolved):
        fail(f"{label} escaped its allowed source root.")
    return resolved


def safe_relative(value: Any, label: str) -> Path:
    if not isinstance(value, str) or not value or "\\" in value:
        fail(f"{label} must be a non-empty forward-slash relative path.")
    candidate = Path(value)
    if candidate.is_absolute() or ".." in candidate.parts or "." in candidate.parts:
        fail(f"{label} must stay relative without dot segments.")
    normalized = candidate.as_posix()
    if normalized != value:
        fail(f"{label} is not canonical.")
    return candidate


def ensure_safe_destination(root: Path, relative: Path, label: str) -> Path:
    candidate = root.joinpath(*relative.parts)
    if not within(root, candidate):
        fail(f"{label} escaped the output root.")
    current = root
    for segment in relative.parts[:-1]:
        current = current / segment
        if current.exists() and current.is_symlink():
            fail(f"{label} contains a symbolic-link directory.")
    return candidate


def alpha_counts(image: Image.Image) -> dict[str, int]:
    rgba = image.convert("RGBA")
    transparent = partial = opaque = 0
    for alpha in rgba.getchannel("A").tobytes():
        if alpha == 0:
            transparent += 1
        elif alpha == 255:
            opaque += 1
        else:
            partial += 1
    return {
        "transparentPixels": transparent,
        "partialPixels": partial,
        "opaquePixels": opaque,
    }


def inspect_image(source: Path) -> dict[str, Any]:
    try:
        with Image.open(source) as opened:
            opened.load()
            if opened.width * opened.height > MAXIMUM_IMAGE_PIXELS:
                fail(f"Image exceeds maximum decoded pixels: {source}")
            transposed = ImageOps.exif_transpose(opened)
            frame_count = int(getattr(opened, "n_frames", 1))
            return {
                "inspection": "decoded",
                "format": str(opened.format or "unknown").lower(),
                "mode": transposed.mode,
                "width": transposed.width,
                "height": transposed.height,
                "frameCount": frame_count,
                "animated": frame_count > 1,
                "alpha": alpha_counts(transposed),
            }
    except (UnidentifiedImageError, OSError):
        return {
            "inspection": "metadata-only",
            "format": source.suffix.lower().lstrip(".") or "unknown",
            "reason": "Pillow does not decode this editable or engine image format.",
        }


def copy_exact(source: Path, destination: Path) -> dict[str, Any]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with source.open("rb") as reader, destination.open("xb") as writer:
        shutil.copyfileobj(reader, writer, length=1024 * 1024)
        writer.flush()
        os.fsync(writer.fileno())
    return {
        "path": destination.as_posix(),
        "sha256": sha256_file(destination),
        "bytes": destination.stat().st_size,
    }


def write_json_create_only(path_value: Path, value: Any) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    with path_value.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())


def add_self_hash(value: dict[str, Any], field: str) -> dict[str, Any]:
    result = dict(value)
    result[field] = sha256_bytes(canonical_json(result).encode("utf-8"))
    return result
