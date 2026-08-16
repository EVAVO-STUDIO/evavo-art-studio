"""Deterministic transparency admission shared by Pillow-based Art Studio tools.

This module never edits an image.  It distinguishes real, usable alpha from
opaque containers, token transparent rims, painted checkerboards and dominant
flat mattes so downstream sheet and atlas builders can fail closed.
"""
from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Iterable

from PIL import Image

CHECKER_TILE_SIZES = (2, 3, 4, 6, 8, 10, 12, 16, 20, 22, 23, 24, 26, 28, 32, 48, 64, 96, 128)
POLICIES = frozenset({"required", "preferred", "opaque"})


def _colour_distance(left: tuple[float, float, float], right: tuple[float, float, float]) -> float:
    return math.sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))


def _border_pixels(width: int, height: int) -> Iterable[tuple[int, int]]:
    for x in range(width):
        yield x, 0
        if height > 1:
            yield x, height - 1
    for y in range(1, height - 1):
        yield 0, y
        if width > 1:
            yield width - 1, y


def _band_samples(rgba: Image.Image) -> tuple[list[tuple[int, int, int, int, int]], dict[str, float | int]]:
    width, height = rgba.size
    band = max(8, int(min(width, height) * 0.16))
    band_pixels = width * height - max(0, width - band * 2) * max(0, height - band * 2)
    stride = max(1, math.ceil(math.sqrt(max(1, band_pixels) / 12_000)))
    pixels = rgba.load()
    samples: list[tuple[int, int, int, int, int]] = []
    sampled = visible = opaque = low_chroma = 0
    for y in range(0, height, stride):
        for x in range(0, width, stride):
            if band <= x < width - band and band <= y < height - band:
                continue
            sampled += 1
            red, green, blue, alpha = pixels[x, y]
            if alpha < 32:
                continue
            visible += 1
            if alpha >= 254:
                opaque += 1
            if max(red, green, blue) - min(red, green, blue) <= 32:
                low_chroma += 1
            samples.append((x, y, red, green, blue))
    return samples, {
        "sampled": sampled,
        "visibleFraction": visible / max(1, sampled),
        "opaqueFraction": opaque / max(1, sampled),
        "lowChromaFraction": low_chroma / max(1, visible),
        "stride": stride,
        "band": band,
    }


def _dominant_parity_colour(
    samples: list[tuple[int, int, int, int, int]],
    tile: int,
    phase_x: int,
    phase_y: int,
) -> tuple[tuple[float, float, float], tuple[float, float, float]] | None:
    bins: list[dict[tuple[int, int, int], list[int]]] = [defaultdict(lambda: [0, 0, 0, 0]), defaultdict(lambda: [0, 0, 0, 0])]
    for x, y, red, green, blue in samples:
        parity = (math.floor((x + phase_x) / tile) + math.floor((y + phase_y) / tile)) & 1
        bucket = bins[parity][(red // 8, green // 8, blue // 8)]
        bucket[0] += 1
        bucket[1] += red
        bucket[2] += green
        bucket[3] += blue
    colours: list[tuple[float, float, float]] = []
    for parity_bins in bins:
        if not parity_bins:
            return None
        count, red, green, blue = max(parity_bins.values(), key=lambda value: value[0])
        if count < 12:
            return None
        colours.append((red / count, green / count, blue / count))
    return colours[0], colours[1]


def _checkerboard_evidence(rgba: Image.Image) -> dict[str, Any]:
    samples, sample_stats = _band_samples(rgba)
    best: dict[str, Any] | None = None
    width, height = rgba.size
    if len(samples) >= 32:
        for tile in CHECKER_TILE_SIZES:
            if width / tile < 4 or height / tile < 4:
                continue
            offsets = sorted({0, tile // 4, tile // 2, (3 * tile) // 4})
            for phase_x in offsets:
                for phase_y in offsets:
                    colours = _dominant_parity_colour(samples, tile, phase_x, phase_y)
                    if colours is None:
                        continue
                    separation = _colour_distance(colours[0], colours[1])
                    fit_distance = max(14.0, separation * 0.28)
                    fitted = eligible = 0
                    squared_error = 0.0
                    for x, y, red, green, blue in samples:
                        parity = (math.floor((x + phase_x) / tile) + math.floor((y + phase_y) / tile)) & 1
                        observed = (red, green, blue)
                        expected_distance = _colour_distance(observed, colours[parity])
                        alternate_distance = _colour_distance(observed, colours[parity ^ 1])
                        if min(expected_distance, alternate_distance) <= fit_distance:
                            eligible += 1
                        if expected_distance <= fit_distance and expected_distance <= alternate_distance:
                            fitted += 1
                            squared_error += expected_distance**2
                    fit_fraction = fitted / max(1, eligible)
                    coverage_fraction = eligible / max(1, len(samples))
                    rmse = math.sqrt(squared_error / max(1, fitted))
                    score = fit_fraction * separation * math.sqrt(coverage_fraction) / max(1.0, rmse)
                    candidate = {
                        "tileSize": tile,
                        "phaseX": phase_x,
                        "phaseY": phase_y,
                        "colours": [[round(channel) for channel in colour] for colour in colours],
                        "colourSeparation": separation,
                        "fitFraction": fit_fraction,
                        "coverageFraction": coverage_fraction,
                        "rmse": rmse,
                        "score": score,
                    }
                    if best is None or score > best["score"]:
                        best = candidate
    neutral = bool(
        best
        and sample_stats["lowChromaFraction"] >= 0.78
        and (
            (
                best["colourSeparation"] >= 18
                and best["rmse"] <= 18
                and best["fitFraction"] >= 0.88
                and best["coverageFraction"] >= 0.3
            )
            or (
                best["colourSeparation"] >= 10
                and best["rmse"] <= 4
                and best["fitFraction"] >= 0.82
                and best["coverageFraction"] >= 0.5
                and width / best["tileSize"] >= 8
                and height / best["tileSize"] >= 8
            )
        )
    )
    chromatic = bool(
        best
        and best["colourSeparation"] >= 32
        and best["rmse"] <= 12
        and best["fitFraction"] >= 0.92
        and best["coverageFraction"] >= 0.3
    )
    detected = bool(
        best
        and (sample_stats["opaqueFraction"] >= 0.25 or sample_stats["visibleFraction"] >= 0.7)
        and (neutral or chromatic)
    )
    confidence = 0.0
    if detected and best:
        confidence = max(
            0.86,
            min(
                1.0,
                best["fitFraction"]
                * min(1.0, 8 / max(1.0, best["rmse"]))
                * (0.9 + 0.1 * math.sqrt(best["coverageFraction"])),
            ),
        )
    return {
        "detected": detected,
        "confidence": round(confidence, 6),
        "sampledBorderBandPixels": int(sample_stats["sampled"]),
        "visibleBorderBandFraction": round(float(sample_stats["visibleFraction"]), 6),
        "opaqueBorderBandFraction": round(float(sample_stats["opaqueFraction"]), 6),
        "lowChromaBorderBandFraction": round(float(sample_stats["lowChromaFraction"]), 6),
        "tileSize": best["tileSize"] if detected and best else None,
        "phaseX": best["phaseX"] if detected and best else None,
        "phaseY": best["phaseY"] if detected and best else None,
        "colours": best["colours"] if detected and best else [],
        "colourSeparation": round(best["colourSeparation"], 4) if detected and best else None,
        "fitFraction": round(best["fitFraction"], 6) if detected and best else None,
        "coverageFraction": round(best["coverageFraction"], 6) if detected and best else None,
        "rmse": round(best["rmse"], 4) if detected and best else None,
    }


def _flat_matte_evidence(rgba: Image.Image) -> dict[str, Any]:
    samples, stats = _band_samples(rgba)
    buckets: dict[tuple[int, int, int], list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    for _x, _y, red, green, blue in samples:
        bucket = buckets[(red // 8, green // 8, blue // 8)]
        bucket[0] += 1
        bucket[1] += red
        bucket[2] += green
        bucket[3] += blue
    if not buckets or not samples:
        return {
            "detected": False,
            "confidence": 0.0,
            "colour": None,
            "matchingVisibleFraction": 0.0,
            "matchingBorderBandFraction": 0.0,
            "visibleBorderBandFraction": round(float(stats["visibleFraction"]), 6),
            "rmse": None,
            "highChroma": False,
        }
    count, red_total, green_total, blue_total = max(buckets.values(), key=lambda value: value[0])
    colour = (red_total / count, green_total / count, blue_total / count)
    matching: list[float] = []
    for _x, _y, red, green, blue in samples:
        distance = _colour_distance((red, green, blue), colour)
        if distance <= 36:
            matching.append(distance)
    fraction = len(matching) / max(1, len(samples))
    matching_band_fraction = len(matching) / max(1, int(stats["sampled"]))
    rmse = math.sqrt(sum(value**2 for value in matching) / max(1, len(matching)))
    channels = colour
    high_chroma = max(channels) - min(channels) >= 140 and max(channels) >= 210 and min(channels) <= 45
    minimum_fraction = 0.78 if high_chroma else 0.9
    maximum_rmse = 28 if high_chroma else 18
    detected = bool(
        stats["visibleFraction"] >= 0.3
        and matching_band_fraction >= 0.7
        and fraction >= minimum_fraction
        and rmse <= maximum_rmse
    )
    return {
        "detected": detected,
        "confidence": round(fraction * min(1.0, 18 / max(1.0, rmse)), 6) if detected else 0.0,
        "colour": [round(channel) for channel in colour] if detected else None,
        "matchingVisibleFraction": round(fraction, 6),
        "matchingBorderBandFraction": round(matching_band_fraction, 6),
        "visibleBorderBandFraction": round(float(stats["visibleFraction"]), 6),
        "rmse": round(rmse, 4),
        "highChroma": high_chroma,
    }


def inspect_transparency(
    image: Image.Image,
    policy: str = "required",
    *,
    encoded_has_alpha: bool | None = None,
) -> dict[str, Any]:
    """Return admission evidence without changing the supplied image."""
    if policy not in POLICIES:
        raise ValueError(f"Transparency policy must be one of: {', '.join(sorted(POLICIES))}.")
    has_alpha = (
        "A" in image.getbands()
        or image.mode in {"LA", "PA"}
        or "transparency" in image.info
        if encoded_has_alpha is None
        else encoded_has_alpha
    )
    rgba = image.convert("RGBA")
    histogram = rgba.getchannel("A").histogram()
    total = max(1, rgba.width * rgba.height)
    transparent = histogram[0]
    opaque = histogram[255]
    partial = total - transparent - opaque
    border = list(_border_pixels(rgba.width, rgba.height))
    pixel = rgba.load()
    transparent_border = sum(1 for x, y in border if pixel[x, y][3] == 0)
    border_fraction = transparent_border / max(1, len(border))
    checkerboard = _checkerboard_evidence(rgba)
    flat_matte = _flat_matte_evidence(rgba)
    blockers: list[str] = []
    if checkerboard["detected"]:
        blockers.append("painted-checkerboard-detected")
    if policy != "opaque":
        if flat_matte["detected"]:
            blockers.append("painted-flat-matte-detected")
    if policy == "required":
        if not has_alpha:
            blockers.append("encoded-alpha-channel-required")
        if transparent + partial == 0:
            blockers.append("meaningful-alpha-required")
        if border_fraction < 1:
            blockers.append("fully-transparent-canvas-edge-required")
    return {
        "schema": "evavo.transparency-admission.v1",
        "policy": policy,
        "passed": not blockers,
        "hasAlphaChannel": has_alpha,
        "alpha": {
            "transparentPixels": transparent,
            "partialPixels": partial,
            "opaquePixels": opaque,
            "transparentFraction": round(transparent / total, 6),
            "partialFraction": round(partial / total, 6),
            "opaqueFraction": round(opaque / total, 6),
            "transparentBorderFraction": round(border_fraction, 6),
        },
        "checkerboard": checkerboard,
        "flatMatte": flat_matte,
        "blockers": blockers,
        "guarantees": {
            "decodedPixelsInspected": True,
            "paintedGridNeverAcceptedAsAlpha": True,
            "sourcePixelsChanged": False,
        },
    }


def require_transparency(
    image: Image.Image,
    label: str,
    policy: str = "required",
    *,
    encoded_has_alpha: bool | None = None,
) -> dict[str, Any]:
    evidence = inspect_transparency(
        image,
        policy,
        encoded_has_alpha=encoded_has_alpha,
    )
    if not evidence["passed"]:
        raise ValueError(f"{label} failed transparency admission: {', '.join(evidence['blockers'])}.")
    return evidence
