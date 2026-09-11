from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def alpha_info(image: Image.Image) -> tuple[bool, list[int] | None, bool]:
    has_alpha = "A" in image.getbands()
    bbox = None
    touches_edge = False
    if has_alpha:
        alpha = image.getchannel("A")
        bbox_raw = alpha.getbbox()
        if bbox_raw:
            bbox = [int(v) for v in bbox_raw]
            left, top, right, bottom = bbox_raw
            touches_edge = left == 0 or top == 0 or right == image.width or bottom == image.height
    else:
        bbox = [0, 0, image.width, image.height]
        touches_edge = True
    return has_alpha, bbox, touches_edge


def main() -> int:
    parser = argparse.ArgumentParser(description="Intake a chat-supplied MÔN image into a governed local Art Studio workspace")
    parser.add_argument("source", type=Path)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--family-id", required=True)
    parser.add_argument("--project-id", default="moonstone-wales")
    parser.add_argument("--style-lock-id", required=True)
    parser.add_argument("--role", required=True)
    parser.add_argument("--target-repo", required=True)
    parser.add_argument("--target-path", required=True)
    parser.add_argument("--commit-message", required=True)
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.is_file():
        raise SystemExit(f"source file not found: {source}")
    if source.suffix.lower().lstrip(".") not in {"png", "jpg", "jpeg", "webp"}:
        raise SystemExit("unsupported image format")

    workspace = args.workspace.resolve()
    original_dir = workspace / "original"
    candidates_dir = workspace / "candidates"
    proofs_dir = workspace / "proofs"
    original_dir.mkdir(parents=True, exist_ok=True)
    candidates_dir.mkdir(parents=True, exist_ok=True)
    proofs_dir.mkdir(parents=True, exist_ok=True)

    original_name = f"{args.asset_id}{source.suffix.lower()}"
    original_path = original_dir / original_name
    if original_path.exists():
        existing_hash = sha256_file(original_path)
        source_hash = sha256_file(source)
        if existing_hash != source_hash:
            raise SystemExit(f"immutable original already exists with different bytes: {original_path}")
    else:
        shutil.copy2(source, original_path)

    with Image.open(original_path) as img:
        img.load()
        has_alpha, bbox, touches_edge = alpha_info(img)
        metadata = {
            "width": img.width,
            "height": img.height,
            "mode": img.mode,
            "format": img.format,
            "has_alpha": has_alpha,
            "opaque_bounds": bbox,
            "opaque_bounds_touch_canvas_edge": touches_edge,
        }

    receipt = {
        "schema_version": 1,
        "candidate_id": f"{args.asset_id}_chat_source",
        "asset_id": args.asset_id,
        "family_id": args.family_id,
        "project_id": args.project_id,
        "style_lock_id": args.style_lock_id,
        "intended_role": args.role,
        "source_kind": "chat_attachment",
        "source_original": str(original_path),
        "source_sha256": sha256_file(original_path),
        "source_size_bytes": original_path.stat().st_size,
        "image": metadata,
        "review_state": "intake",
        "runtime_authority": False,
        "recommended_review": [
            "native_scale_visual_review",
            "alpha_and_edge_review",
            "style_family_comparison",
            "historical_detail_review_if_applicable",
        ],
        "promotion": {
            "target_repo": args.target_repo,
            "target_path": args.target_path,
            "branch": "main",
            "commit_message": args.commit_message,
            "exact_hash_required": True,
            "github_actions_required": False,
        },
    }
    receipt_path = workspace / "intake-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "workspace": str(workspace), "receipt": str(receipt_path), "sha256": receipt["source_sha256"], "image": metadata}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
