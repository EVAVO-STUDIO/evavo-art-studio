from __future__ import annotations

from pathlib import Path
from typing import Any

from project_art_intake_contract import STORAGE_SCHEMA
from project_art_intake_io import add_self_hash

def storage_handoff(
    plan: dict[str, Any],
    output_root: Path,
    assets: list[dict[str, Any]],
) -> dict[str, Any]:
    storage = plan["storage"]
    prefix = str(storage["logicalPrefix"]).strip("/")
    items = []
    for asset in assets:
        source = asset["source"]
        logical_path = f"{prefix}/{source['logicalPath']}"
        working_absolute = output_root / Path(source["workingRelativePath"])
        tags = sorted(
            set(
                [
                    *storage.get("tags", []),
                    *source.get("tags", []),
                    source["origin"],
                    source.get("role") or "unclassified-art",
                ]
            )
        )
        items.append(
            {
                "assetId": source["id"],
                "sourcePath": str(working_absolute),
                "logicalPath": logical_path,
                "fileName": source["fileName"],
                "mediaType": source["mediaType"],
                "sha256": source["contentSha256"],
                "bytes": source["sizeBytes"],
                "title": f"{plan['projectId']} {source['id']}",
                "tags": tags,
                "provenance": {
                    "origin": source["origin"],
                    "sessionId": plan["sessionId"],
                    "projectId": plan["projectId"],
                    "intakePlanSha256": plan["planSha256"],
                    "immutableOriginalRelativePath": source["sourceRelativePath"],
                    "workingRelativePath": source["workingRelativePath"],
                },
            }
        )
    items.sort(key=lambda entry: entry["assetId"])
    body = {
        "schema": STORAGE_SCHEMA,
        "projectId": plan["projectId"],
        "sessionId": plan["sessionId"],
        "vaultId": storage["vaultId"],
        "workspaceRoot": str(output_root),
        "allowedSourceRoots": [str(output_root)],
        "items": items,
        "idempotencyKeyPrefix": f"art-intake:{plan['sessionId']}:{plan['planSha256'][:16]}",
        "sourceIntakePlanSha256": plan["planSha256"],
        "enabled": bool(storage["enabled"]),
        "authority": {
            "sourceRead": True,
            "storageWrite": False,
            "repositoryMutation": False,
            "sourceDeletion": False,
            "physicalPurge": False,
            "publication": False,
        },
        "bytesFlowThroughMcp": False,
    }
    return add_self_hash(body, "requestSha256")
