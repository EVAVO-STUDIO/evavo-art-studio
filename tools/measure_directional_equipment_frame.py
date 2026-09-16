#!/usr/bin/env python3
"""Measure sprite/equipment geometry and style from exact decoded pixels.

The equipment mask is reviewed input. This tool never guesses which pixels form a
shield, weapon, hand, strap, or other semantic part. It verifies that the mask is
inside the visible subject and emits deterministic evidence for the v2 continuity
contract without modifying any source image.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageFilter, ImageStat

ALPHA_THRESHOLD = 8


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as image:
        image.load()
        return image.convert("RGBA")


def load_mask(path: Path, size: tuple[int, int]) -> Image.Image:
    with Image.open(path) as image:
        image.load()
        mask = image.convert("L")
    if mask.size != size:
        raise ValueError(f"equipment mask dimensions {mask.size} do not match frame {size}")
    return mask.point(lambda value: 255 if value >= 128 else 0, mode="1").convert("L")


def alpha_mask(image: Image.Image) -> Image.Image:
    return image.getchannel("A").point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0, mode="1").convert("L")


def normalized_geometry(mask: Image.Image) -> dict[str, Any]:
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("mask has no visible pixels")
    width, height = mask.size
    pixels = mask.load()
    points = [(x, y) for y in range(height) for x in range(width) if pixels[x, y] > 0]
    count = len(points)
    cx = sum(x + 0.5 for x, _ in points) / count
    cy = sum(y + 0.5 for _, y in points) / count
    xx = sum((x + 0.5 - cx) ** 2 for x, _ in points) / count
    yy = sum((y + 0.5 - cy) ** 2 for _, y in points) / count
    xy = sum((x + 0.5 - cx) * (y + 0.5 - cy) for x, y in points) / count
    angle = 0.5 * math.degrees(math.atan2(2 * xy, xx - yy))
    spread = math.sqrt((xx - yy) ** 2 + 4 * xy * xy)
    confidence = spread / max(xx + yy, 1e-9)
    left, top, right, bottom = bbox
    return {
        "bounds": {
            "x": left / width,
            "y": top / height,
            "width": (right - left) / width,
            "height": (bottom - top) / height,
        },
        "centroid": {"x": cx / width, "y": cy / height},
        "visiblePixelCount": count,
        "canvasFraction": count / (width * height),
        "principalAxisDegrees": angle,
        "principalAxisConfidence": confidence,
    }


def visible_mean_rgb(image: Image.Image, mask: Image.Image) -> tuple[float, float, float]:
    return tuple(float(value) for value in ImageStat.Stat(image.convert("RGB"), mask=mask).mean)


def line_density(image: Image.Image, mask: Image.Image) -> float:
    edges = image.convert("L").filter(ImageFilter.FIND_EDGES)
    histogram = edges.histogram()
    visible = sum(mask.histogram()[128:])
    if visible == 0:
        return 0.0
    edge_mask = edges.point(lambda value: 255 if value >= 32 else 0, mode="1").convert("L")
    intersection = ImageChops.multiply(edge_mask, mask)
    return sum(intersection.histogram()[128:]) / visible


def translated(mask: Image.Image, dx: int, dy: int) -> Image.Image:
    output = Image.new("L", mask.size, 0)
    output.paste(mask, (dx, dy))
    return output


def centroid_aligned_iou(first: Image.Image, second: Image.Image) -> float:
    first_geometry = normalized_geometry(first)
    second_geometry = normalized_geometry(second)
    width, height = first.size
    dx = round((first_geometry["centroid"]["x"] - second_geometry["centroid"]["x"]) * width)
    dy = round((first_geometry["centroid"]["y"] - second_geometry["centroid"]["y"]) * height)
    aligned = translated(second, dx, dy)
    intersection = ImageChops.multiply(first, aligned)
    union = ImageChops.lighter(first, aligned)
    intersection_count = sum(intersection.histogram()[128:])
    union_count = sum(union.histogram()[128:])
    return intersection_count / union_count if union_count else 1.0


def _reviewed_mask_geometry(path: Path, size: tuple[int, int], subject: Image.Image, label: str) -> dict[str, Any]:
    mask = load_mask(path, size)
    outside = ImageChops.subtract(mask, subject)
    outside_count = sum(outside.histogram()[128:])
    if outside_count:
        raise ValueError(f"{label} mask contains {outside_count} pixels outside the visible subject")
    return normalized_geometry(mask)


def measure(
    canonical_path: Path,
    frame_path: Path,
    equipment_mask_path: Path,
    *,
    body_mask_path: Path | None = None,
    carrying_hand_mask_path: Path | None = None,
    off_hand_mask_path: Path | None = None,
    carrying_shoulder_mask_path: Path | None = None,
    off_shoulder_mask_path: Path | None = None,
    detail_masks: dict[str, Path] | None = None,
) -> dict[str, Any]:
    canonical = load_rgba(canonical_path)
    frame = load_rgba(frame_path)
    if canonical.size != frame.size:
        raise ValueError(f"canonical dimensions {canonical.size} do not match frame {frame.size}")
    subject = alpha_mask(frame)
    canonical_subject = alpha_mask(canonical)
    equipment = load_mask(equipment_mask_path, frame.size)
    outside = ImageChops.subtract(equipment, subject)
    outside_count = sum(outside.histogram()[128:])
    if outside_count:
        raise ValueError(f"equipment mask contains {outside_count} pixels outside the visible subject")
    subject_geometry = normalized_geometry(subject)
    canonical_geometry = normalized_geometry(canonical_subject)
    equipment_geometry = normalized_geometry(equipment)
    current_mean = visible_mean_rgb(frame, subject)
    canonical_mean = visible_mean_rgb(canonical, canonical_subject)
    palette_distance = math.sqrt(sum((a - b) ** 2 for a, b in zip(current_mean, canonical_mean)))
    current_lines = line_density(frame, subject)
    canonical_lines = line_density(canonical, canonical_subject)
    current_area = float(subject_geometry["visiblePixelCount"])
    canonical_area = float(canonical_geometry["visiblePixelCount"])
    pivot = {
        "x": subject_geometry["centroid"]["x"],
        "y": subject_geometry["bounds"]["y"] + subject_geometry["bounds"]["height"],
    }
    canonical_pivot = {
        "x": canonical_geometry["centroid"]["x"],
        "y": canonical_geometry["bounds"]["y"] + canonical_geometry["bounds"]["height"],
    }
    result = {
        "schema": "evavo.directional-equipment-frame-measurement.v1",
        "source": {"path": str(frame_path), "sha256": digest(frame_path)},
        "canonical": {"path": str(canonical_path), "sha256": digest(canonical_path)},
        "equipmentMask": {"path": str(equipment_mask_path), "sha256": digest(equipment_mask_path)},
        "canvas": {"width": frame.width, "height": frame.height},
        "subjectBounds": subject_geometry["bounds"],
        "subjectCentroid": subject_geometry["centroid"],
        "equipmentBounds": equipment_geometry["bounds"],
        "equipmentCentroid": equipment_geometry["centroid"],
        "equipmentScaleFraction": equipment_geometry["canvasFraction"],
        "equipmentRotationDegrees": equipment_geometry["principalAxisDegrees"],
        "equipmentRotationConfidence": equipment_geometry["principalAxisConfidence"],
        "pivot": pivot,
        "groundLine": pivot["y"],
        "styleEvidence": {
            "paletteDistanceFromCanonical": palette_distance,
            "lineDensityFractionChange": abs(current_lines - canonical_lines) / max(canonical_lines, 1e-9),
            "bodyScaleFractionChange": abs(current_area - canonical_area) / canonical_area,
            "pivotShiftFromCanonical": math.hypot(pivot["x"] - canonical_pivot["x"], pivot["y"] - canonical_pivot["y"]),
            "centroidAlignedSilhouetteIoU": centroid_aligned_iou(canonical_subject, subject),
        },
        "semanticReviewRequired": [
            "anatomical carrying side",
            "outer-face normal",
            "camera vector",
            "grip and attachment landmarks",
            "canonical details and legitimate occlusion",
        ],
        "runtimeAuthority": False,
    }
    reviewed_masks = {
        "subjectBodyCentroid": body_mask_path,
        "carryingHandPoint": carrying_hand_mask_path,
        "offHandPoint": off_hand_mask_path,
        "carryingShoulderPoint": carrying_shoulder_mask_path,
        "offShoulderPoint": off_shoulder_mask_path,
    }
    for output_name, path in reviewed_masks.items():
        if path is not None:
            result[output_name] = _reviewed_mask_geometry(path, frame.size, subject, output_name)["centroid"]
    observations = []
    for detail_id, path in sorted((detail_masks or {}).items()):
        if not detail_id.strip():
            raise ValueError("detail mask id cannot be empty")
        geometry = _reviewed_mask_geometry(path, frame.size, equipment, f"detail {detail_id}")
        observations.append({"detailId": detail_id, "location": geometry["centroid"], "maskSha256": digest(path)})
    if observations:
        result["detailObservations"] = observations
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--canonical", type=Path, required=True)
    parser.add_argument("--frame", type=Path, required=True)
    parser.add_argument("--equipment-mask", type=Path, required=True)
    parser.add_argument("--body-mask", type=Path)
    parser.add_argument("--carrying-hand-mask", type=Path)
    parser.add_argument("--off-hand-mask", type=Path)
    parser.add_argument("--carrying-shoulder-mask", type=Path)
    parser.add_argument("--off-shoulder-mask", type=Path)
    parser.add_argument("--detail-mask", action="append", default=[], metavar="DETAIL_ID=PATH")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit(f"refusing to overwrite existing measurement: {args.output}")
    detail_masks: dict[str, Path] = {}
    for declaration in args.detail_mask:
        if "=" not in declaration:
            raise SystemExit("--detail-mask must use DETAIL_ID=PATH")
        detail_id, path = declaration.split("=", 1)
        if detail_id in detail_masks:
            raise SystemExit(f"duplicate --detail-mask id: {detail_id}")
        detail_masks[detail_id] = Path(path)
    result = measure(
        args.canonical,
        args.frame,
        args.equipment_mask,
        body_mask_path=args.body_mask,
        carrying_hand_mask_path=args.carrying_hand_mask,
        off_hand_mask_path=args.off_hand_mask,
        carrying_shoulder_mask_path=args.carrying_shoulder_mask,
        off_shoulder_mask_path=args.off_shoulder_mask,
        detail_masks=detail_masks,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "measured", "output": str(args.output), "sourceSha256": result["source"]["sha256"]}))


if __name__ == "__main__":
    main()
