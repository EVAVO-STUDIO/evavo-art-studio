from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path

SHEET_SCHEMA = "evavo.art-studio.handwriting-capture-sheet.v1"
REGISTRATION_SCHEMA = "evavo.art-studio.handwriting-photo-registration.v1"
DOCUMENT_LAYOUT_SCHEMA = "evavo.document-studio.personal-marks-sheet-layout.v1"


def _pil():
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required for handwriting photo registration") from exc
    return Image


def _load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _solve(matrix: list[list[float]], values: list[float]) -> list[float]:
    n = len(values)
    augmented = [list(matrix[row]) + [float(values[row])] for row in range(n)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda row: abs(augmented[row][col]))
        if abs(augmented[pivot][col]) < 1e-10:
            raise ValueError("page registration corners are degenerate")
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


def _homography(page_points: list[tuple[float, float]], image_points: list[tuple[float, float]]) -> list[float]:
    matrix: list[list[float]] = []
    values: list[float] = []
    for (x, y), (u, v) in zip(page_points, image_points):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        values.append(u)
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        values.append(v)
    return _solve(matrix, values)


def _project(h: list[float], x: float, y: float) -> tuple[float, float]:
    denominator = h[6] * x + h[7] * y + 1.0
    if abs(denominator) < 1e-10:
        raise ValueError("page registration projects through infinity")
    return ((h[0] * x + h[1] * y + h[2]) / denominator, (h[3] * x + h[4] * y + h[5]) / denominator)


def _rect_from_mm(h: list[float], rect: list[float], width: int, height: int) -> list[int]:
    x0, y0, x1, y1 = [float(value) for value in rect]
    points = [_project(h, x0, y0), _project(h, x1, y0), _project(h, x1, y1), _project(h, x0, y1)]
    px0 = max(0, int(math.floor(min(point[0] for point in points))))
    py0 = max(0, int(math.floor(min(point[1] for point in points))))
    px1 = min(width, int(math.ceil(max(point[0] for point in points))))
    py1 = min(height, int(math.ceil(max(point[1] for point in points))))
    if px1 <= px0 or py1 <= py0:
        raise ValueError("registered handwriting slot has no positive pixel area")
    return [px0, py0, px1, py1]


def _safe_id(raw: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip("-.")
    if not value:
        raise ValueError("capture slot id cannot be converted to safe layout id")
    return value[:128]


def _kind(slot: dict) -> str:
    kind = str(slot.get("kind") or "glyph")
    token = str(slot.get("token") or "")
    if kind in {"signature", "name"}:
        return kind
    if kind == "month":
        return "month"
    if len(token) == 1 and (token.isdigit() or token in "/.-"):
        return "date-glyph"
    return "mark"


def register(sheet_manifest_path: Path, registration_path: Path, source_image: Path, output: Path, *, page: int | None = None) -> dict:
    if output.exists():
        raise ValueError(f"create-only layout output already exists: {output}")
    sheet = _load(sheet_manifest_path)
    registration = _load(registration_path)
    if sheet.get("schema") != SHEET_SCHEMA:
        raise ValueError("invalid handwriting capture sheet manifest")
    if registration.get("schema") != REGISTRATION_SCHEMA:
        raise ValueError("invalid handwriting photo registration schema")
    selected_page = int(page or registration.get("page") or 1)
    if selected_page < 1 or selected_page > int(sheet.get("pageCount") or 0):
        raise ValueError("registration page is outside capture sheet page count")
    if not source_image.is_file():
        raise ValueError(f"source image is missing: {source_image}")

    Image = _pil()
    with Image.open(source_image) as image:
        width, height = image.size
    corners = registration.get("cornersPx")
    if not isinstance(corners, dict):
        raise ValueError("registration.cornersPx must be an object")
    ordered = []
    for key in ("topLeft", "topRight", "bottomRight", "bottomLeft"):
        value = corners.get(key)
        if not isinstance(value, list) or len(value) != 2:
            raise ValueError(f"registration.cornersPx.{key} must contain x,y")
        x, y = float(value[0]), float(value[1])
        if not (0 <= x <= width and 0 <= y <= height):
            raise ValueError(f"registration corner {key} is outside source image")
        ordered.append((x, y))

    page_size = sheet.get("pageSizeMm")
    if not isinstance(page_size, list) or len(page_size) != 2:
        raise ValueError("capture sheet manifest lacks pageSizeMm")
    page_w, page_h = float(page_size[0]), float(page_size[1])
    h = _homography([(0, 0), (page_w, 0), (page_w, page_h), (0, page_h)], ordered)

    selected = [item for item in sheet.get("geometry", []) if isinstance(item, dict) and int(item.get("page") or 0) == selected_page]
    if not selected:
        raise ValueError("capture sheet page contains no registered slots")
    rows = []
    for slot in selected:
        slot_id = _safe_id(str(slot.get("slotId") or ""))
        rect_mm = slot.get("recommendedInkKeepMm") or slot.get("boxMm")
        if not isinstance(rect_mm, list) or len(rect_mm) != 4:
            raise ValueError(f"capture slot {slot_id} lacks reviewed millimetre geometry")
        ink_rect = _rect_from_mm(h, rect_mm, width, height)
        kind = _kind(slot)
        token = str(slot.get("token") or "")
        item = {
            "id": slot_id,
            "inkRect": ink_rect,
            "file": f"{kind}/{slot_id}.png",
            "style": slot.get("style"),
        }
        if kind in {"mark", "date-glyph", "month"}:
            item["glyph"] = token
        else:
            item["label"] = token
        rows.append({
            "id": f"row-{slot_id}",
            "kind": kind,
            "style": slot.get("style"),
            "cropMarginPx": int(registration.get("cropMarginPx", 36)),
            "keepMarginPx": int(registration.get("keepMarginPx", 6)),
            "items": [item],
        })

    layout = {
        "schema": DOCUMENT_LAYOUT_SCHEMA,
        "sourceSha256": _sha_file(source_image),
        "sourcePixelSize": [width, height],
        "allowKeepRegionOverlap": False,
        "rows": rows,
        "registrationEvidence": {
            "source": "generated-capture-sheet-four-corner-registration",
            "page": selected_page,
            "pageSizeMm": [page_w, page_h],
            "cornersPx": corners,
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(layout, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {
        "ok": True,
        "layoutSchema": DOCUMENT_LAYOUT_SCHEMA,
        "page": selected_page,
        "entryCount": len(rows),
        "sourceSha256": layout["sourceSha256"],
        "sourcePixelSize": layout["sourcePixelSize"],
        "privatePathsReturned": False,
        "handwritingBytesReturned": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Map a photographed generated handwriting sheet into Document Studio reviewed layout geometry")
    parser.add_argument("sheet_manifest")
    parser.add_argument("registration")
    parser.add_argument("source_image")
    parser.add_argument("output")
    parser.add_argument("--page", type=int)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(register(Path(args.sheet_manifest), Path(args.registration), Path(args.source_image), Path(args.output), page=args.page), sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
