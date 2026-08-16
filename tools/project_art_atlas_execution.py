from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image

from project_art_atlas_contract import (
    RECEIPT_SCHEMA,
    add_hash,
    existing_root,
    fail,
    sha256_bytes,
    sha256_file,
    transparent_rgb_options,
    validate_plan,
)
from project_art_atlas_models import prepare_frame
from project_art_atlas_output import frame_metadata, paste_extruded, regions_overlap, write_json
from project_art_atlas_packing import choose_layout


def _transparent_rgb_summary(prepared: list[Any], options: dict[str, Any]) -> dict[str, Any]:
    evidence = [frame.transparent_rgb_bleed for frame in prepared]
    return {
        "schema": "evavo.project-art-atlas-transparent-rgb-summary.v1",
        "enabled": bool(options["transparentRgbBleed"]),
        "radius": int(options["transparentRgbBleedRadius"]),
        "alphaThreshold": int(options["transparentRgbAlphaThreshold"]),
        "frameCount": len(evidence),
        "appliedFrameCount": sum(1 for item in evidence if item["applied"]),
        "eligiblePixels": sum(int(item["eligiblePixels"]) for item in evidence),
        "filledPixels": sum(int(item["filledPixels"]) for item in evidence),
        "unreachedPixels": sum(int(item["unreachedPixels"]) for item in evidence),
        "alphaPreserved": all(bool(item["guarantees"]["alphaPreserved"]) for item in evidence),
        "strongerAlphaRgbPreserved": all(
            bool(item["guarantees"]["strongerAlphaRgbPreserved"])
            for item in evidence
        ),
        "exactRgbaAtlasPaste": True,
    }


def execute(plan: dict[str, Any], plan_bytes: bytes, output_root: Path) -> dict[str, Any]:
    validate_plan(plan)
    if output_root.exists() or output_root.is_symlink():
        fail("Output root must not already exist.")
    parent = output_root.parent.resolve(strict=True)
    roots = [
        existing_root(value, f"allowedSourceRoots[{index}]")
        for index, value in enumerate(plan.get("allowedSourceRoots") or [])
    ]
    options = dict(plan.get("options") or {})
    options.update(transparent_rgb_options(options))
    options["maximumDecodedPixelsPerFrame"] = int(
        (plan.get("limits") or {}).get("maximumDecodedPixelsPerFrame", 220_000_000)
    )
    frames_input = plan.get("frames")
    if not isinstance(frames_input, list) or not frames_input:
        fail("Plan frames must be a non-empty array.")
    prepared = [
        prepare_frame(item, roots, options, index)
        for index, item in enumerate(frames_input)
    ]
    placements, width, height = choose_layout(prepared, options)
    extrude = int(options["extrude"])
    for index, left in enumerate(placements):
        for right in placements[index + 1 :]:
            if regions_overlap(left, right, extrude):
                fail(f"Atlas placements overlap: {left.frame.frame_id}, {right.frame.frame_id}.")

    temporary = Path(tempfile.mkdtemp(prefix=f".{output_root.name}.atlas-", dir=str(parent)))
    published = False
    try:
        output_files = plan.get("outputFiles") or {}
        expected_names = {
            "image",
            "manifest",
            "texturePacker",
            "phaser",
            "godot",
            "receipt",
        }
        if set(output_files) != expected_names:
            fail("Plan output file set is invalid.")
        paths: dict[str, Path] = {}
        for key, value in output_files.items():
            if not isinstance(value, str) or Path(value).name != value or ".." in value:
                fail(f"outputFiles.{key} must be one portable file name.")
            paths[key] = temporary / value

        atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        for placement in placements:
            image = placement.frame.image
            rotated_image = None
            if placement.rotated:
                rotated_image = image.transpose(Image.Transpose.ROTATE_270)
                image = rotated_image
            try:
                paste_extruded(atlas, image, placement.x, placement.y, extrude)
            finally:
                if rotated_image is not None:
                    rotated_image.close()
        atlas.save(paths["image"], format="PNG", optimize=True, compress_level=9)
        atlas.close()

        ordered = sorted(placements, key=lambda item: item.frame.frame_id)
        frames_hash = {item.frame.frame_id: frame_metadata(item) for item in ordered}
        image_name = paths["image"].name
        transparent_rgb = _transparent_rgb_summary(prepared, options)
        common_meta = {
            "app": "EVAVO Art Studio",
            "version": "1.0",
            "image": image_name,
            "format": "RGBA8888",
            "size": {"w": width, "h": height},
            "scale": "1",
            "atlasId": plan["atlasId"],
            "projectId": plan["projectId"],
            "planSha256": plan["planSha256"],
            "padding": int(options["padding"]),
            "margin": int(options["margin"]),
            "extrude": extrude,
            "transparentRgbBleed": transparent_rgb,
        }
        texture_packer = {
            "frames": frames_hash,
            "meta": common_meta,
        }
        phaser = {
            "frames": frames_hash,
            "meta": {**common_meta, "compatibleWith": "Phaser Texture Atlas JSON Hash"},
        }
        godot_regions = {
            item.frame.frame_id: {
                "region": {
                    "x": item.x,
                    "y": item.y,
                    "width": item.width,
                    "height": item.height,
                },
                "margin": {
                    "left": item.frame.trim_x,
                    "top": item.frame.trim_y,
                    "right": item.frame.source_width - item.frame.trim_x - item.frame.trim_width,
                    "bottom": item.frame.source_height - item.frame.trim_y - item.frame.trim_height,
                },
                "rotated": item.rotated,
                "pivot": {"x": item.frame.pivot_x, "y": item.frame.pivot_y},
                "transparentRgbBleed": item.frame.transparent_rgb_bleed,
            }
            for item in ordered
        }
        godot = {
            "schema": "evavo.project-art-godot-region-map.v1",
            "texture": image_name,
            "size": {"width": width, "height": height},
            "regions": godot_regions,
            "transparentRgbBleed": transparent_rgb,
            "planSha256": plan["planSha256"],
        }
        manifest_body = {
            "schema": "evavo.project-art-atlas-manifest.v1",
            "atlasId": plan["atlasId"],
            "projectId": plan["projectId"],
            "image": image_name,
            "size": {"width": width, "height": height},
            "frameCount": len(ordered),
            "frames": frames_hash,
            "options": {key: value for key, value in options.items() if key != "maximumDecodedPixelsPerFrame"},
            "transparentRgbBleed": transparent_rgb,
            "planSha256": plan["planSha256"],
            "sourceMutation": False,
            "repositoryMutation": False,
            "publication": False,
        }
        manifest = add_hash(manifest_body, "manifestSha256")
        write_json(paths["manifest"], manifest)
        write_json(paths["texturePacker"], texture_packer)
        write_json(paths["phaser"], phaser)
        write_json(paths["godot"], godot)

        outputs = {}
        for key in ("image", "manifest", "texturePacker", "phaser", "godot"):
            output = paths[key]
            outputs[key] = {
                "path": output.name,
                "sha256": sha256_file(output),
                "bytes": output.stat().st_size,
            }
        receipt_body = {
            "schema": RECEIPT_SCHEMA,
            "atlasId": plan["atlasId"],
            "projectId": plan["projectId"],
            "planSha256": plan["planSha256"],
            "planBytesSha256": sha256_bytes(plan_bytes),
            "frameCount": len(ordered),
            "size": {"width": width, "height": height},
            "transparentRgbBleed": transparent_rgb,
            "outputs": outputs,
            "authority": plan["authority"],
            "createOnlyOutput": True,
            "atomicPublication": True,
            "sourceMutation": False,
            "sourceDeletion": False,
            "repositoryMutation": False,
            "storageWrite": False,
            "providerExecution": False,
            "candidateApproval": False,
            "candidatePromotion": False,
            "publication": False,
            "forcePush": False,
            "bytesFlowThroughMcp": False,
        }
        receipt = add_hash(receipt_body, "receiptSha256")
        write_json(paths["receipt"], receipt)
        os.replace(temporary, output_root)
        published = True
        return receipt
    finally:
        for frame in prepared:
            frame.image.close()
        if not published and temporary.exists():
            shutil.rmtree(temporary, ignore_errors=True)
