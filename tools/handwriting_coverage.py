from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ATLAS_SCHEMA = "evavo.art-studio.handwriting-atlas.v1"
COVERAGE_SCHEMA = "evavo.art-studio.handwriting-coverage.v1"


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


def _safe_asset(root: Path, relative: str) -> Path:
    raw = Path(relative)
    if raw.is_absolute():
        raise ValueError("handwriting atlas assets must be relative to assetRoot")
    root = root.resolve()
    path = (root / raw).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError("handwriting atlas asset escapes assetRoot") from exc
    return path


def inspect_coverage(atlas_path: Path, *, verify_assets: bool = True) -> dict:
    atlas = _load(atlas_path)
    if atlas.get("schema") != ATLAS_SCHEMA:
        raise ValueError("invalid handwriting atlas schema")
    root = Path(str(atlas.get("assetRoot") or "")).resolve()
    glyphs = atlas.get("glyphs")
    marks = atlas.get("wholeMarks")
    if not isinstance(glyphs, dict) or not glyphs:
        raise ValueError("atlas has no glyphs")
    if not isinstance(marks, dict):
        marks = {}

    variant_counts: dict[str, int] = {}
    styles: dict[str, set[str]] = {}
    checked = 0
    pinned = 0
    for token, entries in glyphs.items():
        if not isinstance(token, str) or not token or not isinstance(entries, list) or not entries:
            raise ValueError(f"invalid handwriting glyph entry for {token!r}")
        valid = 0
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get("file"), str) or not isinstance(entry.get("sha256"), str):
                raise ValueError(f"glyph {token!r} contains an incomplete variant")
            path = _safe_asset(root, entry["file"])
            if verify_assets:
                if not path.is_file():
                    raise ValueError(f"handwriting asset is missing for {token!r}")
                if _sha_file(path) != entry["sha256"]:
                    raise ValueError(f"handwriting asset sha256 mismatch for {token!r}")
            checked += 1
            pinned += 1
            valid += 1
            style = str(entry.get("style") or "").strip()
            if style:
                styles.setdefault(token, set()).add(style)
        variant_counts[token] = valid

    def missing(chars: str) -> list[str]:
        return [ch for ch in chars if variant_counts.get(ch, 0) < 1]

    uppercase_missing = missing("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    lowercase_missing = missing("abcdefghijklmnopqrstuvwxyz")
    digit_missing = missing("0123456789")
    signature_entries = marks.get("signature") if isinstance(marks.get("signature"), list) else []
    name_entries = marks.get("name") if isinstance(marks.get("name"), list) else []
    fragments = sorted(token for token in variant_counts if len(token) > 1)
    symbols = sorted(token for token in variant_counts if len(token) == 1 and not token.isalnum())

    return {
        "schema": COVERAGE_SCHEMA,
        "atlasId": atlas.get("atlasId"),
        "atlasSha256": _sha_file(atlas_path),
        "coverage": {
            "completeUppercaseAlphabet": not uppercase_missing,
            "missingUppercase": uppercase_missing,
            "completeLowercaseAlphabet": not lowercase_missing,
            "missingLowercase": lowercase_missing,
            "completeDigits": not digit_missing,
            "missingDigits": digit_missing,
            "variantCounts": variant_counts,
            "fragments": fragments,
            "symbols": symbols,
            "wholeNameVariantCount": len(name_entries),
            "wholeSignatureVariantCount": len(signature_entries),
            "stylesByToken": {token: sorted(values) for token, values in sorted(styles.items())},
        },
        "integrity": {
            "assetRootConfined": True,
            "checkedAssetCount": checked,
            "hashPinnedAssetCount": pinned,
            "assetsVerified": verify_assets,
            "privatePathsReturned": False,
        },
        "truthBoundary": {
            "fontFallbackUsed": False,
            "syntheticHandwritingGenerated": False,
            "signatureSynthesizedFromGlyphs": False,
            "wholeSignatureVariantsOnly": True,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Report genuine handwriting atlas coverage and integrity")
    parser.add_argument("atlas")
    parser.add_argument("--no-asset-verify", action="store_true")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(inspect_coverage(Path(args.atlas), verify_assets=not args.no_asset_verify), sort_keys=True))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
