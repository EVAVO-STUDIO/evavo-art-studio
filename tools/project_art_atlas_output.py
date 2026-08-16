from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from PIL import Image

from project_art_atlas_models import Placement

def paste_extruded(
    atlas: Image.Image,
    image: Image.Image,
    x: int,
    y: int,
    extrude: int,
) -> None:
    # Packing proves these regions do not overlap, so exact RGBA paste is both
    # safe and necessary: alpha compositing would erase RGB beneath alpha zero.
    atlas.paste(image, (x, y))
    if extrude <= 0:
        return
    width, height = image.size
    left = image.crop((0, 0, 1, height)).resize((extrude, height), Image.Resampling.NEAREST)
    right = image.crop((width - 1, 0, width, height)).resize((extrude, height), Image.Resampling.NEAREST)
    top = image.crop((0, 0, width, 1)).resize((width, extrude), Image.Resampling.NEAREST)
    bottom = image.crop((0, height - 1, width, height)).resize((width, extrude), Image.Resampling.NEAREST)
    try:
        atlas.paste(left, (x - extrude, y))
        atlas.paste(right, (x + width, y))
        atlas.paste(top, (x, y - extrude))
        atlas.paste(bottom, (x, y + height))
    finally:
        left.close()
        right.close()
        top.close()
        bottom.close()
    corners = [
        (image.getpixel((0, 0)), x - extrude, y - extrude),
        (image.getpixel((width - 1, 0)), x + width, y - extrude),
        (image.getpixel((0, height - 1)), x - extrude, y + height),
        (image.getpixel((width - 1, height - 1)), x + width, y + height),
    ]
    for colour, left_x, top_y in corners:
        patch = Image.new("RGBA", (extrude, extrude), colour)
        try:
            atlas.paste(patch, (left_x, top_y))
        finally:
            patch.close()


def frame_metadata(placement: Placement) -> dict[str, Any]:
    frame = placement.frame
    return {
        "frame": {
            "x": placement.x,
            "y": placement.y,
            "w": placement.width,
            "h": placement.height,
        },
        "rotated": placement.rotated,
        "trimmed": (
            frame.trim_x != 0
            or frame.trim_y != 0
            or frame.trim_width != frame.source_width
            or frame.trim_height != frame.source_height
        ),
        "spriteSourceSize": {
            "x": frame.trim_x,
            "y": frame.trim_y,
            "w": frame.trim_width,
            "h": frame.trim_height,
        },
        "sourceSize": {"w": frame.source_width, "h": frame.source_height},
        "pivot": {"x": frame.pivot_x, "y": frame.pivot_y},
        "source": {
            "sha256": frame.content_sha256,
            "path": str(frame.source_path),
            "tags": list(frame.tags),
        },
        "transparencyAdmission": frame.transparency_admission,
        "transparentRgbBleed": frame.transparent_rgb_bleed,
    }


def regions_overlap(left: Placement, right: Placement, extrude: int) -> bool:
    left_box = (
        left.x - extrude,
        left.y - extrude,
        left.x + left.width + extrude,
        left.y + left.height + extrude,
    )
    right_box = (
        right.x - extrude,
        right.y - extrude,
        right.x + right.width + extrude,
        right.y + right.height + extrude,
    )
    return not (
        left_box[2] <= right_box[0]
        or right_box[2] <= left_box[0]
        or left_box[3] <= right_box[1]
        or right_box[3] <= left_box[1]
    )


def write_json(path_value: Path, value: Any) -> None:
    with path_value.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
