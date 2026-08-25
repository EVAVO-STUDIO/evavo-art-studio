from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ATLAS_SCHEMA = "evavo.art-studio.handwriting-atlas.v1"
EXPORT_SCHEMA = "evavo.art-studio.document-personal-marks-export.v1"


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


def _variant(item: dict) -> dict:
    value = {
        "file": item["file"],
        "sha256": item["sha256"],
        "advancePx": float(item.get("naturalAdvancePx", item.get("inkSize", [24])[0])),
    }
    if isinstance(item.get("style"), str) and item["style"]:
        value["style"] = item["style"]
    if isinstance(item.get("label"), str) and item["label"]:
        value["label"] = item["label"]
    if isinstance(item.get("inkBox"), list):
        value["inkBox"] = item["inkBox"]
    if isinstance(item.get("sideBearingPx"), dict):
        value["sideBearingPx"] = item["sideBearingPx"]
    return value


def export_seed(atlas_path: Path, output: Path) -> dict:
    if output.exists():
        raise ValueError(f"create-only output already exists: {output}")
    atlas = _load(atlas_path)
    if atlas.get("schema") != ATLAS_SCHEMA:
        raise ValueError("invalid handwriting atlas schema")
    glyphs = atlas.get("glyphs")
    marks = atlas.get("wholeMarks")
    if not isinstance(glyphs, dict):
        raise ValueError("atlas.glyphs must be an object")
    if not isinstance(marks, dict):
        marks = {}
    signatures = marks.get("signature")
    names = marks.get("name")
    if not isinstance(signatures, list) or not signatures:
        raise ValueError("Document Studio seed requires at least one whole genuine signature")
    if not isinstance(names, list) or not names:
        raise ValueError("Document Studio seed requires at least one whole genuine handwritten name")

    text_glyphs = {token: [_variant(item) for item in entries] for token, entries in glyphs.items() if isinstance(entries, list) and entries}
    date_glyphs = {
        token: [_variant(item) for item in entries]
        for token, entries in glyphs.items()
        if isinstance(token, str) and len(token) == 1 and (token.isdigit() or token in {"/", ".", "-"}) and isinstance(entries, list) and entries
    }
    missing_digits = [str(number) for number in range(10) if str(number) not in date_glyphs]
    if missing_digits:
        raise ValueError("Document Studio seed is missing genuine date digit(s): " + ", ".join(missing_digits))

    export = {
        "schema": EXPORT_SCHEMA,
        "sourceAtlasSha256": _sha_file(atlas_path),
        "atlasId": atlas.get("atlasId"),
        "assetRoot": atlas.get("assetRoot"),
        "marks": {
            "signature": [_variant(item) for item in signatures],
            "name": [_variant(item) for item in names],
        },
        "dateGlyphs": date_glyphs,
        "textGlyphs": text_glyphs,
        "text": {
            "trackingPx": float((atlas.get("rendering") or {}).get("trackingPx", 1.5)),
            "spacePx": 18.0,
            "baselinePx": 0.8,
            "spacingPx": 0.7,
            "scaleFraction": 0.014,
            "rotationDegrees": float((atlas.get("rendering") or {}).get("rotationDegrees", 0.45)),
        },
        "truthBoundary": {
            "imageBytesCopied": False,
            "fontFallbackUsed": False,
            "syntheticHandwritingGenerated": False,
            "signatureSynthesizedFromGlyphs": False,
            "requiresDocumentStudioApprovalForPdfExecution": True,
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(export, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {
        "ok": True,
        "atlasId": export["atlasId"],
        "exportSha256": _sha_file(output),
        "textGlyphCount": len(text_glyphs),
        "dateGlyphCount": len(date_glyphs),
        "nameVariantCount": len(names),
        "signatureVariantCount": len(signatures),
        "privatePathsReturned": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export an Art Studio handwriting atlas as a private Document Studio profile seed")
    parser.add_argument("atlas")
    parser.add_argument("output")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(export_seed(Path(args.atlas), Path(args.output)), sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
