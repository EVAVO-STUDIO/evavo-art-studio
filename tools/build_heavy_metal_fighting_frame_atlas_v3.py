#!/usr/bin/env python3
"""Build one deterministic HEAVY METAL FIGHTING production-master-v3 Frame atlas."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image

PLAN_SCHEMA = "evavo.heavy-metal-fighting-frame-atlas-v3-plan.v1"
RECEIPT_SCHEMA = "evavo.heavy-metal-fighting-frame-atlas-v3-build-receipt.v1"
MANIFEST_SCHEMA = "evavo.heavy-metal-fighting-frame-atlas-v3-manifest.v1"
MAXIMUM_PLAN_BYTES = 16 * 1024 * 1024
CELL = (160, 160)
ATLAS = (2560, 2560)
COLUMNS = 16
AUTHORED_SLOTS = 224
TOTAL_SLOTS = 256
RESERVED_START = 224
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def fail(message: str) -> None:
    raise ValueError(f"HEAVY_METAL_FIGHTING_FRAME_ATLAS_V3_BUILD_INVALID: {message}")


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, separators=(",", ": ")) + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def add_hash(body: dict[str, Any], field: str) -> dict[str, Any]:
    return {**body, field: sha256_bytes(canonical_json(body))}


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_bytes(canonical_json(value))


def require_regular_file(path: Path, label: str) -> Path:
    try:
        path.lstat()
    except FileNotFoundError:
        fail(f"{label} does not exist: {path}")
    if path.is_symlink() or not path.is_file():
        fail(f"{label} must be a regular non-symlink file: {path}")
    return path.resolve(strict=True)


def require_directory(path: Path, label: str) -> Path:
    try:
        path.lstat()
    except FileNotFoundError:
        fail(f"{label} does not exist: {path}")
    if path.is_symlink() or not path.is_dir():
        fail(f"{label} must be an existing non-symlink directory: {path}")
    return path.resolve(strict=True)


def contained(path: Path, root: Path, label: str) -> None:
    try:
        path.relative_to(root)
    except ValueError:
        fail(f"{label} escaped allowed root {root}: {path}")


def validate_plan(plan: dict[str, Any]) -> dict[str, Any]:
    if plan.get("schema") != PLAN_SCHEMA:
        fail(f"plan schema must be {PLAN_SCHEMA}")
    supplied_hash = plan.get("planSha256")
    if not isinstance(supplied_hash, str) or not SHA256_PATTERN.fullmatch(supplied_hash):
        fail("planSha256 is missing or malformed")
    body = dict(plan)
    body.pop("planSha256", None)
    expected_hash = sha256_bytes(canonical_json(body))
    if supplied_hash != expected_hash:
        fail("planSha256 does not match canonical plan content")
    frame_id = str(plan.get("frameId") or "")
    if frame_id not in {"bastion", "viper", "citadel", "mirage"}:
        fail("frameId is not a canonical launch Frame")
    master = plan.get("productionMaster") or {}
    if master.get("contractId") != "production_master_v3":
        fail("production master contract id drifted")
    if master.get("cell") != {"width": 160, "height": 160}:
        fail("production master cell must be 160x160")
    if master.get("pivot") != {"x": 80, "y": 152}:
        fail("production master pivot must be 80,152")
    if master.get("atlas") != {"width": 2560, "height": 2560}:
        fail("production master atlas must be 2560x2560")
    if master.get("columns") != 16 or master.get("rows") != 16:
        fail("production master grid must be 16x16")
    if master.get("slotsPerFrame") != TOTAL_SLOTS or master.get("authoredSlotsPerFrame") != AUTHORED_SLOTS:
        fail("production master slot counts drifted")
    reserved = master.get("reservedSlots") or {}
    if reserved != {"start": 224, "end": 255, "count": 32, "requiredAlpha": "fully-transparent"}:
        fail("production master reserved range drifted")
    sources = plan.get("sources")
    if not isinstance(sources, list) or len(sources) != AUTHORED_SLOTS:
        fail("plan must contain exactly 224 authored sources")
    for index, source in enumerate(sources):
        if not isinstance(source, dict) or source.get("slot") != index:
            fail(f"sources must be ordered contiguously by slot; expected {index}")
        expected_row = index // COLUMNS
        expected_column = index % COLUMNS
        if source.get("row") != expected_row or source.get("column") != expected_column:
            fail(f"slot {index} row/column drifted")
        if source.get("x") != expected_column * CELL[0] or source.get("y") != expected_row * CELL[1]:
            fail(f"slot {index} pixel placement drifted")
        if source.get("width") != CELL[0] or source.get("height") != CELL[1]:
            fail(f"slot {index} dimensions drifted")
        if not SHA256_PATTERN.fullmatch(str(source.get("headReceiptSha256") or "")):
            fail(f"slot {index} is missing a valid delivery-ready receipt-chain head")
        if not SHA256_PATTERN.fullmatch(str(source.get("workOrderSha256") or "")):
            fail(f"slot {index} is missing a valid work-order SHA-256")
        if not SHA256_PATTERN.fullmatch(str(source.get("sourceSha256") or "")):
            fail(f"slot {index} is missing a valid source SHA-256")
    if plan.get("reservedSlots") != list(range(RESERVED_START, TOTAL_SLOTS)):
        fail("plan reserved slots must be exactly 224-255")
    game_target = plan.get("gameTarget") or {}
    if game_target.get("repository") != "EVAVO-STUDIO/steel-dominion":
        fail("game target repository drifted")
    if game_target.get("contractId") != "production_master_v3":
        fail("game target contract drifted")
    if game_target.get("imagePath") != f"res://assets/fighters/final-v3/{frame_id}.png":
        fail("game target image path drifted")
    if game_target.get("activationReady") is not False:
        fail("Art Studio atlas build may not mark game activation ready")
    authority = plan.get("authority") or {}
    if authority.get("workspaceExportWrite") is not True:
        fail("workspace export write authority is missing")
    for forbidden in ("targetRepositoryMutation", "gitMutation", "deployment", "publication", "forcePush"):
        if authority.get(forbidden) is not False:
            fail(f"forbidden authority {forbidden} became enabled")
    return plan


def load_rgba_source(source: dict[str, Any], allowed_root: Path) -> Image.Image:
    source_path = require_regular_file(Path(str(source.get("sourcePath") or "")), f"slot {source['slot']} source")
    contained(source_path, allowed_root, f"slot {source['slot']} source")
    supplied_sha = source.get("sourceSha256")
    if not isinstance(supplied_sha, str) or sha256_file(source_path) != supplied_sha:
        fail(f"slot {source['slot']} source SHA-256 changed")
    if source.get("sourceBytes") != source_path.stat().st_size:
        fail(f"slot {source['slot']} source byte count changed")
    image = Image.open(source_path)
    image.load()
    if image.size != CELL:
        image.close()
        fail(f"slot {source['slot']} source is {image.size}, expected {CELL}")
    if image.mode != "RGBA":
        mode = image.mode
        image.close()
        fail(f"slot {source['slot']} source mode is {mode}, expected RGBA")
    corners = [image.getpixel((0, 0))[3], image.getpixel((159, 0))[3], image.getpixel((0, 159))[3], image.getpixel((159, 159))[3]]
    if any(alpha != 0 for alpha in corners):
        image.close()
        fail(f"slot {source['slot']} must retain transparent cell corners")
    return image


def reserved_region_is_transparent(atlas: Image.Image) -> bool:
    alpha = atlas.getchannel("A")
    for slot in range(RESERVED_START, TOTAL_SLOTS):
        column = slot % COLUMNS
        row = slot // COLUMNS
        crop = alpha.crop((column * 160, row * 160, (column + 1) * 160, (row + 1) * 160))
        extrema = crop.getextrema()
        if extrema != (0, 0):
            return False
    return True


def execute(plan: dict[str, Any], output_root: Path) -> dict[str, Any]:
    validate_plan(plan)
    workspace_root = require_directory(Path(str(plan["workspaceRoot"])), "workspaceRoot")
    allowed_root = require_directory(Path(str(plan["allowedSourceRoot"])), "allowedSourceRoot")
    contained(allowed_root, workspace_root, "allowedSourceRoot")
    outputs = plan.get("outputs") or {}
    recommended_parent = require_directory(workspace_root / str(outputs.get("recommendedWorkspaceParent") or ""), "recommended workspace export parent")
    output_root = Path(os.path.abspath(output_root))
    if output_root.exists() or output_root.is_symlink():
        fail("output root must not already exist")
    if output_root.parent.resolve(strict=True) != recommended_parent:
        fail(f"output root must be a direct child of {recommended_parent}")
    if output_root.name in {"", ".", ".."} or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for char in output_root.name):
        fail("output delivery directory name is not portable")
    temporary = Path(tempfile.mkdtemp(prefix=f".{output_root.name}.atlas-v3-", dir=str(recommended_parent)))
    published = False
    opened: list[Image.Image] = []
    try:
        image_name = str(outputs.get("image") or "")
        manifest_name = str(outputs.get("manifest") or "")
        receipt_name = str(outputs.get("receipt") or "")
        expected_names = {f"{plan['frameId']}.png", f"{plan['frameId']}.atlas-v3.json", f"{plan['frameId']}.atlas-v3.receipt.json"}
        if {image_name, manifest_name, receipt_name} != expected_names:
            fail("output file names drifted from the delivery contract")
        for name in (image_name, manifest_name, receipt_name):
            if Path(name).name != name or ".." in name:
                fail(f"output file name is not portable: {name}")

        atlas = Image.new("RGBA", ATLAS, (0, 0, 0, 0))
        opened.append(atlas)
        manifest_slots = []
        for source in plan["sources"]:
            image = load_rgba_source(source, allowed_root)
            opened.append(image)
            atlas.alpha_composite(image, dest=(int(source["x"]), int(source["y"])))
            manifest_slots.append({
                "slot": source["slot"],
                "row": source["row"],
                "column": source["column"],
                "x": source["x"],
                "y": source["y"],
                "width": 160,
                "height": 160,
                "bankId": source["bankId"],
                "unitId": source["unitId"],
                "batchId": source["batchId"],
                "workOrderSha256": source["workOrderSha256"],
                "sourceSha256": source["sourceSha256"],
                "headReceiptSha256": source["headReceiptSha256"],
            })
        if not reserved_region_is_transparent(atlas):
            fail("reserved slots 224-255 are not fully transparent before encoding")

        image_path = temporary / image_name
        atlas.save(image_path, format="PNG", optimize=True, compress_level=9)
        with Image.open(image_path) as encoded:
            encoded.load()
            if encoded.size != ATLAS or encoded.mode != "RGBA":
                fail("encoded atlas geometry or mode drifted")
            if not reserved_region_is_transparent(encoded):
                fail("encoded atlas reserved slots are not fully transparent")

        manifest_body = {
            "schema": MANIFEST_SCHEMA,
            "projectId": plan["projectId"],
            "frameId": plan["frameId"],
            "contractId": "production_master_v3",
            "planSha256": plan["planSha256"],
            "image": image_name,
            "imageSha256": sha256_file(image_path),
            "size": {"width": 2560, "height": 2560},
            "cell": {"width": 160, "height": 160},
            "pivot": {"x": 80, "y": 152},
            "columns": 16,
            "rows": 16,
            "authoredSlots": 224,
            "reservedSlots": list(range(224, 256)),
            "reservedSlotsFullyTransparent": True,
            "slots": manifest_slots,
            "gameTarget": plan["gameTarget"],
            "repositoryMutation": False,
            "publication": False,
        }
        manifest = add_hash(manifest_body, "manifestSha256")
        manifest_path = temporary / manifest_name
        write_json(manifest_path, manifest)

        receipt_body = {
            "schema": RECEIPT_SCHEMA,
            "projectId": plan["projectId"],
            "frameId": plan["frameId"],
            "contractId": "production_master_v3",
            "planSha256": plan["planSha256"],
            "styleProofExecutionSha256": plan["styleProofExecutionSha256"],
            "styleProofApproval": plan["styleProofApproval"],
            "sourceCount": 224,
            "reservedSlotCount": 32,
            "outputs": {
                "image": {"path": image_name, "sha256": sha256_file(image_path), "bytes": image_path.stat().st_size},
                "manifest": {"path": manifest_name, "sha256": sha256_file(manifest_path), "bytes": manifest_path.stat().st_size},
            },
            "gameTarget": plan["gameTarget"],
            "gameActivationReady": False,
            "gameActivationBlockers": plan["gameTarget"]["activationBlockers"],
            "authority": plan["authority"],
            "createOnlyOutput": True,
            "atomicWorkspacePublication": True,
            "sourceMutation": False,
            "targetRepositoryMutation": False,
            "gitMutation": False,
            "publication": False,
        }
        receipt = add_hash(receipt_body, "receiptSha256")
        receipt_path = temporary / receipt_name
        write_json(receipt_path, receipt)
        os.replace(temporary, output_root)
        published = True
        return receipt
    finally:
        for image in opened:
            image.close()
        if not published and temporary.exists():
            shutil.rmtree(temporary, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()
    try:
        plan_path = require_regular_file(args.plan, "plan")
        plan_bytes = plan_path.read_bytes()
        if len(plan_bytes) > MAXIMUM_PLAN_BYTES:
            fail("plan exceeds maximum byte length")
        plan = json.loads(plan_bytes.decode("utf-8-sig"))
        receipt = execute(plan, args.output_root)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"HEAVY METAL FIGHTING Frame atlas-v3 build failed: {exc}", file=os.sys.stderr)
        return 2
    print(json.dumps({
        "status": "passed",
        "schema": receipt["schema"],
        "frameId": receipt["frameId"],
        "sourceCount": receipt["sourceCount"],
        "reservedSlotCount": receipt["reservedSlotCount"],
        "receiptSha256": receipt["receiptSha256"],
        "gameActivationReady": receipt["gameActivationReady"],
        "targetRepositoryMutation": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
