from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 220_000_000

from project_art_atlas_contract import fail, secure_source, sha256_file, validate_hash

@dataclass(frozen=True)
class PreparedFrame:
    frame_id: str
    source_path: Path
    content_sha256: str
    source_width: int
    source_height: int
    trim_x: int
    trim_y: int
    trim_width: int
    trim_height: int
    pivot_x: float
    pivot_y: float
    tags: tuple[str, ...]
    image: Image.Image


@dataclass(frozen=True)
class Placement:
    frame: PreparedFrame
    x: int
    y: int
    width: int
    height: int
    rotated: bool


def prepare_frame(item: dict[str, Any], roots: list[Path], options: dict[str, Any], index: int) -> PreparedFrame:
    source = secure_source(item.get("sourcePath"), roots, f"frames[{index}].sourcePath")
    expected_hash = validate_hash(item.get("contentSha256"), f"frames[{index}].contentSha256")
    expected_bytes = item.get("sizeBytes")
    if not isinstance(expected_bytes, int) or isinstance(expected_bytes, bool) or expected_bytes < 1:
        fail(f"frames[{index}].sizeBytes is invalid.")
    if source.stat().st_size != expected_bytes or sha256_file(source) != expected_hash:
        fail(f"frames[{index}] changed after atlas compilation.")
    try:
        with Image.open(source) as opened:
            opened.load()
            if int(getattr(opened, "n_frames", 1)) != 1:
                fail(f"frames[{index}] must be a single-frame image.")
            rgba = ImageOps.exif_transpose(opened).convert("RGBA")
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError(f"frames[{index}] could not be decoded: {exc}") from exc
    if rgba.width * rgba.height > int(options.get("maximumDecodedPixelsPerFrame", 220_000_000)):
        fail(f"frames[{index}] exceeds maximum decoded pixels.")

    trim_x = trim_y = 0
    trim_width, trim_height = rgba.size
    image = rgba
    if bool(options["trimAlpha"]):
        alpha = rgba.getchannel("A")
        threshold = int(options["alphaThreshold"])
        if threshold > 0:
            alpha = alpha.point(lambda value: 255 if value > threshold else 0)
        bbox = alpha.getbbox()
        if bbox is None:
            image = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
            trim_width = trim_height = 1
        else:
            trim_x, trim_y, right, bottom = bbox
            trim_width = right - trim_x
            trim_height = bottom - trim_y
            image = rgba.crop(bbox)
    pivot = item.get("pivot") or {"x": 0.5, "y": 0.5}
    return PreparedFrame(
        frame_id=str(item["id"]),
        source_path=source,
        content_sha256=expected_hash,
        source_width=rgba.width,
        source_height=rgba.height,
        trim_x=trim_x,
        trim_y=trim_y,
        trim_width=trim_width,
        trim_height=trim_height,
        pivot_x=float(pivot["x"]),
        pivot_y=float(pivot["y"]),
        tags=tuple(str(tag) for tag in item.get("tags") or []),
        image=image.copy(),
    )
