#!/usr/bin/env python3
"""Build an exact, role-aware style bank from explicitly approved references."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any

from image_style_features import aggregate_profile, feature_vector, load_image, resolve_inside, sha256_file

SELECTION_SCHEMA = "evavo.image-style-reference-selection.v1"
BANK_SCHEMA = "evavo.image-style-reference-bank.v1"
CONTRACT_ID = "evavo.executable-image-pipeline.v1"


def fail(message: str) -> None:
    raise ValueError(message)


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def read_json(path: Path) -> Any:
    if path.is_symlink() or not path.is_file():
        fail(f"not a regular JSON file: {path}")
    return json.loads(path.read_text(encoding="utf-8-sig"))


def atomic_write(path: Path, value: dict[str, Any], replace: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not replace:
        fail(f"style bank already exists: {path}")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def build(repo: Path, source_root: Path, selection_path: Path) -> dict[str, Any]:
    contract_path = repo / "config" / "executable-image-pipeline.v1.json"
    contract = read_json(contract_path)
    selection = read_json(selection_path)
    if contract.get("contract") != CONTRACT_ID:
        fail("unexpected executable image pipeline contract")
    if selection.get("schema") != SELECTION_SCHEMA:
        fail("unexpected style-reference selection schema")
    references = selection.get("references")
    if not isinstance(references, list) or not references:
        fail("style-reference selection requires references")
    maximum = int(contract["limits"]["maximumReferencesPerBank"])
    if len(references) > maximum:
        fail(f"style-reference selection exceeds {maximum} references")

    output_references: list[dict[str, Any]] = []
    features_by_role: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen_paths: set[str] = set()
    seen_hashes: set[str] = set()
    for index, reference in enumerate(references):
        if not isinstance(reference, dict):
            fail(f"reference {index} is not an object")
        relative = reference.get("sourcePath")
        expected_sha = str(reference.get("sourceSha256") or "").lower()
        role = str(reference.get("semanticRole") or "").strip()
        traits = reference.get("approvedTraits")
        authority = str(reference.get("approvalAuthority") or "").strip()
        review_sha = str(reference.get("reviewSha256") or "").lower()
        if not role or not isinstance(traits, list) or not traits or not authority:
            fail(f"reference {index} lacks explicit role, traits or approval authority")
        if len(expected_sha) != 64 or len(review_sha) != 64:
            fail(f"reference {index} lacks exact source or review SHA-256")
        image_path = resolve_inside(source_root, str(relative))
        actual_sha, size = sha256_file(image_path, int(contract["limits"]["maximumSourceBytes"]))
        if actual_sha != expected_sha:
            fail(f"style reference changed: {relative}")
        normalized_path = Path(str(relative)).as_posix()
        if normalized_path in seen_paths:
            fail(f"duplicate style-reference path: {normalized_path}")
        if actual_sha in seen_hashes:
            fail(f"duplicate style-reference bytes require one canonical record: {normalized_path}")
        seen_paths.add(normalized_path)
        seen_hashes.add(actual_sha)
        image = load_image(image_path, int(contract["limits"]["maximumDecodedPixels"]))
        features = feature_vector(image)
        features_by_role[role].append(features)
        output_references.append({
            "sourcePath": normalized_path,
            "sourceSha256": actual_sha,
            "sizeBytes": size,
            "semanticRole": role,
            "approvedTraits": traits,
            "approvalAuthority": authority,
            "reviewSha256": review_sha,
            "features": features,
        })

    output_references.sort(key=lambda value: (value["semanticRole"], value["sourcePath"], value["sourceSha256"]))
    profiles = {
        role: aggregate_profile(features)
        for role, features in sorted(features_by_role.items())
    }
    bank: dict[str, Any] = {
        "schema": BANK_SCHEMA,
        "contract": CONTRACT_ID,
        "sourceRoot": str(source_root.resolve()),
        "selectionPath": str(selection_path.resolve()),
        "selectionSha256": hashlib.sha256(selection_path.read_bytes()).hexdigest(),
        "contractSha256": sha256_json(contract),
        "referenceCount": len(output_references),
        "roles": sorted(profiles),
        "references": output_references,
        "roleProfiles": profiles,
        "effects": contract["effects"],
    }
    bank["bankSha256"] = sha256_json(bank)
    bank["runId"] = bank["bankSha256"][:20]
    return bank


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()
    try:
        bank = build(args.repo.resolve(), args.source_root.resolve(), args.selection.resolve())
        atomic_write(args.output.resolve(), bank, args.replace)
    except (OSError, UnicodeError, ValueError, TypeError, KeyError, json.JSONDecodeError, RuntimeError) as error:
        print(f"style-reference bank failed: {error}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": "passed",
        "output": str(args.output.resolve()),
        "runId": bank["runId"],
        "bankSha256": bank["bankSha256"],
        "references": bank["referenceCount"],
        "roles": len(bank["roles"]),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
