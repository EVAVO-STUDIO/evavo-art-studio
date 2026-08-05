#!/usr/bin/env python3
"""Executable adversarial fixture for image pipeline evidence verification."""
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
PROCESSOR = ROOT / "tools" / "process_image_work_order.py"
EVALUATOR = ROOT / "tools" / "evaluate_image_candidate.py"
BANK_VERIFIER = ROOT / "tools" / "verify_image_style_reference_bank.py"
EVIDENCE_VERIFIER = ROOT / "tools" / "verify_image_pipeline_evidence.py"
ERRORS: list[str] = []


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def draw(path: Path, opaque: bool) -> None:
    image = Image.new("RGBA", (48, 48), (255, 255, 255, 255) if opaque else (0, 0, 0, 0))
    drawing = ImageDraw.Draw(image)
    drawing.ellipse((17, 5, 31, 19), fill=(220, 220, 220, 255), outline=(0, 0, 0, 255), width=1)
    drawing.rectangle((13, 18, 35, 42), fill=(25, 25, 25, 255), outline=(0, 0, 0, 255), width=2)
    drawing.rectangle((11, 3, 37, 8), fill=(255, 36, 78, 255))
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG")


for required in (CONFIG, BANK, PROCESSOR, EVALUATOR, BANK_VERIFIER, EVIDENCE_VERIFIER):
    if required.is_symlink() or not required.is_file():
        ERRORS.append(f"missing regular evidence tool: {required.relative_to(ROOT)}")

if not ERRORS:
    with tempfile.TemporaryDirectory(prefix="evavo-image-evidence-") as temporary:
        temp = Path(temporary)
        repo = temp / "repo"
        sources = temp / "sources"
        candidates = temp / "candidates"
        evidence = temp / "evidence"
        (repo / "config").mkdir(parents=True)
        sources.mkdir()
        candidates.mkdir()
        evidence.mkdir()
        (repo / "config" / CONFIG.name).write_bytes(CONFIG.read_bytes())
        reference = sources / "reference.png"
        source = sources / "source.png"
        draw(reference, opaque=False)
        draw(source, opaque=True)
        selection = {
            "schema": "evavo.image-style-reference-selection.v1",
            "references": [{
                "sourcePath": "reference.png",
                "sourceSha256": digest(reference),
                "semanticRole": "standing-character",
                "approvedTraits": ["clear silhouette", "restrained red accent"],
                "approvalAuthority": "fixture-authority",
                "reviewSha256": hashlib.sha256(b"fixture-review").hexdigest(),
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
            ERRORS.append(f"bank fixture failed: {(bank_result.stderr or bank_result.stdout).strip()}")
        else:
            bank_verify = subprocess.run(
                [sys.executable, str(BANK_VERIFIER), "--repo", str(repo), "--bank", str(bank_path), "--source-root", str(sources), "--verify-source-bytes"],
                cwd=ROOT, text=True, capture_output=True, check=False,
            )
            if bank_verify.returncode != 0:
                ERRORS.append(f"bank verification fixture failed: {(bank_verify.stderr or bank_verify.stdout).strip()}")

            work_order = {
                "schema": "evavo.image-reference-work-order.v1",
                "sourcePath": "source.png",
                "sourceSha256": digest(source),
                "decision": "edit",
                "semanticRole": "standing-character",
                "targetCanvas": [48, 48],
                "alphaPolicy": "meaningful-alpha-required",
                "runtimeFormat": "png",
                "preserve": ["clear silhouette"],
                "removeOrFix": ["white outer matte"],
                "negativeConstraints": ["no modern detail"],
                "operations": ["connected-matte-to-alpha", "canvas-normalize", "convert", "optimize"],
                "operationParameters": {"connected-matte-to-alpha": {"matteColor": [255, 255, 255], "tolerance": 12, "featherRadius": 0}},
            }
            work_order_path = evidence / "work-order.json"
            receipt_path = evidence / "receipt.json"
            evaluation_path = evidence / "evaluation.json"
            work_order_path.write_text(json.dumps(work_order, indent=2) + "\n", encoding="utf-8")
            process_result = subprocess.run(
                [
                    sys.executable, str(PROCESSOR), "--repo", str(repo), "--source-root", str(sources), "--output-root", str(candidates),
                    "--work-order", str(work_order_path), "--output", "candidate.png", "--receipt", str(receipt_path),
                ],
                cwd=ROOT, text=True, capture_output=True, check=False,
            )
            if process_result.returncode != 0:
                ERRORS.append(f"processing fixture failed: {(process_result.stderr or process_result.stdout).strip()}")
            else:
                evaluate_result = subprocess.run(
                    [
                        sys.executable, str(EVALUATOR), "--repo", str(repo), "--source-root", str(sources), "--candidate-root", str(candidates),
                        "--candidate", "candidate.png", "--work-order", str(work_order_path), "--style-bank", str(bank_path),
                        "--processing-receipt", str(receipt_path), "--style-distance-threshold", "0.75", "--output", str(evaluation_path),
                    ],
                    cwd=ROOT, text=True, capture_output=True, check=False,
                )
                if evaluate_result.returncode != 0:
                    ERRORS.append(f"evaluation fixture failed: {(evaluate_result.stderr or evaluate_result.stdout).strip()}")
                else:
                    verify_result = subprocess.run(
                        [
                            sys.executable, str(EVIDENCE_VERIFIER), "--repo", str(repo), "--source-root", str(sources), "--candidate-root", str(candidates),
                            "--work-order", str(work_order_path), "--style-bank", str(bank_path), "--processing-receipt", str(receipt_path),
                            "--evaluation", str(evaluation_path), "--verify-source-bytes", "--verify-pixels",
                        ],
                        cwd=ROOT, text=True, capture_output=True, check=False,
                    )
                    if verify_result.returncode != 0:
                        ERRORS.append(f"evidence-chain fixture failed: {(verify_result.stderr or verify_result.stdout).strip()}")

                    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
                    receipt["candidateSizeBytes"] += 1
                    tampered = evidence / "tampered-receipt.json"
                    tampered.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
                    tamper_result = subprocess.run(
                        [
                            sys.executable, str(EVIDENCE_VERIFIER), "--repo", str(repo), "--source-root", str(sources), "--candidate-root", str(candidates),
                            "--work-order", str(work_order_path), "--style-bank", str(bank_path), "--processing-receipt", str(tampered),
                            "--evaluation", str(evaluation_path),
                        ],
                        cwd=ROOT, text=True, capture_output=True, check=False,
                    )
                    if tamper_result.returncode == 0:
                        ERRORS.append("tampered processing receipt was accepted")

print("EVAVO image pipeline evidence contract")
for error in ERRORS:
    print(f"  - {error}")
if ERRORS:
    sys.exit(1)
print("  style bank and exact source/candidate evidence verification passed")
sys.exit(0)
