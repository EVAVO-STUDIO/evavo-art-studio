#!/usr/bin/env python3
"""Deterministic, provider-neutral visual features for EVAVO image tooling."""
from __future__ import annotations

import hashlib
import math
from collections import Counter
from pathlib import Path
from statistics import median
from typing import Any, Iterable

try:
    from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageStat
except ImportError as error:  # pragma: no cover - exercised by deployment preflight
    raise RuntimeError("Pillow is required: install requirements-image-pipeline.txt") from error

FEATURE_VERSION = "evavo.image-style-features.v1"
RESAMPLE = getattr(Image, "Resampling", Image).LANCZOS


def sha256_file(path: Path, maximum_bytes: int = 2_147_483_648) -> tuple[str, int]:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"not a regular file: {path}")
    digest = hashlib.sha256()
    total = 0
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > maximum_bytes:
                raise ValueError(f"image exceeds maximum byte length: {path}")
            digest.update(chunk)
    return digest.hexdigest(), total


def resolve_inside(root: Path, relative: str, must_exist: bool = True) -> Path:
    if not isinstance(relative, str) or not relative.strip():
        raise ValueError("relative image path is required")
    candidate_input = Path(relative)
    if candidate_input.is_absolute() or ".." in candidate_input.parts:
        raise ValueError(f"image path escaped approved root: {relative}")
    root_resolved = root.resolve(strict=True)
    candidate = (root_resolved / candidate_input).resolve(strict=must_exist)
    try:
        candidate.relative_to(root_resolved)
    except ValueError as error:
        raise ValueError(f"image path escaped approved root: {relative}") from error
    if must_exist and (candidate.is_symlink() or not candidate.is_file()):
        raise ValueError(f"image is not a regular file: {candidate}")
    return candidate


def load_image(path: Path, maximum_pixels: int = 220_000_000) -> Image.Image:
    with Image.open(path) as opened:
        width, height = opened.size
        if width < 1 or height < 1 or width * height > maximum_pixels:
            raise ValueError(f"decoded pixel limit exceeded: {path} ({width}x{height})")
        image = ImageOps.exif_transpose(opened)
        image.load()
        return image.convert("RGBA")


def preview(image: Image.Image, maximum: int = 256) -> Image.Image:
    output = image.copy()
    output.thumbnail((maximum, maximum), RESAMPLE)
    return output


def alpha_statistics(image: Image.Image) -> dict[str, Any]:
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    total = max(1, image.width * image.height)
    transparent = histogram[0]
    opaque = histogram[255]
    partial = total - transparent - opaque
    return {
        "transparentRatio": transparent / total,
        "partialRatio": partial / total,
        "opaqueRatio": opaque / total,
        "meaningfulAlpha": transparent > 0 or partial > 0,
        "fullyTransparent": transparent == total,
        "fullyOpaque": opaque == total,
    }


def corner_colour(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    points = (
        (0, 0),
        (max(0, rgb.width - 1), 0),
        (0, max(0, rgb.height - 1)),
        (max(0, rgb.width - 1), max(0, rgb.height - 1)),
    )
    values = [rgb.getpixel(point) for point in points]
    return tuple(int(median(channel)) for channel in zip(*values))


def active_mask(image: Image.Image) -> Image.Image:
    small = preview(image)
    alpha = small.getchannel("A")
    alpha_histogram = alpha.histogram()
    if alpha_histogram[0] + sum(alpha_histogram[1:255]) > 0:
        return alpha.point(lambda value: 255 if value > 8 else 0, mode="1")
    background = corner_colour(small)
    flat = Image.new("RGB", small.size, background)
    difference = ImageChops.difference(small.convert("RGB"), flat).convert("L")
    return difference.point(lambda value: 255 if value > 18 else 0, mode="1")


def occupancy_grid(mask: Image.Image, columns: int = 4, rows: int = 4) -> list[float]:
    grayscale = mask.convert("L")
    values: list[float] = []
    for row in range(rows):
        top = round(row * grayscale.height / rows)
        bottom = round((row + 1) * grayscale.height / rows)
        for column in range(columns):
            left = round(column * grayscale.width / columns)
            right = round((column + 1) * grayscale.width / columns)
            cell = grayscale.crop((left, top, max(left + 1, right), max(top + 1, bottom)))
            values.append(ImageStat.Stat(cell).mean[0] / 255.0)
    return values


def perceptual_dhash(image: Image.Image) -> str:
    grayscale = image.convert("L").resize((9, 8), RESAMPLE)
    pixels = list(grayscale.getdata())
    bits = []
    for row in range(8):
        start = row * 9
        bits.extend(pixels[start + column] > pixels[start + column + 1] for column in range(8))
    value = 0
    for bit in bits:
        value = (value << 1) | int(bit)
    return f"{value:016x}"


def dominant_palette(image: Image.Image, colours: int = 8) -> list[dict[str, Any]]:
    small = preview(image).convert("RGB")
    quantized = small.quantize(colors=colours, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    counts = Counter(quantized.getdata())
    total = max(1, small.width * small.height)
    output: list[dict[str, Any]] = []
    for index, count in counts.most_common(colours):
        offset = index * 3
        rgb = palette[offset : offset + 3]
        if len(rgb) == 3:
            output.append({"rgb": rgb, "ratio": count / total})
    return output


def red_accent_ratio(image: Image.Image) -> float:
    small = preview(image).convert("RGB")
    total = max(1, small.width * small.height)
    red = 0
    for r, g, b in small.getdata():
        if r >= 72 and r >= g * 1.35 and r >= b * 1.35 and r - min(g, b) >= 28:
            red += 1
    return red / total


def edge_density(image: Image.Image) -> float:
    edges = preview(image).convert("L").filter(ImageFilter.FIND_EDGES)
    return ImageStat.Stat(edges).mean[0] / 255.0


def feature_vector(image: Image.Image) -> dict[str, Any]:
    alpha = alpha_statistics(image)
    small = preview(image)
    luminance = small.convert("L")
    luminance_stat = ImageStat.Stat(luminance)
    mask = active_mask(image)
    bbox = mask.getbbox()
    active = ImageStat.Stat(mask.convert("L")).mean[0] / 255.0
    if bbox:
        left, top, right, bottom = bbox
        edge_contact = {
            "left": left == 0,
            "top": top == 0,
            "right": right >= mask.width,
            "bottom": bottom >= mask.height,
        }
        normalized_bounds = [
            left / mask.width,
            top / mask.height,
            right / mask.width,
            bottom / mask.height,
        ]
    else:
        edge_contact = {"left": False, "top": False, "right": False, "bottom": False}
        normalized_bounds = [0.0, 0.0, 0.0, 0.0]
    return {
        "featureVersion": FEATURE_VERSION,
        "width": image.width,
        "height": image.height,
        "aspectRatio": image.width / image.height,
        "alpha": alpha,
        "luminanceMean": luminance_stat.mean[0],
        "luminanceDeviation": luminance_stat.stddev[0],
        "entropy": luminance.entropy(),
        "edgeDensity": edge_density(image),
        "redAccentRatio": red_accent_ratio(image),
        "activeRatio": active,
        "activeBounds": normalized_bounds,
        "edgeContact": edge_contact,
        "occupancyGrid": occupancy_grid(mask),
        "dhash": perceptual_dhash(image),
        "dominantPalette": dominant_palette(image),
    }


def quantile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def aggregate_profile(features: list[dict[str, Any]]) -> dict[str, Any]:
    if not features:
        raise ValueError("cannot aggregate an empty style profile")
    scalar_names = (
        "aspectRatio",
        "luminanceMean",
        "luminanceDeviation",
        "entropy",
        "edgeDensity",
        "redAccentRatio",
        "activeRatio",
    )
    scalars: dict[str, dict[str, float]] = {}
    for name in scalar_names:
        values = [float(feature[name]) for feature in features]
        scalars[name] = {
            "median": float(median(values)),
            "p10": quantile(values, 0.10),
            "p90": quantile(values, 0.90),
        }
    occupancy_length = len(features[0]["occupancyGrid"])
    occupancy = [
        float(median([float(feature["occupancyGrid"][index]) for feature in features]))
        for index in range(occupancy_length)
    ]
    alpha_modes = Counter(
        "meaningful" if feature["alpha"]["meaningfulAlpha"] else "opaque"
        for feature in features
    )
    return {
        "referenceCount": len(features),
        "confidence": "high" if len(features) >= 8 else "medium" if len(features) >= 3 else "low",
        "scalars": scalars,
        "occupancyMedian": occupancy,
        "alphaModeCounts": dict(sorted(alpha_modes.items())),
        "referenceDhashes": sorted({feature["dhash"] for feature in features}),
    }


def hamming_hex(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def style_distance(features: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    centers = profile["scalars"]
    components = {
        "aspectRatio": min(1.0, abs(features["aspectRatio"] - centers["aspectRatio"]["median"]) / max(0.25, centers["aspectRatio"]["median"])),
        "luminanceMean": abs(features["luminanceMean"] - centers["luminanceMean"]["median"]) / 255.0,
        "luminanceDeviation": abs(features["luminanceDeviation"] - centers["luminanceDeviation"]["median"]) / 128.0,
        "entropy": abs(features["entropy"] - centers["entropy"]["median"]) / 8.0,
        "edgeDensity": abs(features["edgeDensity"] - centers["edgeDensity"]["median"]),
        "redAccentRatio": min(1.0, abs(features["redAccentRatio"] - centers["redAccentRatio"]["median"]) * 4.0),
        "activeRatio": abs(features["activeRatio"] - centers["activeRatio"]["median"]),
    }
    expected_occupancy = profile["occupancyMedian"]
    observed_occupancy = features["occupancyGrid"]
    occupancy = sum(abs(float(left) - float(right)) for left, right in zip(observed_occupancy, expected_occupancy)) / max(1, len(expected_occupancy))
    components["occupancy"] = occupancy
    weights = {
        "aspectRatio": 0.08,
        "luminanceMean": 0.12,
        "luminanceDeviation": 0.13,
        "entropy": 0.13,
        "edgeDensity": 0.18,
        "redAccentRatio": 0.12,
        "activeRatio": 0.10,
        "occupancy": 0.14,
    }
    score = sum(min(1.0, components[name]) * weights[name] for name in weights)
    hashes: Iterable[str] = profile.get("referenceDhashes", [])
    distances = [hamming_hex(features["dhash"], value) for value in hashes]
    return {
        "score": score,
        "components": components,
        "nearestReferenceDhashDistance": min(distances) if distances else None,
    }
