"""Independent retained-output validation for native-resolution review kits."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from pixel_font_universal.common import bounded_int, canonical_json, colour_hex, sha256_bytes, sha256_file

from .common import ENGINE_VERSION, MAP_SCHEMA, VALIDATION_SCHEMA, fail, load_json
from .raster import palette, palette_png
from .validate_pages import validate_pages
from .validate_support import validate_manifest_and_files


def validate_review(output_root: Path) -> dict[str, Any]:
    output_root = output_root.resolve()
    manifest, profile, _style, expected_files = validate_manifest_and_files(output_root)
    page_data, pages, samples, native = validate_pages(output_root, manifest, profile)

    colours = palette(page_data)
    if [colour_hex(colour) for colour in colours] != manifest.get("palette") or len(colours) != manifest.get("paletteCount"):
        fail("native review palette evidence mismatch")
    budget = bounded_int(manifest.get("paletteBudget", 0), "palette budget", 0, 256)
    if budget != profile["paletteBudget"] or budget == 1 or (budget and len(colours) > budget):
        fail("native review palette budget failed")
    palette_path_value = manifest.get("palettePath", "palette/palette.png")
    if not isinstance(palette_path_value, str):
        fail("native review palette path is invalid")
    palette_path = output_root / palette_path_value
    if not palette_path.is_file() or palette_path.is_symlink() or palette_path.read_bytes() != palette_png(colours):
        fail("native review palette swatch mismatch")

    review_map = load_json(output_root / "review-map.json", "review map")
    if not isinstance(review_map, dict) or review_map.get("schema") != MAP_SCHEMA:
        fail("review-map.json schema mismatch")
    if review_map.get("profileId") != profile["profileId"] or review_map.get("nativeResolution") != native:
        fail("review map profile identity mismatch")
    if review_map.get("pages") != pages or review_map.get("samples") != samples:
        fail("review map does not match manifest geometry")
    return {
        "schema": VALIDATION_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "status": "passed",
        "buildSha256": manifest["buildSha256"],
        "pageCount": len(pages),
        "sampleCount": len(samples),
        "paletteCount": len(colours),
        "fileCount": len(expected_files) + 1,
        "nativeResolution": native,
    }


def compare_reviews(first: Path, second: Path) -> dict[str, Any]:
    first_validation = validate_review(first)
    second_validation = validate_review(second)

    def tree(root: Path) -> dict[str, str]:
        resolved = root.resolve()
        return {path.relative_to(resolved).as_posix(): sha256_file(path) for path in sorted(resolved.rglob("*")) if path.is_file()}

    first_tree, second_tree = tree(first), tree(second)
    if first_tree != second_tree:
        fail("pixel typography review builds are not byte-for-byte identical")
    return {
        "schema": VALIDATION_SCHEMA,
        "engineVersion": ENGINE_VERSION,
        "status": "passed",
        "identical": True,
        "fileCount": len(first_tree),
        "treeSha256": sha256_bytes(canonical_json(first_tree)),
        "firstBuildSha256": first_validation["buildSha256"],
        "secondBuildSha256": second_validation["buildSha256"],
    }
