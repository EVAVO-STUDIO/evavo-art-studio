from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

from project_art_intake_contract import RECEIPT_SCHEMA, sha256_bytes, validate_hash, validate_plan
from project_art_intake_io import (
    absolute_existing_directory,
    add_self_hash,
    copy_exact,
    ensure_safe_destination,
    fail,
    inspect_image,
    safe_relative,
    secure_source,
    sha256_file,
    write_json_create_only,
)
from project_art_intake_storage import storage_handoff

def execute(plan: dict[str, Any], plan_bytes: bytes, output_root: Path) -> dict[str, Any]:
    validate_plan(plan)
    if output_root.exists() or output_root.is_symlink():
        fail("Output root must not already exist.")
    parent = output_root.parent.resolve(strict=True)
    if parent.is_symlink():
        fail("Output parent cannot be symbolic.")
    allowed_roots = [
        absolute_existing_directory(value, f"allowedSourceRoots[{index}]")
        for index, value in enumerate(plan.get("allowedSourceRoots") or [])
    ]
    sources = plan.get("sources")
    if not isinstance(sources, list) or not sources:
        fail("Plan sources must be a non-empty array.")
    total_bytes = 0
    verified: list[tuple[dict[str, Any], Path]] = []
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            fail(f"sources[{index}] must be an object.")
        source_path = secure_source(
            source.get("sourcePath"), allowed_roots, f"sources[{index}].sourcePath"
        )
        expected_hash = validate_hash(
            source.get("contentSha256"), f"sources[{index}].contentSha256"
        )
        expected_bytes = source.get("sizeBytes")
        if not isinstance(expected_bytes, int) or isinstance(expected_bytes, bool) or expected_bytes < 1:
            fail(f"sources[{index}].sizeBytes is invalid.")
        observed_bytes = source_path.stat().st_size
        observed_hash = sha256_file(source_path)
        if observed_bytes != expected_bytes or observed_hash != expected_hash:
            fail(f"sources[{index}] changed after intake compilation.")
        total_bytes += observed_bytes
        verified.append((source, source_path))
    limits = plan.get("limits") or {}
    if total_bytes > int(limits.get("maximumTotalBytes", 0)):
        fail("Verified source bytes exceed the plan total-byte limit.")

    temporary = Path(
        tempfile.mkdtemp(prefix=f".{output_root.name}.intake-", dir=str(parent))
    )
    published = False
    try:
        assets: list[dict[str, Any]] = []
        for source, source_path in verified:
            original_relative = safe_relative(
                source.get("sourceRelativePath"),
                f"source {source.get('id')} original path",
            )
            working_relative = safe_relative(
                source.get("workingRelativePath"),
                f"source {source.get('id')} working path",
            )
            original = ensure_safe_destination(temporary, original_relative, "original")
            working = ensure_safe_destination(temporary, working_relative, "working")
            original_receipt = copy_exact(source_path, original)
            working_receipt = copy_exact(source_path, working)
            if (
                original_receipt["sha256"] != source["contentSha256"]
                or working_receipt["sha256"] != source["contentSha256"]
                or original_receipt["bytes"] != source["sizeBytes"]
                or working_receipt["bytes"] != source["sizeBytes"]
            ):
                fail(f"Exact copy verification failed for {source['id']}.")
            assets.append(
                {
                    "source": source,
                    "original": {
                        **original_receipt,
                        "path": original_relative.as_posix(),
                    },
                    "working": {
                        **working_receipt,
                        "path": working_relative.as_posix(),
                    },
                    "image": inspect_image(working),
                }
            )

        final_root = output_root.resolve(strict=False)
        handoff = storage_handoff(plan, final_root, assets)
        handoff_relative = safe_relative(
            plan["layout"]["storageHandoffPath"], "layout.storageHandoffPath"
        )
        write_json_create_only(
            ensure_safe_destination(temporary, handoff_relative, "storage handoff"),
            handoff,
        )

        receipt_body = {
            "schema": RECEIPT_SCHEMA,
            "sessionId": plan["sessionId"],
            "projectId": plan["projectId"],
            "planSha256": plan["planSha256"],
            "planBytesSha256": sha256_bytes(plan_bytes),
            "outputRoot": str(final_root),
            "sourceCount": len(assets),
            "totalSourceBytes": total_bytes,
            "assets": assets,
            "storageHandoff": {
                "path": handoff_relative.as_posix(),
                "requestSha256": handoff["requestSha256"],
                "storageWritePerformed": False,
            },
            "authority": plan["authority"],
            "createOnlyOutput": True,
            "atomicPublication": True,
            "sourceMutation": False,
            "sourceDeletion": False,
            "storageWrite": False,
            "repositoryMutation": False,
            "providerExecution": False,
            "candidateApproval": False,
            "candidatePromotion": False,
            "publication": False,
            "forcePush": False,
            "bytesFlowThroughMcp": False,
        }
        receipt = add_self_hash(receipt_body, "receiptSha256")
        receipt_relative = safe_relative(
            plan["layout"]["receiptPath"], "layout.receiptPath"
        )
        write_json_create_only(
            ensure_safe_destination(temporary, receipt_relative, "receipt"), receipt
        )

        os.replace(temporary, output_root)
        published = True
        return receipt
    finally:
        if not published and temporary.exists():
            shutil.rmtree(temporary, ignore_errors=True)
