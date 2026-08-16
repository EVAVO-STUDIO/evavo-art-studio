from __future__ import annotations

from typing import Any

from PIL import Image, ImageChops, ImageFilter

_DIRECTIONS = (
    (-1, 0),
    (0, -1),
    (1, 0),
    (0, 1),
    (-1, -1),
    (1, -1),
    (-1, 1),
    (1, 1),
)


def _binary_count(mask: Image.Image) -> int:
    return int(mask.histogram()[255])


def _shift(image: Image.Image, dx: int, dy: int) -> Image.Image:
    """Move pixels without ImageChops.offset's wraparound behaviour."""
    width, height = image.size
    shifted = Image.new(image.mode, image.size, 0 if image.mode == "L" else (0, 0, 0))
    source_left = max(0, -dx)
    source_top = max(0, -dy)
    source_right = min(width, width - dx)
    source_bottom = min(height, height - dy)
    if source_right <= source_left or source_bottom <= source_top:
        return shifted
    region = image.crop((source_left, source_top, source_right, source_bottom))
    try:
        shifted.paste(region, (max(0, dx), max(0, dy)))
    finally:
        region.close()
    return shifted


def bleed_transparent_rgb(
    image: Image.Image,
    *,
    enabled: bool = True,
    radius: int = 8,
    alpha_threshold: int = 0,
) -> tuple[Image.Image, dict[str, Any]]:
    """Fill hidden RGB from nearby visible texels while preserving alpha exactly.

    The bounded eight-neighbour wavefront is deterministic. It changes only RGB
    for pixels whose alpha is at or below ``alpha_threshold``; source alpha and
    all stronger-alpha RGB values remain byte-identical.
    """
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be boolean.")
    if not isinstance(radius, int) or isinstance(radius, bool) or not 0 <= radius <= 64:
        raise ValueError("radius must be an integer between 0 and 64.")
    if (
        not isinstance(alpha_threshold, int)
        or isinstance(alpha_threshold, bool)
        or not 0 <= alpha_threshold <= 254
    ):
        raise ValueError("alpha_threshold must be an integer between 0 and 254.")

    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    alpha_histogram = alpha.histogram()
    eligible_pixels = int(sum(alpha_histogram[: alpha_threshold + 1]))
    total_pixels = rgba.width * rgba.height
    seed_pixels = total_pixels - eligible_pixels
    active = enabled and radius > 0 and eligible_pixels > 0 and seed_pixels > 0

    evidence: dict[str, Any] = {
        "schema": "evavo.project-art-transparent-rgb-bleed.v1",
        "enabled": enabled,
        "applied": active,
        "method": "bounded-eight-neighbour-visible-rgb-propagation",
        "radius": radius,
        "alphaThreshold": alpha_threshold,
        "eligiblePixels": eligible_pixels,
        "seedPixels": seed_pixels,
        "filledPixels": 0,
        "unreachedPixels": eligible_pixels,
        "passes": 0,
        "guarantees": {
            "alphaPreserved": True,
            "strongerAlphaRgbPreserved": True,
            "boundedPropagation": True,
            "sourceImageMutated": False,
        },
    }
    if not active:
        alpha.close()
        return rgba, evidence

    seed_mask = alpha.point(lambda value: 255 if value > alpha_threshold else 0)
    known = seed_mask.copy()
    source_rgb = rgba.convert("RGB")
    propagated_rgb = Image.new("RGB", rgba.size, (0, 0, 0))
    propagated_rgb.paste(source_rgb, mask=known)
    filled_mask = Image.new("L", rgba.size, 0)
    filled_pixels = 0
    passes = 0

    try:
        for pass_index in range(radius):
            expanded = known.filter(ImageFilter.MaxFilter(3))
            frontier = ImageChops.subtract(expanded, known)
            expanded.close()
            frontier_pixels = _binary_count(frontier)
            if frontier_pixels == 0:
                frontier.close()
                break

            remaining = frontier.copy()
            directions = _DIRECTIONS[pass_index % len(_DIRECTIONS) :] + _DIRECTIONS[: pass_index % len(_DIRECTIONS)]
            for dx, dy in directions:
                shifted_known = _shift(known, dx, dy)
                candidate = ImageChops.multiply(remaining, shifted_known)
                shifted_known.close()
                if candidate.getbbox() is not None:
                    shifted_rgb = _shift(propagated_rgb, dx, dy)
                    propagated_rgb.paste(shifted_rgb, mask=candidate)
                    shifted_rgb.close()
                    next_remaining = ImageChops.subtract(remaining, candidate)
                    remaining.close()
                    remaining = next_remaining
                candidate.close()
                if remaining.getbbox() is None:
                    break
            if remaining.getbbox() is not None:
                remaining.close()
                frontier.close()
                raise ValueError("Transparent RGB bleed could not resolve a propagation frontier.")
            remaining.close()

            next_known = ImageChops.lighter(known, frontier)
            known.close()
            known = next_known
            next_filled = ImageChops.lighter(filled_mask, frontier)
            filled_mask.close()
            filled_mask = next_filled
            frontier.close()
            filled_pixels += frontier_pixels
            passes = pass_index + 1

        output_rgb = Image.composite(propagated_rgb, source_rgb, filled_mask)
        red, green, blue = output_rgb.split()
        try:
            output = Image.merge("RGBA", (red, green, blue, alpha))
        finally:
            red.close()
            green.close()
            blue.close()
            output_rgb.close()
    finally:
        seed_mask.close()
        known.close()
        source_rgb.close()
        propagated_rgb.close()
        filled_mask.close()
        alpha.close()
        rgba.close()

    evidence["filledPixels"] = filled_pixels
    evidence["unreachedPixels"] = max(0, eligible_pixels - filled_pixels)
    evidence["passes"] = passes
    return output, evidence
