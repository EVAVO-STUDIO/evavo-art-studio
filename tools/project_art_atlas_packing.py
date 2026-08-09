from __future__ import annotations

import math
from typing import Any

from project_art_atlas_contract import fail, next_power_of_two
from project_art_atlas_models import Placement, PreparedFrame

def orientation_options(frame: PreparedFrame, allow_rotation: bool) -> list[tuple[int, int, bool]]:
    values = [(frame.trim_width, frame.trim_height, False)]
    if allow_rotation and frame.trim_width != frame.trim_height:
        values.append((frame.trim_height, frame.trim_width, True))
    return values


def pack_for_width(
    frames: list[PreparedFrame],
    width: int,
    max_height: int,
    margin: int,
    padding: int,
    extrude: int,
    allow_rotation: bool,
) -> tuple[list[Placement], int] | None:
    x = margin
    y = margin
    shelf_height = 0
    placements: list[Placement] = []
    usable_right = width - margin
    for frame in frames:
        options = orientation_options(frame, allow_rotation)
        selected = None
        for candidate_width, candidate_height, rotated in options:
            cell_width = candidate_width + 2 * extrude
            cell_height = candidate_height + 2 * extrude
            if x + cell_width <= usable_right:
                score = (max(shelf_height, cell_height), usable_right - (x + cell_width), rotated)
                if selected is None or score < selected[0]:
                    selected = (score, candidate_width, candidate_height, rotated, cell_width, cell_height)
        if selected is None:
            x = margin
            y += shelf_height + padding
            shelf_height = 0
            for candidate_width, candidate_height, rotated in options:
                cell_width = candidate_width + 2 * extrude
                cell_height = candidate_height + 2 * extrude
                if x + cell_width <= usable_right:
                    score = (cell_height, usable_right - (x + cell_width), rotated)
                    if selected is None or score < selected[0]:
                        selected = (score, candidate_width, candidate_height, rotated, cell_width, cell_height)
        if selected is None:
            return None
        _, placed_width, placed_height, rotated, cell_width, cell_height = selected
        if y + cell_height + margin > max_height:
            return None
        placements.append(
            Placement(
                frame=frame,
                x=x + extrude,
                y=y + extrude,
                width=placed_width,
                height=placed_height,
                rotated=rotated,
            )
        )
        x += cell_width + padding
        shelf_height = max(shelf_height, cell_height)
    used_height = y + shelf_height + margin
    return placements, used_height


def candidate_widths(frames: list[PreparedFrame], options: dict[str, Any]) -> list[int]:
    margin = int(options["margin"])
    extrude = int(options["extrude"])
    padding = int(options["padding"])
    maximum = int(options["maximumWidth"])
    allow_rotation = bool(options["allowRotation"])
    largest = max(
        min(width for width, _, _ in orientation_options(frame, allow_rotation))
        + 2 * extrude
        for frame in frames
    ) + 2 * margin
    area = sum(
        (frame.trim_width + 2 * extrude + padding)
        * (frame.trim_height + 2 * extrude + padding)
        for frame in frames
    )
    target = max(largest, int(math.sqrt(area)) + 2 * margin)
    if bool(options["powerOfTwo"]):
        start = next_power_of_two(largest)
        widths = []
        value = start
        while value <= maximum:
            widths.append(value)
            value *= 2
        return widths
    candidates = {largest, min(maximum, target), maximum}
    for factor in (0.75, 1.0, 1.25, 1.5, 2.0):
        candidates.add(max(largest, min(maximum, int(target * factor))))
    return sorted(value for value in candidates if largest <= value <= maximum)


def choose_layout(frames: list[PreparedFrame], options: dict[str, Any]) -> tuple[list[Placement], int, int]:
    ordered = sorted(
        frames,
        key=lambda frame: (
            -max(frame.trim_width, frame.trim_height),
            -(frame.trim_width * frame.trim_height),
            frame.frame_id,
        ),
    )
    margin = int(options["margin"])
    padding = int(options["padding"])
    extrude = int(options["extrude"])
    max_height = int(options["maximumHeight"])
    best: tuple[tuple[int, int, int], list[Placement], int, int] | None = None
    for width in candidate_widths(ordered, options):
        packed = pack_for_width(
            ordered,
            width,
            max_height,
            margin,
            padding,
            extrude,
            bool(options["allowRotation"]),
        )
        if packed is None:
            continue
        placements, used_height = packed
        if bool(options["powerOfTwo"]):
            height = next_power_of_two(used_height)
        else:
            height = used_height
        final_width = width
        if bool(options["square"]):
            side = max(final_width, height)
            if bool(options["powerOfTwo"]):
                side = next_power_of_two(side)
            final_width = height = side
        if final_width > int(options["maximumWidth"]) or height > max_height:
            continue
        score = (final_width * height, max(final_width, height), final_width)
        if best is None or score < best[0]:
            best = (score, placements, final_width, height)
    if best is None:
        fail("Frames cannot fit within the configured maximum atlas dimensions.")
    return best[1], best[2], best[3]
