#!/usr/bin/env python3
"""Independently evaluate an image candidate against exact source and style evidence."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from image_style_features import feature_vector, hamming_hex, load_image, resolve_inside, sha256_file, style_distance

WORK_ORDER_SCHEMA = "evavo.image-reference-work-order.v1"
BANK_SCHEMA = "evavo.image-style-reference-bank.v1"
RECEIPT_SCHEMA = "evavo.image-processing-receipt.v1"
EVALUATION_SCHEMA = "evavo.image-candidate-evaluation.v1"
CONTRACT_ID = "evavo.executable-image-pipeline.v1"


def fail(message: str) -> None:
    raise ValueError(message)


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def read_json(path: Path) -> tuple[dict[str, Any], bytes]:
    if path.is_symlink() or not path.is_file():
        fail(f"not a regular JSON file: {path}")
    raw = path.read_bytes()
    value = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(value, dict):
        fail(f"JSON document is not an object: {path}")
    return value, raw


def parse_canvas(value: Any) -> tuple[int, int]:
    if isinstance(value, list) and len(value) == 2:
        width, height = value
    elif isinstance(value, dict):
        width, height = value.get("width"), value.get("height")
    else:
        fail("targetCanvas is invalid")
    if not isinstance(width, int) or not isinstance(height, int) or width < 1 or height < 1:
        fail("targetCanvas dimensions are invalid")
    return width, height


def verify_bank(bank: dict[str, Any], contract: dict[str, Any]) -> None:
    if bank.get("schema") != BANK_SCHEMA or bank.get("contract") != CONTRACT_ID:
        fail("unexpected style bank identity")
    if bank.get("contractSha256") != sha256_json(contract):
        fail("style bank is not bound to the current pipeline contract")
    stored = bank.get("bankSha256")
    unhashed = dict(bank)
    unhashed.pop("bankSha256", None)
    unhashed.pop("runId", None)
    if not isinstance(stored, str) or stored != sha256_json(unhashed) or bank.get("runId") != stored[:20]:
        fail("style bank self hash is invalid")


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        fail(f"candidate evaluation already exists: {path}")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def evaluate(args: argparse.Namespace) -> dict[str, Any]:
    repo = args.repo.resolve()
    contract, _ = read_json(repo / "config" / "executable-image-pipeline.v1.json")
    work_order, work_order_bytes = read_json(args.work_order.resolve())
    bank, bank_bytes = read_json(args.style_bank.resolve())
    if contract.get("contract") != CONTRACT_ID:
        fail("unexpected executable image pipeline contract")
    if work_order.get("schema") != WORK_ORDER_SCHEMA:
        fail("unexpected work-order identity")
    verify_bank(bank, contract)

    source = resolve_inside(args.source_root.resolve(), str(work_order.get("sourcePath")))
    source_sha, source_size = sha256_file(source, int(contract["limits"]["maximumSourceBytes"]))
    if source_sha != str(work_order.get("sourceSha256") or "").lower():
        fail("source image changed after the work order was compiled")
    candidate = resolve_inside(args.candidate_root.resolve(), args.candidate)
    candidate_sha, candidate_size = sha256_file(candidate, int(contract["limits"]["maximumSourceBytes"]))
    source_features = feature_vector(load_image(source, int(contract["limits"]["maximumDecodedPixels"])))
    candidate_features = feature_vector(load_image(candidate, int(contract["limits"]["maximumDecodedPixels"])))

    receipt_hash = None
    if args.processing_receipt:
        receipt, receipt_bytes = read_json(args.processing_receipt.resolve())
        if receipt.get("schema") != RECEIPT_SCHEMA or receipt.get("status") != "passed":
            fail("processing receipt identity or status is invalid")
        if receipt.get("sourceSha256") != source_sha or receipt.get("candidateSha256") != candidate_sha:
            fail("processing receipt does not bind the exact source and candidate")
        receipt_hash = hashlib.sha256(receipt_bytes).hexdigest()

    blockers: list[str] = []
    warnings: list[str] = []
    canvas = parse_canvas(work_order.get("targetCanvas"))
    if (candidate_features["width"], candidate_features["height"]) != canvas:
        blockers.append("target-canvas-mismatch")
    runtime_format = str(work_order.get("runtimeFormat") or "").lower().lstrip(".")
    suffix = candidate.suffix.lower().lstrip(".")
    if runtime_format in {"png", "webp"} and suffix != runtime_format:
        blockers.append("runtime-format-mismatch")
    if suffix not in {"png", "webp"}:
        blockers.append("unsupported-runtime-format")
    alpha_policy = str(work_order.get("alphaPolicy") or "").lower()
    alpha = candidate_features["alpha"]
    if "meaningful-alpha-required" in alpha_policy and not alpha["meaningfulAlpha"]:
        blockers.append("meaningful-alpha-required")
    if "opaque" in alpha_policy and not alpha["fullyOpaque"]:
        blockers.append("opaque-alpha-required")
    if alpha["fullyTransparent"] or candidate_features["activeRatio"] < 0.001:
        blockers.append("blank-or-fully-transparent-candidate")
    if candidate_size < int(contract["limits"]["minimumCandidateBytes"]):
        blockers.append("candidate-byte-length-too-small")
    if work_order.get("decision") in {"edit", "recreate", "generate-variation"} and candidate_sha == source_sha:
        blockers.append("candidate-bytes-identical-to-source")

    role = str(work_order.get("semanticRole") or "").strip()
    profile = (bank.get("roleProfiles") or {}).get(role)
    threshold = float(args.style_distance_threshold if args.style_distance_threshold is not None else contract["limits"]["defaultStyleDistanceThreshold"])
    if threshold <= 0 or threshold > float(contract["limits"]["maximumStyleDistanceThreshold"]):
        fail("style-distance threshold is outside the governed range")
    distance: dict[str, Any] | None = None
    if not isinstance(profile, dict):
        if args.allow_missing_style_profile:
            warnings.append("missing-role-style-profile")
        else:
            blockers.append("missing-role-style-profile")
    else:
        distance = style_distance(candidate_features, profile)
        if float(distance["score"]) > threshold:
            blockers.append("candidate-outside-approved-style-profile")
        nearest = distance.get("nearestReferenceDhashDistance")
        if nearest == 0 and candidate_sha not in {reference.get("sourceSha256") for reference in bank.get("references", [])}:
            warnings.append("candidate-perceptually-identical-to-style-reference")

    source_dhash_distance = hamming_hex(source_features["dhash"], candidate_features["dhash"])
    if source_dhash_distance == 0 and candidate_sha != source_sha and work_order.get("decision") in {"recreate", "generate-variation"}:
        warnings.append("candidate-perceptually-identical-to-source")
    edge_contact = candidate_features["edgeContact"]
    if role in {"standing-character", "crew-portrait", "ship-profile", "ui-icon"}:
        if edge_contact["left"] or edge_contact["right"] or edge_contact["top"]:
            warnings.append("subject-touches-nonbaseline-canvas-edge")

    preserved = work_order.get("preserve") or []
    remove_or_fix = work_order.get("removeOrFix") or []
    negative = work_order.get("negativeConstraints") or []
    if not isinstance(preserved, list) or not isinstance(remove_or_fix, list) or not isinstance(negative, list):
        fail("work-order semantic comparison requirements are invalid")
    status = "passed" if not blockers else "blocked"
    evaluation: dict[str, Any] = {
        "schema": EVALUATION_SCHEMA,
        "contract": CONTRACT_ID,
        "status": status,
        "sourcePath": str(work_order["sourcePath"]),
        "sourceSha256": source_sha,
        "sourceSizeBytes": source_size,
        "candidatePath": Path(args.candidate).as_posix(),
        "candidateSha256": candidate_sha,
        "candidateSizeBytes": candidate_size,
        "semanticRole": role,
        "workOrderSha256": hashlib.sha256(work_order_bytes).hexdigest(),
        "styleBankSha256": hashlib.sha256(bank_bytes).hexdigest(),
        "processingReceiptSha256": receipt_hash,
        "targetCanvas": list(canvas),
        "alphaPolicy": work_order.get("alphaPolicy"),
        "runtimeFormat": suffix,
        "styleDistanceThreshold": threshold,
        "styleDistance": distance,
        "sourceDhashDistance": source_dhash_distance,
        "sourceFeatures": source_features,
        "candidateFeatures": candidate_features,
        "blockers": sorted(set(blockers)),
        "warnings": sorted(set(warnings)),
        "semanticReviewRequired": {
            "preserveApprovedTraits": preserved,
            "removeOrFixDefects": remove_or_fix,
            "negativeConstraints": negative,
            "historicalAndCulturalReview": True,
            "creativeApproval": False,
        },
        "runtimeApproval": False,
        "publicationAuthority": False,
        "effects": contract["effects"],
    }
    evaluation["evaluationSha256"] = sha256_json(evaluation)
    return evaluation


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--candidate-root", type=Path, required=True)
    parser.add_argument("--candidate", required=True, help="candidate path relative to --candidate-root")
    parser.add_argument("--work-order", type=Path, required=True)
    parser.add_argument("--style-bank", type=Path, required=True)
    parser.add_argument("--processing-receipt", type=Path)
    parser.add_argument("--style-distance-threshold", type=float)
    parser.add_argument("--allow-missing-style-profile", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        evaluation = evaluate(args)
        atomic_write(args.output.resolve(), evaluation)
    except (OSError, UnicodeError, ValueError, TypeError, KeyError, json.JSONDecodeError, RuntimeError) as error:
        print(f"candidate evaluation failed: {error}", file=sys.stderr)
        return 2
    print(json.dumps({
        "status": evaluation["status"],
        "candidateSha256": evaluation["candidateSha256"],
        "blockers": evaluation["blockers"],
        "output": str(args.output.resolve()),
        "evaluationSha256": evaluation["evaluationSha256"],
    }, sort_keys=True))
    return 0 if evaluation["status"] == "passed" else 3


if __name__ == "__main__":
    raise SystemExit(main())
