#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import sys
from dataclasses import asdict
from pathlib import Path

from PIL import Image

PAGE_SIZE = 2048
PADDING = 4
ATLAS_W = 256
ATLAS_H = 384
ATLAS_FPS = 30
PIVOT_Y = {
    "eva-female": 1337,
    "top-hat-man": 1350,
    "council-critic": 1370,
    "council-open-reviewer": 1340,
    "nymm-guest-arbiter": 1365,
}


def load_renderer(path: Path):
    spec = importlib.util.spec_from_file_location("evavo_avatar_renderer", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("renderer module could not be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def image_hash(image: Image.Image) -> str:
    return sha256_bytes(image.tobytes())


def trim(image: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("frame contains no visible pixels")
    x0, y0, x1, y1 = bbox
    return image.crop(bbox), (x0, y0, x1 - x0, y1 - y0)


def pack_frames(frames: list[dict]) -> list[dict]:
    pages: list[dict] = []
    current = {"image": Image.new("RGBA", (PAGE_SIZE, PAGE_SIZE), (0, 0, 0, 0)), "x": PADDING, "y": PADDING, "rowHeight": 0, "frames": []}
    pages.append(current)
    for frame in frames:
        image = frame["trimmed"]
        width, height = image.size
        if width + PADDING * 2 > PAGE_SIZE or height + PADDING * 2 > PAGE_SIZE:
            raise RuntimeError(f"frame too large for atlas: {width}x{height}")
        if current["x"] + width + PADDING > PAGE_SIZE:
            current["x"] = PADDING
            current["y"] += current["rowHeight"] + PADDING
            current["rowHeight"] = 0
        if current["y"] + height + PADDING > PAGE_SIZE:
            current = {"image": Image.new("RGBA", (PAGE_SIZE, PAGE_SIZE), (0, 0, 0, 0)), "x": PADDING, "y": PADDING, "rowHeight": 0, "frames": []}
            pages.append(current)
        x, y = current["x"], current["y"]
        # Atlas packing must copy exact straight-alpha RGBA bytes. Alpha
        # compositing can round edge RGB values even over a transparent page,
        # which would invalidate the post-pack pixel-hash proof.
        current["image"].paste(image, (x, y))
        packed = {**frame, "page": len(pages) - 1, "atlasRect": {"x": x, "y": y, "width": width, "height": height}}
        del packed["trimmed"]
        current["frames"].append(packed)
        current["x"] += width + PADDING
        current["rowHeight"] = max(current["rowHeight"], height)
    return pages


def compile_clip(renderer, output_root: Path, character_id: str, clip_id: str, duration: float) -> dict:
    frame_count = round(duration * ATLAS_FPS)
    scaled_pivot = {
        "x": renderer.MASTER_W / 2 * (ATLAS_W / renderer.MASTER_W),
        "y": PIVOT_Y[character_id] * (ATLAS_H / renderer.MASTER_H),
    }
    frames = []
    for index in range(frame_count):
        phase = index / frame_count
        master = renderer.render_transparent(character_id, clip_id, phase)
        scaled = master.resize((ATLAS_W, ATLAS_H), Image.Resampling.LANCZOS)
        cropped, source_rect = trim(scaled)
        frames.append({
            "frameIndex": index,
            "phase": phase,
            "durationMs": 1000 / ATLAS_FPS,
            "sourceSize": {"width": ATLAS_W, "height": ATLAS_H},
            "sourceRect": {"x": source_rect[0], "y": source_rect[1], "width": source_rect[2], "height": source_rect[3]},
            "drawOffset": {"x": source_rect[0], "y": source_rect[1]},
            "pivot": scaled_pivot,
            "trimmedPixelSha256": image_hash(cropped),
            "trimmed": cropped,
        })
    pages = pack_frames(frames)
    clip_root = output_root / character_id / clip_id
    clip_root.mkdir(parents=True, exist_ok=True)
    page_records = []
    packed_frames = []
    for page_index, page in enumerate(pages):
        page_path = clip_root / f"page-{page_index:02d}.png"
        page["image"].save(page_path, optimize=True)
        page_records.append({
            "page": page_index,
            "path": page_path.relative_to(output_root).as_posix(),
            "width": PAGE_SIZE,
            "height": PAGE_SIZE,
            "sha256": sha256_bytes(page_path.read_bytes()),
        })
        packed_frames.extend(page["frames"])
    # Re-read every atlas crop and prove packing preserved the exact trimmed pixels.
    opened = [Image.open(output_root / record["path"]).convert("RGBA") for record in page_records]
    for frame in packed_frames:
        rect = frame["atlasRect"]
        recovered = opened[frame["page"]].crop((rect["x"], rect["y"], rect["x"] + rect["width"], rect["y"] + rect["height"]))
        if image_hash(recovered) != frame["trimmedPixelSha256"]:
            raise RuntimeError(f"atlas verification failed for {character_id}/{clip_id}/{frame['frameIndex']}")
    record = {
        "schema": "evavo.project-art-council-avatar-procedural-review-atlas-clip.v1",
        "characterId": character_id,
        "clipId": clip_id,
        "status": "procedural-review-atlas-not-production-approved",
        "fps": ATLAS_FPS,
        "frameCount": frame_count,
        "loop": True,
        "sourceCanvas": {"width": renderer.MASTER_W, "height": renderer.MASTER_H},
        "atlasFrameCanvas": {"width": ATLAS_W, "height": ATLAS_H},
        "pageSize": {"width": PAGE_SIZE, "height": PAGE_SIZE},
        "padding": PADDING,
        "rotationAllowed": False,
        "trimmed": True,
        "stableBottomCentrePivot": True,
        "pages": page_records,
        "frames": packed_frames,
        "authority": {"providerExecution": False, "creativeApproval": False, "identityApproval": False, "candidatePromotion": False, "productionAdmission": False, "publication": False, "runtimeActivation": False, "websiteActivation": False, "deployment": False},
    }
    metadata = clip_root / "atlas.json"
    metadata.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    record["metadataPath"] = metadata.relative_to(output_root).as_posix()
    record["metadataSha256"] = sha256_bytes(metadata.read_bytes())
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--renderer", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    renderer = load_renderer(args.renderer)
    if args.output.exists():
        raise RuntimeError("COUNCIL_AVATAR_PROCEDURAL_ATLAS_OUTPUT_ALREADY_EXISTS")
    args.output.mkdir(parents=True, exist_ok=False)
    targets = [(character_id, "idle-primary", 4.0) for character_id in renderer.CHARACTERS]
    targets.append(("eva-female", "run-loop", 1.2))
    clips = [compile_clip(renderer, args.output, *target) for target in targets]
    manifest = {
        "schema": "evavo.project-art-council-avatar-procedural-review-atlas-manifest.v1",
        "status": "procedural-review-atlases-verified-not-production-approved",
        "clips": clips,
        "summary": {
            "clipCount": len(clips),
            "frameCount": sum(clip["frameCount"] for clip in clips),
            "pageCount": sum(len(clip["pages"]) for clip in clips),
        },
        "authority": {"providerExecution": False, "creativeApproval": False, "identityApproval": False, "candidatePromotion": False, "productionAdmission": False, "publication": False, "runtimeActivation": False, "websiteActivation": False, "deployment": False},
    }
    manifest_path = args.output / "atlas-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
