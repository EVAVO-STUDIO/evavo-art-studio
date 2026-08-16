from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

PLAN_SCHEMA = "evavo.project-art-atlas-plan.v1"
RECEIPT_SCHEMA = "evavo.project-art-atlas-receipt.v1"
SHA256 = set("0123456789abcdef")
MAXIMUM_PLAN_BYTES = 32 * 1024 * 1024


def fail(message: str) -> None:
    raise ValueError(message)


def canonical_json(value: Any) -> str:
    if value is None or isinstance(value, (str, int, float, bool)):
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical_json(value[key])
            for key in sorted(value)
        ) + "}"
    fail(f"Unsupported canonical JSON value: {type(value).__name__}")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(value: Path) -> str:
    digest = hashlib.sha256()
    with value.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_hash(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in SHA256 for character in value)
    ):
        fail(f"{label} must be lowercase SHA-256.")
    return value


def transparent_rgb_options(options: dict[str, Any]) -> dict[str, Any]:
    enabled = options.get("transparentRgbBleed", True)
    if not isinstance(enabled, bool):
        fail("options.transparentRgbBleed must be boolean.")
    radius = options.get("transparentRgbBleedRadius", 8)
    if (
        not isinstance(radius, int)
        or isinstance(radius, bool)
        or radius < 0
        or radius > 64
    ):
        fail("options.transparentRgbBleedRadius must be an integer between 0 and 64.")
    threshold = options.get(
        "transparentRgbAlphaThreshold",
        options.get("alphaThreshold", 0),
    )
    if (
        not isinstance(threshold, int)
        or isinstance(threshold, bool)
        or threshold < 0
        or threshold > 254
    ):
        fail("options.transparentRgbAlphaThreshold must be an integer between 0 and 254.")
    return {
        "transparentRgbBleed": enabled,
        "transparentRgbBleedRadius": radius,
        "transparentRgbAlphaThreshold": threshold,
    }


def validate_plan(plan: dict[str, Any]) -> None:
    if plan.get("schema") != PLAN_SCHEMA:
        fail(f"Plan must use {PLAN_SCHEMA}.")
    expected = validate_hash(plan.get("planSha256"), "planSha256")
    body = dict(plan)
    body.pop("planSha256", None)
    observed = sha256_bytes(canonical_json(body).encode("utf-8"))
    if observed != expected:
        fail("Plan self hash mismatch.")
    authority = plan.get("authority")
    expected_authority = {
        "sourceRead": True,
        "atlasWrite": True,
        "sourceMutation": False,
        "sourceDeletion": False,
        "repositoryMutation": False,
        "storageWrite": False,
        "providerExecution": False,
        "candidateApproval": False,
        "candidatePromotion": False,
        "deployment": False,
        "publication": False,
        "forcePush": False,
    }
    if authority != expected_authority:
        fail("Atlas authority boundary changed.")
    if plan.get("createOnlyOutput") is not True:
        fail("Atlas output must be create-only.")
    if plan.get("atomicPublication") is not True:
        fail("Atlas output must be published atomically.")
    if plan.get("bytesFlowThroughMcp") is not False:
        fail("Atlas image bytes cannot flow through MCP.")
    options = plan.get("options")
    if not isinstance(options, dict):
        fail("Plan options must be an object.")
    transparent_rgb_options(options)


def within(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def existing_root(value: Any, label: str) -> Path:
    if not isinstance(value, str) or not value:
        fail(f"{label} must be a non-empty absolute path.")
    lexical = Path(os.path.abspath(value))
    if not lexical.is_absolute() or lexical.is_symlink() or not lexical.is_dir():
        fail(f"{label} must be an existing non-symbolic directory.")
    return lexical.resolve(strict=True)


def secure_source(value: Any, roots: list[Path], label: str) -> Path:
    if not isinstance(value, str) or not value:
        fail(f"{label} must be a non-empty absolute path.")
    lexical = Path(os.path.abspath(value))
    root = next((entry for entry in roots if within(entry, lexical)), None)
    if root is None:
        fail(f"{label} is outside every allowed root.")
    current = root
    for segment in lexical.relative_to(root).parts:
        current = current / segment
        if current.is_symlink():
            fail(f"{label} contains a symbolic-link component.")
        if not current.exists():
            fail(f"{label} does not exist.")
    if not lexical.is_file():
        fail(f"{label} must be a regular file.")
    resolved = lexical.resolve(strict=True)
    if not within(root, resolved):
        fail(f"{label} escaped its allowed root.")
    return resolved


def next_power_of_two(value: int) -> int:
    return 1 if value <= 1 else 1 << (value - 1).bit_length()


def add_hash(value: dict[str, Any], field: str) -> dict[str, Any]:
    result = dict(value)
    result[field] = sha256_bytes(canonical_json(result).encode("utf-8"))
    return result
