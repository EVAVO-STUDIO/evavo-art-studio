#!/usr/bin/env python3
"""Adversarial fixture for immutable keep-candidate evidence."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError as error:  # pragma: no cover
    raise SystemExit("Pillow is required: install requirements-image-pipeline.txt") from error

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "executable-image-pipeline.v1.json"
BANK = ROOT / "tools" / "build_image_style_reference_bank.py"
EVALUATOR = ROOT / "tools" / "evaluate_image_candidate.py"
VERIFIER = ROOT / "tools" / "verify_image_pipeline_evidence_v2.py"
ERRORS: list[str] = []


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def draw(path: Path) -> None:
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    drawing = ImageDraw.Draw(image)
    drawing.ellipse((23, 7, 41, 25), fill=(224, 224, 224, 255), outline=(0, 0, 0, 255), width=2)
    drawing.rectangle((18, 24, 46, 55), fill=(30, 30, 30, 255), outline=(0, 0, 0, 255), width=2)
    drawing.rectangle((16, 4, 48, 11), fill=(255, 36, 78, 255))
    drawing.line((24, 55, 20, 63), fill=(0, 0, 0, 255), width=3)
    drawing.line((40, 55, 44, 63), fill=(0, 0, 0, 255), width=3)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG")


for required in (CONFIG, BANK, EVALUATOR, VERIFIER):
    if required.is_symlink() or not required.is_file():
        ERRORS.append(f"missing regular keep-evidence tool: {required.relative_to(ROOT)}")

if not ERRORS:
    with tempfile.TemporaryDirectory(prefix="evavo-keep-evidence-") as temporary:
        root = Path(temporary)
        repo = root / "repo"
        sources = root / "sources"
        evidence = root / "evidence"
        (repo / "config").mkdir(parents=True)
        sources.mkdir()
        evidence.mkdir()
        (repo / "config" / CONFIG.name).write_bytes(CONFIG.read_bytes())
        source = sources / "approved_character.png"
        draw(source)
        source_sha = digest(source)
        selection = {
            "schema": "evavo.image-style-reference-selection.v1",
            "references": [{
                "sourcePath": source.name,
                "sourceSha256": source_sha,
                "semanticRole": "standing-character",
                "approvedTraits": ["readable silhouette", "monochrome engraving", "restrained red accent"],
                "approvalAuthority": "fixture-creative-review",
                "reviewSha256": hashlib.sha256(b"keep-review").hexdigest(),
            }],
        }
        selection_path = evidence / "selection.json"
        bank_path = evidence / "bank.json"
        selection_path.write_text(json.dumps(selection, indent=2) + "\n", encoding="utf-8")
        bank_result = subprocess.run(
            [sys.executable, str(BANK), "--repo", str(repo), "--source-root", str(sources), "--selection", str(selection_path), "--output", str(bank_path)],
            cwd=ROOT, text=True, capture_output=True, check=False,
        )
        if bank_result.returncode != 0:
            ERRORS.append(f"keep style-bank fixture failed: {(bank_result.stderr or bank_result.stdout).strip()}")
        else:
            work_order = {
                "schema": "evavo.image-reference-work-order.v1",
                "sourcePath": source.name,
                "sourceSha256": source_sha,
                "decision": "keep",
                "semanticRole": "standing-character",
                "targetCanvas": [64, 64],
                "alphaPolicy": "meaningful-alpha-required",
                "runtimeFormat": "png",
                "preserve": ["all approved identity and composition"],
                "removeOrFix": [],
                "negativeConstraints": ["no source mutation"],
                "operations": [],
                "providerExecution": False,
                "sourceOverwrite": False,
                "sourceDeletion": False,
                "publication": False,
            }
            work_order_path = evidence / "work-order.json"
            evaluation_path = evidence / "evaluation.json"
            work_order_path.write_text(json.dumps(work_order, indent=2) + "\n", encoding="utf-8")
            evaluate_result = subprocess.run(
                [
                    sys.executable, str(EVALUATOR), "--repo", str(repo), "--source-root", str(sources), "--candidate-root", str(sources),
                    "--candidate", source.name, "--work-order", str(work_order_path), "--style-bank", str(bank_path),
                    "--style-distance-threshold", "0.75", "--output", str(evaluation_path),
                ],
                cwd=ROOT, text=True, capture_output=True, check=False,
            )
            if evaluate_result.returncode != 0:
                ERRORS.append(f"keep evaluation fixture failed: {(evaluate_result.stderr or evaluate_result.stdout).strip()}")
            else:
                verify_result = subprocess.run(
                    [
                        sys.executable, str(VERIFIER), "--repo", str(repo), "--source-root", str(sources), "--candidate-root", str(sources),
                        "--work-order", str(work_order_path), "--style-bank", str(bank_path), "--evaluation", str(evaluation_path),
                        "--verify-source-bytes", "--verify-pixels",
                    ],
                    cwd=ROOT, text=True, capture_output=True, check=False,
                )
                if verify_result.returncode != 0:
                    ERRORS.append(f"keep evidence fixture failed: {(verify_result.stderr or verify_result.stdout).strip()}")

                fake_receipt = {
                    "schema": "evavo.image-processing-receipt.v1",
                    "contract": "evavo.executable-image-pipeline.v1",
                    "status": "passed",
                    "sourcePath": source.name,
                    "sourceSha256": source_sha,
                    "candidatePath": source.name,
                    "candidateSha256": source_sha,
                }
                fake_receipt["receiptSha256"] = hashlib.sha256(
                    json.dumps(fake_receipt, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
                ).hexdigest()
                fake_path = evidence / "fake-receipt.json"
                fake_path.write_text(json.dumps(fake_receipt, indent=2) + "\n", encoding="utf-8")
                fake_result = subprocess.run(
                    [
                        sys.executable, str(VERIFIER), "--repo", str(repo), "--source-root", str(sources), "--candidate-root", str(sources),
                        "--work-order", str(work_order_path), "--style-bank", str(bank_path), "--processing-receipt", str(fake_path),
                        "--evaluation", str(evaluation_path),
                    ],
                    cwd=ROOT, text=True, capture_output=True, check=False,
                )
                if fake_result.returncode == 0:
                    ERRORS.append("keep fixture accepted an invented processing receipt")

print("EVAVO immutable keep-candidate evidence contract")
for error in ERRORS:
    print(f"  - {error}")
if ERRORS:
    sys.exit(1)
print("  exact source evaluation passed and invented processing evidence was rejected")
sys.exit(0)
