from __future__ import annotations

import argparse
import html
import json
import math
from pathlib import Path

SPEC_SCHEMA = "evavo.art-studio.handwriting-capture-spec.v1"
SHEET_SCHEMA = "evavo.art-studio.handwriting-capture-sheet.v1"

PAGE_W_MM = 210.0
PAGE_H_MM = 297.0
MARGIN_MM = 14.0
HEADER_MM = 22.0
COLS = 3
ROWS = 5
GAP_MM = 4.0
FIDUCIAL_MM = 7.0


def _load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    if value.get("schema") != SPEC_SCHEMA:
        raise ValueError("invalid handwriting capture spec schema")
    return value


def _token_label(token: str) -> str:
    if token == "FULL_NAME":
        return "Write your full name naturally"
    if token == "SIGNATURE":
        return "Write one normal signature"
    return f"Write: {token}"


def _svg_page(*, page_number: int, page_count: int, slots: list[dict], profile_id: str) -> tuple[str, list[dict]]:
    usable_w = PAGE_W_MM - MARGIN_MM * 2
    usable_h = PAGE_H_MM - MARGIN_MM * 2 - HEADER_MM
    box_w = (usable_w - GAP_MM * (COLS - 1)) / COLS
    box_h = (usable_h - GAP_MM * (ROWS - 1)) / ROWS
    geometry = []
    elements = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W_MM}mm" height="{PAGE_H_MM}mm" viewBox="0 0 {PAGE_W_MM} {PAGE_H_MM}">',
        '<rect width="100%" height="100%" fill="white"/>',
        f'<text x="{MARGIN_MM}" y="11" font-family="sans-serif" font-size="5" font-weight="700">EVAVO Genuine Handwriting Capture</text>',
        f'<text x="{MARGIN_MM}" y="18" font-family="sans-serif" font-size="3.2">Profile: {html.escape(profile_id)} · Page {page_number}/{page_count} · Write naturally inside each large box. Do not trace.</text>',
    ]
    fiducials = [
        (MARGIN_MM - FIDUCIAL_MM / 2, MARGIN_MM - FIDUCIAL_MM / 2),
        (PAGE_W_MM - MARGIN_MM - FIDUCIAL_MM / 2, MARGIN_MM - FIDUCIAL_MM / 2),
        (MARGIN_MM - FIDUCIAL_MM / 2, PAGE_H_MM - MARGIN_MM - FIDUCIAL_MM / 2),
        (PAGE_W_MM - MARGIN_MM - FIDUCIAL_MM / 2, PAGE_H_MM - MARGIN_MM - FIDUCIAL_MM / 2),
    ]
    for x, y in fiducials:
        elements.append(f'<rect x="{x:.3f}" y="{y:.3f}" width="{FIDUCIAL_MM}" height="{FIDUCIAL_MM}" fill="black"/>')

    top = MARGIN_MM + HEADER_MM
    for index, slot in enumerate(slots):
        row = index // COLS
        col = index % COLS
        x = MARGIN_MM + col * (box_w + GAP_MM)
        y = top + row * (box_h + GAP_MM)
        token = str(slot.get("token") or "")
        slot_id = str(slot.get("id") or "")
        variant = int(slot.get("variant") or 1)
        label = _token_label(token)
        elements.append(f'<rect x="{x:.3f}" y="{y:.3f}" width="{box_w:.3f}" height="{box_h:.3f}" fill="none" stroke="#555" stroke-width="0.35"/>')
        elements.append(f'<text x="{x + 2:.3f}" y="{y + 5:.3f}" font-family="sans-serif" font-size="3.1" font-weight="700">{html.escape(label)}</text>')
        elements.append(f'<text x="{x + 2:.3f}" y="{y + 9.5:.3f}" font-family="sans-serif" font-size="2.4">Variant {variant} · {html.escape(slot_id)}</text>')
        elements.append(f'<line x1="{x + 3:.3f}" y1="{y + box_h - 8:.3f}" x2="{x + box_w - 3:.3f}" y2="{y + box_h - 8:.3f}" stroke="#bbb" stroke-width="0.25" stroke-dasharray="1.5 1.5"/>')
        geometry.append({
            "slotId": slot_id,
            "token": token,
            "variant": variant,
            "kind": slot.get("kind"),
            "style": slot.get("style"),
            "page": page_number,
            "boxMm": [round(x, 3), round(y, 3), round(x + box_w, 3), round(y + box_h, 3)],
            "recommendedInkKeepMm": [round(x + 2, 3), round(y + 11, 3), round(x + box_w - 2, 3), round(y + box_h - 3, 3)],
        })
    elements.append('</svg>')
    return "\n".join(elements) + "\n", geometry


def render(spec_path: Path, output_directory: Path) -> dict:
    spec = _load(spec_path)
    if output_directory.exists():
        if any(output_directory.iterdir()):
            raise ValueError(f"create-only output directory is not empty: {output_directory}")
    else:
        output_directory.mkdir(parents=True)
    slots = [slot for slot in spec.get("slots", []) if isinstance(slot, dict)]
    per_page = COLS * ROWS
    page_count = max(1, math.ceil(len(slots) / per_page))
    all_geometry = []
    pages = []
    for page_index in range(page_count):
        page_slots = slots[page_index * per_page:(page_index + 1) * per_page]
        svg, geometry = _svg_page(page_number=page_index + 1, page_count=page_count, slots=page_slots, profile_id=str(spec.get("profileId") or "handwriting"))
        filename = f"handwriting-capture-{page_index + 1:02d}.svg"
        (output_directory / filename).write_text(svg, encoding="utf-8")
        pages.append(filename)
        all_geometry.extend(geometry)
    manifest = {
        "schema": SHEET_SCHEMA,
        "profileId": spec.get("profileId"),
        "pageSizeMm": [PAGE_W_MM, PAGE_H_MM],
        "fiducialSizeMm": FIDUCIAL_MM,
        "pageCount": page_count,
        "slotCount": len(slots),
        "pages": pages,
        "geometry": all_geometry,
        "truthBoundary": {
            "containsGeneratedHandwriting": False,
            "containsSignatureImage": False,
            "containsPrivatePersonalMarkBytes": False,
            "worksheetOnly": True,
        },
    }
    (output_directory / "capture-sheet-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {"ok": True, "schema": SHEET_SCHEMA, "pageCount": page_count, "slotCount": len(slots), "privatePersonalMarkBytesWritten": False}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render printable SVG handwriting capture sheets from a blank capture specification")
    parser.add_argument("spec")
    parser.add_argument("output_directory")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(render(Path(args.spec), Path(args.output_directory)), sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
