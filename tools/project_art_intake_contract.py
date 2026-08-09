from __future__ import annotations

import hashlib
import json
from typing import Any

PLAN_SCHEMA = "evavo.project-art-intake-plan.v1"
RECEIPT_SCHEMA = "evavo.project-art-intake-receipt.v1"
STORAGE_SCHEMA = "evavo.storage-art-ingest-request.v1"
SHA256 = set("0123456789abcdef")
MAXIMUM_PLAN_BYTES = 16 * 1024 * 1024
MAXIMUM_IMAGE_PIXELS = 220_000_000

def fail(message: str) -> None:
    raise ValueError(message)


def canonical_json(value: Any) -> str:
    if value is None or isinstance(value, (str, int, float, bool)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical_json(value[key])
            for key in sorted(value)
        ) + "}"
    fail(f"Unsupported value in canonical JSON: {type(value).__name__}")


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


def validate_plan(plan: dict[str, Any]) -> None:
    if plan.get("schema") != PLAN_SCHEMA:
        fail(f"Plan must use {PLAN_SCHEMA}.")
    expected = validate_hash(plan.get("planSha256"), "planSha256")
    unhashed = dict(plan)
    unhashed.pop("planSha256", None)
    observed = sha256_bytes(canonical_json(unhashed).encode("utf-8"))
    if observed != expected:
        fail("Plan self hash mismatch.")
    authority = plan.get("authority")
    if not isinstance(authority, dict):
        fail("Plan authority must be an object.")
    expected_authority = {
        "sourceRead": True,
        "workspaceWrite": True,
        "sourceMutation": False,
        "sourceDeletion": False,
        "storageWrite": False,
        "repositoryMutation": False,
        "providerExecution": False,
        "candidateApproval": False,
        "candidatePromotion": False,
        "deployment": False,
        "publication": False,
        "forcePush": False,
    }
    if authority != expected_authority:
        fail("Plan authority boundary changed.")
    if plan.get("createOnlyOutput") is not True:
        fail("Plan must require create-only output.")
    if plan.get("atomicPublication") is not True:
        fail("Plan must require atomic publication.")
    if plan.get("bytesFlowThroughMcp") is not False:
        fail("Image bytes cannot flow through MCP.")
