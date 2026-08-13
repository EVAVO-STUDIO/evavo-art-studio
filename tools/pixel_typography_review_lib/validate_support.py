"""Manifest and retained-file checks for native-resolution review validation."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from pixel_font_universal.common import bounded_int, canonical_json, sha256_bytes, sha256_file
from pixel_text_studio_engine import normalise_style

from .common import BUILD_SCHEMA, ENGINE_VERSION, fail, load_json, normalise_profile

EXPECTED_POLICY = {
    "createOnly": True,
    "transactional": True,
    "nearestOnly": True,
    "integerCoordinates": True,
    "antialiasing": False,
    "fontMasterMutation": False,
}
EXPECTED_AUTHORITY = {
    "creativeApproval": False,
    "targetRepositoryMutation": False,
    "gitCommit": False,
    "gitPush": False,
    "publication": False,
}


def validate_manifest_and_files(output_root: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Mapping[str, Any]]]:
    output_root = output_root.resolve()
    if not output_root.is_dir() or output_root.is_symlink():
        fail(f"output root must be a non-symlink directory: {output_root}")

    manifest = load_json(output_root / "pixel-typography-review.json", "pixel typography review manifest")
    if not isinstance(manifest, dict) or manifest.get("schema") != BUILD_SCHEMA:
        fail(f"pixel-typography-review.json schema must be {BUILD_SCHEMA}")
    if manifest.get("engineVersion") != ENGINE_VERSION or manifest.get("status") != "passed":
        fail("pixel typography review engine/status mismatch")
    if manifest.get("policy") != EXPECTED_POLICY:
        fail("pixel typography review policy mismatch")
    if manifest.get("authority") != EXPECTED_AUTHORITY:
        fail("pixel typography review authority mismatch")
    expected_build_sha = sha256_bytes(canonical_json({key: manifest[key] for key in sorted(manifest) if key != "buildSha256"}))
    if manifest.get("buildSha256") != expected_build_sha:
        fail("pixel typography review self-hash mismatch")

    records = manifest.get("files")
    if not isinstance(records, list):
        fail("pixel typography review file records must be an array")
    expected_files: dict[str, Mapping[str, Any]] = {}
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            fail(f"pixel typography review files[{index}] must be an object")
        relative = record.get("path")
        if not isinstance(relative, str) or not relative or relative.startswith("/") or ".." in relative.split("/"):
            fail(f"pixel typography review files[{index}].path is unsafe")
        if relative in expected_files:
            fail(f"pixel typography review file record duplicates {relative!r}")
        expected_files[relative] = record
    observed_files = sorted(path.relative_to(output_root).as_posix() for path in output_root.rglob("*") if path.is_file() and path.name != "pixel-typography-review.json")
    if sorted(expected_files) != observed_files:
        fail("pixel typography review file inventory mismatch")
    for relative, record in expected_files.items():
        path = output_root / relative
        if path.is_symlink() or not path.is_file():
            fail(f"retained review file is missing or symbolic: {relative}")
        expected_bytes = bounded_int(record.get("bytes"), f"files[{relative}].bytes", 0, 512 * 1024 * 1024)
        expected_sha = record.get("sha256")
        if not isinstance(expected_sha, str) or len(expected_sha) != 64:
            fail(f"retained review file SHA-256 is invalid: {relative}")
        if path.stat().st_size != expected_bytes or sha256_file(path) != expected_sha:
            fail(f"retained review file identity mismatch: {relative}")

    profile = normalise_profile(load_json(output_root / "source/review-profile.json", "retained review profile"))
    style = normalise_style(load_json(output_root / "source/pixel-text-style.json", "retained pixel text style"))
    if sha256_bytes(canonical_json(profile)) != manifest.get("profileSha256"):
        fail("retained review profile hash mismatch")
    if sha256_bytes(canonical_json(style)) != manifest.get("styleSha256"):
        fail("retained pixel text style hash mismatch")
    if manifest.get("profileId") != profile["profileId"] or manifest.get("eraProfile") != profile["eraProfile"]:
        fail("review profile identity mismatch")
    if manifest.get("styleId") != style["styleId"]:
        fail("review style identity mismatch")
    return manifest, profile, style, expected_files
