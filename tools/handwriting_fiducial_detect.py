from __future__ import annotations

import argparse
import json
import math
from collections import deque
from pathlib import Path

REGISTRATION_SCHEMA = "evavo.art-studio.handwriting-photo-registration.v1"
PAGE_W_MM = 210.0
PAGE_H_MM = 297.0
FIDUCIAL_CENTERS_MM = {
    "topLeft": (14.0, 14.0),
    "topRight": (196.0, 14.0),
    "bottomRight": (196.0, 283.0),
    "bottomLeft": (14.0, 283.0),
}


def _pil():
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required for handwriting fiducial detection") from exc
    return Image


def _solve(matrix: list[list[float]], values: list[float]) -> list[float]:
    n = len(values)
    augmented = [list(matrix[row]) + [float(values[row])] for row in range(n)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda row: abs(augmented[row][col]))
        if abs(augmented[pivot][col]) < 1e-10:
            raise ValueError("detected fiducials are projectively degenerate")
        augmented[col], augmented[pivot] = augmented[pivot], augmented[col]
        divisor = augmented[col][col]
        augmented[col] = [value / divisor for value in augmented[col]]
        for row in range(n):
            if row == col:
                continue
            factor = augmented[row][col]
            if factor:
                augmented[row] = [augmented[row][index] - factor * augmented[col][index] for index in range(n + 1)]
    return [augmented[row][-1] for row in range(n)]


def _homography(source_points: list[tuple[float, float]], image_points: list[tuple[float, float]]) -> list[float]:
    matrix: list[list[float]] = []
    values: list[float] = []
    for (x, y), (u, v) in zip(source_points, image_points):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        values.append(u)
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        values.append(v)
    return _solve(matrix, values)


def _project(h: list[float], x: float, y: float) -> tuple[float, float]:
    denominator = h[6] * x + h[7] * y + 1.0
    if abs(denominator) < 1e-10:
        raise ValueError("fiducial homography projects through infinity")
    return ((h[0] * x + h[1] * y + h[2]) / denominator, (h[3] * x + h[4] * y + h[5]) / denominator)


def _component_candidates(gray, box: tuple[int, int, int, int]) -> list[dict]:
    x0, y0, x1, y1 = box
    width = x1 - x0
    height = y1 - y0
    pixels = gray.load()
    dark = bytearray(width * height)
    for yy in range(height):
        source_y = y0 + yy
        offset = yy * width
        for xx in range(width):
            if pixels[x0 + xx, source_y] <= 82:
                dark[offset + xx] = 1
    seen = bytearray(width * height)
    candidates = []
    for yy in range(height):
        for xx in range(width):
            index = yy * width + xx
            if not dark[index] or seen[index]:
                continue
            queue = deque([(xx, yy)])
            seen[index] = 1
            count = 0
            min_x = max_x = xx
            min_y = max_y = yy
            while queue:
                cx, cy = queue.popleft()
                count += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        ni = ny * width + nx
                        if dark[ni] and not seen[ni]:
                            seen[ni] = 1
                            queue.append((nx, ny))
            bw = max_x - min_x + 1
            bh = max_y - min_y + 1
            if bw < 5 or bh < 5:
                continue
            aspect = bw / max(bh, 1)
            fill = count / float(bw * bh)
            if not (0.60 <= aspect <= 1.40 and fill >= 0.58):
                continue
            candidates.append({
                "center": (x0 + (min_x + max_x + 1) / 2.0, y0 + (min_y + max_y + 1) / 2.0),
                "bbox": [x0 + min_x, y0 + min_y, x0 + max_x + 1, y0 + max_y + 1],
                "area": count,
                "fill": fill,
                "aspect": aspect,
                "size": (bw, bh),
            })
    return candidates


def _detect_one(gray, quadrant: str) -> dict:
    width, height = gray.size
    qx = int(width * 0.34)
    qy = int(height * 0.27)
    boxes = {
        "topLeft": (0, 0, qx, qy),
        "topRight": (width - qx, 0, width, qy),
        "bottomRight": (width - qx, height - qy, width, height),
        "bottomLeft": (0, height - qy, qx, height),
    }
    candidates = _component_candidates(gray, boxes[quadrant])
    min_dim = min(width, height)
    min_side = max(6.0, min_dim * 0.008)
    max_side = min_dim * 0.085
    plausible = [item for item in candidates if min_side <= max(item["size"]) <= max_side]
    if not plausible:
        raise ValueError(f"no plausible solid-square fiducial found in {quadrant} quadrant")
    expected = {
        "topLeft": (width * (14.0 / PAGE_W_MM), height * (14.0 / PAGE_H_MM)),
        "topRight": (width * (196.0 / PAGE_W_MM), height * (14.0 / PAGE_H_MM)),
        "bottomRight": (width * (196.0 / PAGE_W_MM), height * (283.0 / PAGE_H_MM)),
        "bottomLeft": (width * (14.0 / PAGE_W_MM), height * (283.0 / PAGE_H_MM)),
    }[quadrant]
    def score(item: dict) -> float:
        cx, cy = item["center"]
        distance = math.hypot((cx - expected[0]) / width, (cy - expected[1]) / height)
        return item["fill"] * 3.0 + math.log1p(item["area"]) * 0.25 - distance * 7.0 - abs(math.log(item["aspect"]))
    plausible.sort(key=score, reverse=True)
    best = plausible[0]
    if len(plausible) > 1 and score(best) - score(plausible[1]) < 0.18:
        raise ValueError(f"ambiguous fiducial detection in {quadrant} quadrant")
    return best


def detect(source_image: Path, output: Path, *, page: int = 1) -> dict:
    if output.exists():
        raise ValueError(f"create-only registration output already exists: {output}")
    if page < 1:
        raise ValueError("page must be >= 1")
    if not source_image.is_file():
        raise ValueError(f"source image is missing: {source_image}")
    Image = _pil()
    with Image.open(source_image) as opened:
        original_size = opened.size
        gray = opened.convert("L")
    max_width = 1600
    scale = min(1.0, max_width / max(gray.width, 1))
    if scale < 1.0:
        gray = gray.resize((max(1, round(gray.width * scale)), max(1, round(gray.height * scale))), Image.Resampling.BILINEAR)
    detections = {name: _detect_one(gray, name) for name in FIDUCIAL_CENTERS_MM}
    detected_centers = [(detections[name]["center"][0] / scale, detections[name]["center"][1] / scale) for name in ("topLeft", "topRight", "bottomRight", "bottomLeft")]
    reference_centers = [FIDUCIAL_CENTERS_MM[name] for name in ("topLeft", "topRight", "bottomRight", "bottomLeft")]
    h = _homography(reference_centers, detected_centers)
    page_corners = {
        "topLeft": _project(h, 0.0, 0.0),
        "topRight": _project(h, PAGE_W_MM, 0.0),
        "bottomRight": _project(h, PAGE_W_MM, PAGE_H_MM),
        "bottomLeft": _project(h, 0.0, PAGE_H_MM),
    }
    width, height = original_size
    for name, (x, y) in page_corners.items():
        tolerance_x = width * 0.08
        tolerance_y = height * 0.08
        if not (-tolerance_x <= x <= width + tolerance_x and -tolerance_y <= y <= height + tolerance_y):
            raise ValueError(f"detected fiducials extrapolate implausible page corner {name}")
    registration = {
        "schema": REGISTRATION_SCHEMA,
        "page": page,
        "cornersPx": {name: [round(point[0], 3), round(point[1], 3)] for name, point in page_corners.items()},
        "cropMarginPx": 36,
        "keepMarginPx": 6,
        "detectionEvidence": {
            "method": "solid-square-fiducials-v1",
            "fiducialCentersPx": {name: [round(detected_centers[index][0], 3), round(detected_centers[index][1], 3)] for index, name in enumerate(("topLeft", "topRight", "bottomRight", "bottomLeft"))},
            "downsampleScale": round(scale, 6),
            "manualReviewRequired": True,
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(registration, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {
        "ok": True,
        "schema": REGISTRATION_SCHEMA,
        "page": page,
        "sourcePixelSize": [width, height],
        "fiducialCount": 4,
        "manualReviewRequired": True,
        "privatePathsReturned": False,
        "handwritingBytesReturned": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Detect the four printed fiducials on an EVAVO handwriting capture sheet")
    parser.add_argument("source_image")
    parser.add_argument("output")
    parser.add_argument("--page", type=int, default=1)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(detect(Path(args.source_image), Path(args.output), page=args.page), sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
