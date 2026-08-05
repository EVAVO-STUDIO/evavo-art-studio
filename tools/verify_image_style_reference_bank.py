#!/usr/bin/env python3
"""Verify an exact EVAVO image style-reference bank with Python canonicalization."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from image_style_features import aggregate_profile, load_image, resolve_inside, sha256_file

BANK_SCHEMA = "evavo.image-style-reference-bank.v1"
CONTRACT_ID = "evavo.executable-image-pipeline.v1"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
EXPECTED_EFFECTS = {
    "providerExecution": False,
    "sourceOverwrite": False,
    "sourceDeletion": False,
    "targetRepositoryMutation": False,
    "publication": False,
}


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


def valid_hash(value: Any) -> bool:
    return isinstance(value, str) and HEX64.fullmatch(value) is not None


def verify(repo: Path, bank_path: Path, source_root: Path | None, verify_source_bytes: bool) -> dict[str, Any]:
    contract = read_json(repo / "config" / "executable-image-pipeline.v1.json")
    bank = read_json(bank_path)
    if contract.get("contract") != CONTRACT_ID:
        fail("unexpected executable image pipeline contract")
    if bank.get("schema") != BANK_SCHEMA or bank.get("contract") != CONTRACT_ID:
        fail("unexpected style bank identity")
    if bank.get("contractSha256") != sha256_json(contract):
        fail("style bank is not bound to the current pipeline contract")
    stored = bank.get("bankSha256")
    if not valid_hash(stored):
        fail("style bank SHA-256 is invalid")
    unhashed = dict(bank)
    unhashed.pop("bankSha256", None)
    unhashed.pop("runId", None)
    if stored != sha256_json(unhashed):
        fail("style bank self hash mismatch")
    if bank.get("runId") != stored[:20]:
        fail("style bank runId is not content-derived")
    if bank.get("effects") != EXPECTED_EFFECTS:
        fail("style bank effect boundary changed")

    references = bank.get("references")
    profiles = bank.get("roleProfiles")
    if not isinstance(references, list) or not references:
        fail("style bank has no references")
    if not isinstance(profiles, dict):
        fail("style bank roleProfiles is invalid")
    if bank.get("referenceCount") != len(references):
        fail("style bank reference count mismatch")
    seen_paths: set[str] = set()
    seen_hashes: set[str] = set()
    features_by_role: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for reference in references:
        if not isinstance(reference, dict):
            fail("style reference is not an object")
        path_value = reference.get("sourcePath")
        source_sha = reference.get("sourceSha256")
        role = reference.get("semanticRole")
        if not isinstance(path_value, str) or not path_value or path_value in seen_paths:
            fail(f"duplicate or invalid style-reference path: {path_value}")
        if not valid_hash(source_sha) or source_sha in seen_hashes:
            fail(f"duplicate or invalid style-reference bytes: {path_value}")
        if not isinstance(role, str) or not role:
            fail(f"style reference lacks semantic role: {path_value}")
        if not isinstance(reference.get("approvedTraits"), list) or not reference["approvedTraits"]:
            fail(f"style reference lacks approved traits: {path_value}")
        if not reference.get("approvalAuthority") or not valid_hash(reference.get("reviewSha256")):
            fail(f"style reference lacks explicit approval evidence: {path_value}")
        features = reference.get("features")
        if not isinstance(features, dict) or features.get("featureVersion") != "evavo.image-style-features.v1":
            fail(f"style reference lacks governed features: {path_value}")
        seen_paths.add(path_value)
        seen_hashes.add(source_sha)
        features_by_role[role].append(features)
        if verify_source_bytes:
            if source_root is None:
                fail("--verify-source-bytes requires --source-root")
            image_path = resolve_inside(source_root, path_value)
            actual_sha, size = sha256_file(image_path, int(contract["limits"]["maximumSourceBytes"]))
            if actual_sha != source_sha or size != reference.get("sizeBytes"):
                fail(f"style-reference source changed: {path_value}")
            load_image(image_path, int(contract["limits"]["maximumDecodedPixels"]))

    expected_roles = sorted(features_by_role)
    if bank.get("roles") != expected_roles or sorted(profiles) != expected_roles:
        fail("style bank role list mismatch")
    for role, features in sorted(features_by_role.items()):
        expected_profile = aggregate_profile(features)
        if canonical_json(profiles.get(role)) != canonical_json(expected_profile):
            fail(f"style profile does not match admitted references: {role}")

    return {
        "status": "passed",
        "runId": bank["runId"],
        "bankSha256": stored,
        "references": len(references),
        "roles": len(expected_roles),
        "verifiedSourceBytes": verify_source_bytes,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--bank", type=Path, required=True)
    parser.add_argument("--source-root", type=Path)
    parser.add_argument("--verify-source-bytes", action="store_true")
    args = parser.parse_args()
    try:
        result = verify(
            args.repo.resolve(),
            args.bank.resolve(),
            args.source_root.resolve() if args.source_root else None,
            args.verify_source_bytes,
        )
    except (OSError, UnicodeError, ValueError, TypeError, KeyError, json.JSONDecodeError, RuntimeError) as error:
        print(f"style bank verification failed: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
