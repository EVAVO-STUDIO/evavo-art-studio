#!/usr/bin/env python3
"""Permanent end-to-end and adversarial checks for the executable image pipeline."""
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
FEATURES = ROOT / "tools" / "image_style_features.py"
BANK = ROOT / "tools" / "build_image_style_reference_bank.py"
PROCESSOR = ROOT / "tools" / "process_image_work_order.py"
FALLBACK = ROOT / "tools" / "process_image_work_order_system_drawing.ps1"
EVALUATOR = ROOT / "tools" / "evaluate_image_candidate.py"
REQUIREMENTS = ROOT / "requirements-image-pipeline.txt"
ERRORS: list[str] = []


def text(path: Path) -> str:
    if path.is_symlink() or not path.is_file():
        ERRORS.append(f"missing regular pipeline file: {path.relative_to(ROOT)}")
        return ""
    value = path.read_text(encoding="utf-8-sig")
    if not value.strip():
        ERRORS.append(f"blank pipeline file: {path.relative_to(ROOT)}")
    return value


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def draw_character(path: Path, shift: int, opaque_background: bool) -> None:
    image = Image.new("RGBA", (80, 80), (255, 255, 255, 255) if opaque_background else (0, 0, 0, 0))
    drawing = ImageDraw.Draw(image)
    x = 31 + shift
    drawing.ellipse((x, 12, x + 18, 30), fill=(222, 222, 222, 255), outline=(0, 0, 0, 255), width=2)
    drawing.rectangle((x - 4, 28, x + 22, 66), fill=(35, 35, 35, 255), outline=(0, 0, 0, 255), width=2)
    drawing.rectangle((x - 8, 8, x + 26, 15), fill=(255, 36, 78, 255), outline=(0, 0, 0, 255), width=1)
    drawing.line((x + 2, 66, x - 2, 76), fill=(0, 0, 0, 255), width=4)
    drawing.line((x + 16, 66, x + 20, 76), fill=(0, 0, 0, 255), width=4)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG")


config_source = text(CONFIG)
features_source = text(FEATURES)
bank_source = text(BANK)
processor_source = text(PROCESSOR)
fallback_source = text(FALLBACK)
evaluator_source = text(EVALUATOR)
requirements_source = text(REQUIREMENTS)
try:
    config = json.loads(config_source)
except json.JSONDecodeError as error:
    ERRORS.append(f"pipeline config is not JSON: {error}")
    config = {}

if config.get("contract") != "evavo.executable-image-pipeline.v1":
    ERRORS.append("pipeline contract identity changed")
if config.get("effects") != {
    "providerExecution": False,
    "sourceOverwrite": False,
    "sourceDeletion": False,
    "targetRepositoryMutation": False,
    "publication": False,
}:
    ERRORS.append("pipeline effect boundary changed")
for token in (
    "active-occupancy-grid",
    "perceptual-dhash",
    "dominant-palette",
    "independentCandidateEvaluationRequired",
):
    if token not in config_source:
        ERRORS.append(f"pipeline config lost required token: {token}")
for token in (
    "connected_matte_to_alpha",
    "luminance_to_alpha",
    "hidden_rgb_rebuild",
    "source image changed during processing",
    "candidate output must be create-only",
    "evavo.image-processing-receipt.v1",
):
    if token not in processor_source:
        ERRORS.append(f"Pillow processor lost required token: {token}")
for token in (
    "style_distance",
    "candidate-outside-approved-style-profile",
    "meaningful-alpha-required",
    "creativeApproval",
    "publicationAuthority",
):
    if token not in evaluator_source:
        ERRORS.append(f"candidate evaluator lost required token: {token}")
for token in (
    "aggregate_profile",
    "duplicate style-reference bytes",
    "approvalAuthority",
    "bankSha256",
):
    if token not in bank_source:
        ERRORS.append(f"style bank builder lost required token: {token}")
for token in ("featureVersion", "occupancyGrid", "dhash", "edgeDensity", "redAccentRatio"):
    if token not in features_source:
        ERRORS.append(f"feature extractor lost required token: {token}")
for token in ("Windows-only", "System.Drawing", "meaningful-alpha", "create-only"):
    if token not in fallback_source:
        ERRORS.append(f"System.Drawing fallback lost required token: {token}")
if "Pillow" not in requirements_source:
    ERRORS.append("image pipeline dependency declaration lost Pillow")
for forbidden in (
    "git push",
    "git commit",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "shell=True",
    "os.system(",
    "eval(",
):
    if forbidden in "\n".join((features_source, bank_source, processor_source, evaluator_source)):
        ERRORS.append(f"image pipeline contains prohibited effect or credential: {forbidden}")

if not ERRORS:
    with tempfile.TemporaryDirectory(prefix="evavo-image-pipeline-") as temporary:
        temporary_root = Path(temporary)
        repo = temporary_root / "repo"
        source_root = temporary_root / "sources"
        output_root = temporary_root / "outputs"
        evidence = temporary_root / "evidence"
        (repo / "config").mkdir(parents=True)
        source_root.mkdir()
        output_root.mkdir()
        evidence.mkdir()
        (repo / "config" / CONFIG.name).write_text(config_source, encoding="utf-8")

        reference_paths = []
        for index, shift in enumerate((-2, 0, 2), start=1):
            path = source_root / "references" / f"character_{index}.png"
            draw_character(path, shift, opaque_background=False)
            reference_paths.append(path)
        source_path = source_root / "raw" / "character_source.png"
        draw_character(source_path, 1, opaque_background=True)

        references = []
        for path in reference_paths:
            references.append({
                "sourcePath": path.relative_to(source_root).as_posix(),
                "sourceSha256": digest(path),
                "semanticRole": "standing-character",
                "approvedTraits": ["front-facing silhouette", "monochrome linework", "restrained red accent"],
                "approvalAuthority": "fixture-art-review",
                "reviewSha256": hashlib.sha256((path.name + "-review").encode("utf-8")).hexdigest(),
            })
        selection = {"schema": "evavo.image-style-reference-selection.v1", "references": references}
        selection_path = evidence / "selection.json"
        bank_path = evidence / "style-bank.json"
        selection_path.write_text(json.dumps(selection, indent=2) + "\n", encoding="utf-8")
        bank_result = subprocess.run(
            [
                sys.executable,
                str(BANK),
                "--repo",
                str(repo),
                "--source-root",
                str(source_root),
                "--selection",
                str(selection_path),
                "--output",
                str(bank_path),
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if bank_result.returncode != 0:
            ERRORS.append(f"style bank fixture failed: {(bank_result.stderr or bank_result.stdout).strip()}")
        else:
            work_order = {
                "schema": "evavo.image-reference-work-order.v1",
                "sourcePath": source_path.relative_to(source_root).as_posix(),
                "sourceSha256": digest(source_path),
                "decision": "edit",
                "semanticRole": "standing-character",
                "targetCanvas": [64, 64],
                "alphaPolicy": "meaningful-alpha-required",
                "runtimeFormat": "png",
                "preserve": ["front-facing figure", "red hat accent"],
                "removeOrFix": ["connected white outer matte", "oversized source canvas"],
                "negativeConstraints": ["no modern clothing", "no pseudo-text"],
                "operations": [
                    "connected-matte-to-alpha",
                    "edge-decontaminate",
                    "crop-safe",
                    "canvas-normalize",
                    "palette-normalize",
                    "hidden-rgb-rebuild",
                    "convert",
                    "optimize"
                ],
                "operationParameters": {
                    "connected-matte-to-alpha": {"matteColor": [255, 255, 255], "tolerance": 18, "featherRadius": 0},
                    "edge-decontaminate": {"matteColor": [255, 255, 255]},
                    "crop-safe": {"paddingRatio": 0.05},
                    "canvas-normalize": {"anchor": "bottom-center"},
                    "palette-normalize": {"redAccent": "#ff244e", "contrast": 1.1}
                },
                "providerExecution": False,
                "sourceOverwrite": False,
                "sourceDeletion": False,
                "publication": False,
            }
            work_order_path = evidence / "work-order.json"
            receipt_path = evidence / "processing-receipt.json"
            work_order_path.write_text(json.dumps(work_order, indent=2) + "\n", encoding="utf-8")
            process_result = subprocess.run(
                [
                    sys.executable,
                    str(PROCESSOR),
                    "--repo",
                    str(repo),
                    "--source-root",
                    str(source_root),
                    "--output-root",
                    str(output_root),
                    "--work-order",
                    str(work_order_path),
                    "--output",
                    "candidates/character.png",
                    "--receipt",
                    str(receipt_path),
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            if process_result.returncode != 0:
                ERRORS.append(f"image processing fixture failed: {(process_result.stderr or process_result.stdout).strip()}")
            else:
                evaluation_path = evidence / "candidate-evaluation.json"
                evaluate_result = subprocess.run(
                    [
                        sys.executable,
                        str(EVALUATOR),
                        "--repo",
                        str(repo),
                        "--source-root",
                        str(source_root),
                        "--candidate-root",
                        str(output_root),
                        "--candidate",
                        "candidates/character.png",
                        "--work-order",
                        str(work_order_path),
                        "--style-bank",
                        str(bank_path),
                        "--processing-receipt",
                        str(receipt_path),
                        "--style-distance-threshold",
                        "0.75",
                        "--output",
                        str(evaluation_path),
                    ],
                    cwd=ROOT,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                if evaluate_result.returncode != 0:
                    ERRORS.append(f"candidate evaluation fixture failed: {(evaluate_result.stderr or evaluate_result.stdout).strip()}")
                else:
                    evaluation = json.loads(evaluation_path.read_text(encoding="utf-8"))
                    if evaluation.get("status") != "passed" or evaluation.get("blockers"):
                        ERRORS.append("valid fixture candidate was not accepted")

                blank_path = output_root / "candidates" / "blank.png"
                Image.new("RGBA", (64, 64), (0, 0, 0, 0)).save(blank_path, format="PNG")
                blank_evaluation = evidence / "blank-evaluation.json"
                blank_result = subprocess.run(
                    [
                        sys.executable,
                        str(EVALUATOR),
                        "--repo",
                        str(repo),
                        "--source-root",
                        str(source_root),
                        "--candidate-root",
                        str(output_root),
                        "--candidate",
                        "candidates/blank.png",
                        "--work-order",
                        str(work_order_path),
                        "--style-bank",
                        str(bank_path),
                        "--style-distance-threshold",
                        "0.75",
                        "--output",
                        str(blank_evaluation),
                    ],
                    cwd=ROOT,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                if blank_result.returncode != 3:
                    ERRORS.append("blank candidate fixture did not return blocked status")
                elif "blank-or-fully-transparent-candidate" not in json.loads(blank_evaluation.read_text(encoding="utf-8")).get("blockers", []):
                    ERRORS.append("blank candidate fixture lacks the expected blocker")

                bank = json.loads(bank_path.read_text(encoding="utf-8"))
                bank["roleProfiles"]["standing-character"]["scalars"]["edgeDensity"]["median"] = 99
                tampered_bank = evidence / "tampered-bank.json"
                tampered_bank.write_text(json.dumps(bank, indent=2) + "\n", encoding="utf-8")
                tampered_result = subprocess.run(
                    [
                        sys.executable,
                        str(EVALUATOR),
                        "--repo",
                        str(repo),
                        "--source-root",
                        str(source_root),
                        "--candidate-root",
                        str(output_root),
                        "--candidate",
                        "candidates/character.png",
                        "--work-order",
                        str(work_order_path),
                        "--style-bank",
                        str(tampered_bank),
                        "--output",
                        str(evidence / "tampered-evaluation.json"),
                    ],
                    cwd=ROOT,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                if tampered_result.returncode == 0:
                    ERRORS.append("tampered style bank fixture was accepted")

print("EVAVO executable image learning pipeline")
for error in ERRORS:
    print(f"  - {error}")
if ERRORS:
    sys.exit(1)
print("  style learning, processing, candidate evaluation and adversarial checks passed")
sys.exit(0)
