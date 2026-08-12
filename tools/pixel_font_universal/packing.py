"""Deterministic MaxRects, shelf and fixed-grid atlas packing."""
from .common import *
from .source import *
from .operations import *

def next_power_of_two(value: int) -> int:
    result = 1
    while result < value:
        result <<= 1
    return result


@dataclass
class Rectangle:
    codepoint: int
    width: int
    height: int
    pixels: PixelMap
    xoffset: int
    yoffset: int
    advance: int
    x: int = 0
    y: int = 0
    page: int = 0


def intersects(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return a[0] < b[0] + b[2] and a[0] + a[2] > b[0] and a[1] < b[1] + b[3] and a[1] + a[3] > b[1]


def contains(outer: tuple[int, int, int, int], inner: tuple[int, int, int, int]) -> bool:
    return inner[0] >= outer[0] and inner[1] >= outer[1] and inner[0] + inner[2] <= outer[0] + outer[2] and inner[1] + inner[3] <= outer[1] + outer[3]


def split_free(free: tuple[int, int, int, int], used: tuple[int, int, int, int]) -> list[tuple[int, int, int, int]]:
    if not intersects(free, used):
        return [free]
    fx, fy, fw, fh = free
    ux, uy, uw, uh = used
    result: list[tuple[int, int, int, int]] = []
    if ux > fx:
        result.append((fx, fy, ux - fx, fh))
    if ux + uw < fx + fw:
        result.append((ux + uw, fy, fx + fw - (ux + uw), fh))
    if uy > fy:
        result.append((fx, fy, fw, uy - fy))
    if uy + uh < fy + fh:
        result.append((fx, uy + uh, fw, fy + fh - (uy + uh)))
    return [item for item in result if item[2] > 0 and item[3] > 0]


def prune_free(rectangles: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    result: list[tuple[int, int, int, int]] = []
    for index, item in enumerate(rectangles):
        if any(index != other_index and contains(other, item) for other_index, other in enumerate(rectangles)):
            continue
        if item not in result:
            result.append(item)
    return sorted(result, key=lambda value: (value[1], value[0], value[2] * value[3]))


def maxrects_page(items: list[Rectangle], width: int, height: int, padding: int) -> tuple[list[Rectangle], list[Rectangle]]:
    free = [(0, 0, width, height)]
    placed: list[Rectangle] = []
    remaining: list[Rectangle] = []
    for item in items:
        packed_width = item.width + padding * 2
        packed_height = item.height + padding * 2
        candidates: list[tuple[int, int, int, int, int]] = []
        for index, node in enumerate(free):
            if packed_width <= node[2] and packed_height <= node[3]:
                short = min(node[2] - packed_width, node[3] - packed_height)
                long = max(node[2] - packed_width, node[3] - packed_height)
                candidates.append((short, long, node[1], node[0], index))
        if not candidates:
            remaining.append(item)
            continue
        _, _, _, _, node_index = min(candidates)
        node = free[node_index]
        used = (node[0], node[1], packed_width, packed_height)
        free = prune_free([part for candidate in free for part in split_free(candidate, used)])
        item.x = used[0] + padding
        item.y = used[1] + padding
        placed.append(item)
    return placed, remaining


def shelf_page(items: list[Rectangle], width: int, height: int, padding: int) -> tuple[list[Rectangle], list[Rectangle]]:
    x = y = padding
    row_height = 0
    placed: list[Rectangle] = []
    remaining: list[Rectangle] = []
    for item in items:
        if x + item.width + padding > width:
            x = padding
            y += row_height + padding
            row_height = 0
        if y + item.height + padding > height:
            remaining.append(item)
            continue
        item.x = x
        item.y = y
        placed.append(item)
        x += item.width + padding
        row_height = max(row_height, item.height)
    return placed, remaining


def fixed_grid_pages(items: list[Rectangle], profile: Mapping[str, Any]) -> tuple[list[Rectangle], int, int, int]:
    atlas = profile["atlas"]
    padding = atlas["padding"]
    cell_width = max(atlas["cellWidth"], max((item.width for item in items), default=1) + padding * 2)
    cell_height = max(atlas["cellHeight"], max((item.height for item in items), default=1) + padding * 2)
    columns = min(atlas["columns"], max(1, atlas["maximumEdge"] // cell_width))
    rows_per_page = max(1, atlas["maximumEdge"] // cell_height)
    capacity = columns * rows_per_page
    page_count = max(1, math.ceil(len(items) / capacity))
    if page_count > MAX_PAGES or (page_count > 1 and not atlas["allowMultiPage"]):
        fail("fixed-grid atlas exceeds configured page limits")
    used_rows = max(1, min(rows_per_page, math.ceil(min(len(items), capacity) / columns)))
    width = columns * cell_width
    height = used_rows * cell_height
    if atlas["powerOfTwo"]:
        width = next_power_of_two(width)
        height = next_power_of_two(height)
    for index, item in enumerate(items):
        item.page = index // capacity
        slot = index % capacity
        item.x = (slot % columns) * cell_width + padding
        item.y = (slot // columns) * cell_height + padding
    return items, width, height, page_count


def pack_rectangles(items: list[Rectangle], profile: Mapping[str, Any]) -> tuple[list[Rectangle], int, int, int]:
    if not items:
        return items, 32, 32, 1
    atlas = profile["atlas"]
    if atlas["strategy"] == "fixed-grid":
        return fixed_grid_pages(items, profile)
    maximum = atlas["maximumEdge"]
    padding = atlas["padding"]
    minimum = max(max(item.width, item.height) + padding * 2 for item in items)
    size = next_power_of_two(max(32, minimum)) if atlas["powerOfTwo"] else max(32, minimum)
    candidate_sizes: list[int] = []
    while size <= maximum:
        candidate_sizes.append(size)
        size = size * 2 if atlas["powerOfTwo"] else min(maximum + 1, size + max(32, size // 2))
    if not candidate_sizes:
        fail("a glyph exceeds the configured atlas edge")
    ordered = sorted(items, key=lambda item: (-item.height, -item.width, item.codepoint))
    for edge in candidate_sizes:
        remaining = ordered
        pages: list[list[Rectangle]] = []
        while remaining:
            copies = [Rectangle(**{**item.__dict__, "x": 0, "y": 0, "page": 0}) for item in remaining]
            if atlas["strategy"] == "maxrects":
                placed, rest = maxrects_page(copies, edge, edge, padding)
            else:
                placed, rest = shelf_page(copies, edge, edge, padding)
            if not placed:
                break
            page = len(pages)
            for item in placed:
                item.page = page
            pages.append(placed)
            placed_codepoints = {item.codepoint for item in placed}
            remaining = [item for item in remaining if item.codepoint not in placed_codepoints]
            if len(pages) > MAX_PAGES or (len(pages) > 1 and not atlas["allowMultiPage"]):
                break
        if not remaining and pages and len(pages) <= MAX_PAGES:
            flattened = [item for page in pages for item in page]
            return flattened, edge, edge, len(pages)
    fail("font atlas exceeds configured edge/page limits")


