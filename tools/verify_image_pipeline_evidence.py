#!/usr/bin/env python3
"""Verify exact image work-order, processing, style and candidate evidence."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

from image_style_features import feature_vector, load_image, resolve_inside, sha256_file
from verify_image_style_reference_bank import verify as verify_style_bank

WORK_ORDER_SCHEMA = "evavo.image-reference-work-order.v1"
BANK_SCHEMA = "evavo.image-style-reference-bank.v1"
RECEIPT_SCHEMA = "evavo.image-processing-receipt.v1"
EVALUATION_SCHEMA = "evavo.image-candidate-evaluation.v1"
CONTRACT_ID = "evavo.executable-image-pipeline.v1"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
EXPECTED_EFFECTS = {
    "providerExecution": False,
    "sourceOverwrite": False,
    "sourceDeletion": False,
    "targetRepositoryMutation": False,
    "publication": False,
}


def fail(message: str) -> None:
    raise ValueError(message)


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def read_document(path: Path) -> tuple[dict[str, Any], bytes]:
    if path.is_symlink() or not path.is_file():
        fail(f"not a regular JSON file: {path}")
    raw = path.read_bytes()
    value = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(value, dict):
        fail(f"JSON document is not an object: {path}")
    return value, raw


def valid_hash(value: Any) -> bool:
    return isinstance(value, str) and HEX64.fullmatch(value) is not None


def verify_self_hash(value: dict[str, Any], key: str) -> None:
    stored = value.get(key)
    if not valid_hash(stored):
        fail(f"invalid {key}")
    unhashed = dict(value)
    unhashed.pop(key, None)
    if stored != sha256_json(unhashed):
        fail(f"{key} mismatch")


def verify(args: argparse.Namespace) -> dict[str, Any]:
    repo = args.repo.resolve()
    source_root = args.source_root.resolve()
    candidate_root = args.candidate_root.resolve()
    work_order, work_order_bytes = read_document(args.work_order.resolve())
    bank, bank_bytes = read_document(args.style_bank.resolve())
    receipt, receipt_bytes = read_document(args.processing_receipt.resolve())
    evaluation, evaluation_bytes = read_document(args.evaluation.resolve())
    contract, _ = read_document(repo / "config" / "executable-image-pipeline.v1.json")
    if contract.get("contract") != CONTRACT_ID:
        fail("unexpected executable image pipeline contract")
    if work_order.get("schema") != WORK_ORDER_SCHEMA:
        fail("unexpected work-order schema")
    if bank.get("schema") != BANK_SCHEMA:
        fail("unexpected style-bank schema")
    if receipt.get("schema") != RECEIPT_SCHEMA or receipt.get("contract") != CONTRACT_ID:
        fail("unexpected processing-receipt schema")
    if evaluation.get("schema") != EVALUATION_SCHEMA or evaluation.get("contract") != CONTRACT_ID:
        fail("unexpected candidate-evaluation schema")
    verify_style_bank(repo, args.style_bank.resolve(), source_root, args.verify_source_bytes)
    verify_self_hash(receipt, "receiptSha256")
    verify_self_hash(evaluation, "evaluationSha256")

    work_order_file_sha = hashlib.sha256(work_order_bytes).hexdigest()
    bank_file_sha = hashlib.sha256(bank_bytes).hexdigest()
    receipt_file_sha = hashlib.sha256(receipt_bytes).hexdigest()
    source_path = str(work_order.get("sourcePath") or "")
    source_sha = str(work_order.get("sourceSha256") or "").lower()
    candidate_path = str(receipt.get("candidatePath") or "")
    candidate_sha = str(receipt.get("candidateSha256") or "").lower()
    if not source_path or not valid_hash(source_sha) or not candidate_path or not valid_hash(candidate_sha):
        fail("work-order or receipt identity is incomplete")
    if receipt.get("status") != "passed":
        fail("processing receipt is not passed")
    if receipt.get("workOrderSha256") != work_order_file_sha:
        fail("processing receipt is not bound to the exact work order")
    if receipt.get("sourcePath") != source_path or receipt.get("sourceSha256") != source_sha:
        fail("processing receipt source identity drift")
    if receipt.get("effects") != EXPECTED_EFFECTS:
        fail("processing receipt effect boundary changed")

    if evaluation.get("workOrderSha256") != work_order_file_sha:
        fail("candidate evaluation is not bound to the exact work order")
    if evaluation.get("styleBankSha256") != bank_file_sha:
        fail("candidate evaluation is not bound to the exact style-bank file")
    if evaluation.get("processingReceiptSha256") != receipt_file_sha:
        fail("candidate evaluation is not bound to the exact processing receipt")
    if evaluation.get("sourcePath") != source_path or evaluation.get("sourceSha256") != source_sha:
        fail("candidate evaluation source identity drift")
    if evaluation.get("candidatePath") != candidate_path or evaluation.get("candidateSha256") != candidate_sha:
        fail("candidate evaluation candidate identity drift")
    if evaluation.get("effects") != EXPECTED_EFFECTS:
        fail("candidate evaluation effect boundary changed")
    blockers = evaluation.get("blockers")
    if not isinstance(blockers, list):
        fail("candidate evaluation blockers are invalid")
    if not args.allow_blocked and (evaluation.get("status") != "passed" or blockers):
        fail("candidate evaluation is not admissible")
    if args.allow_blocked and evaluation.get("status") not in {"passed", "blocked"}:
        fail("candidate evaluation status is invalid")
    if evaluation.get("publicationAuthority") is not False or evaluation.get("runtimeApproval") is not False:
        fail("candidate evaluation claimed downstream authority")

    source = resolve_inside(source_root, source_path)
    candidate = resolve_inside(candidate_root, candidate_path)
    actual_source_sha, actual_source_size = sha256_file(source, int(contract["limits"]["maximumSourceBytes"]))
    actual_candidate_sha, actual_candidate_size = sha256_file(candidate, int(contract["limits"]["maximumSourceBytes"]))
    if actual_source_sha != source_sha or actual_source_size != receipt.get("sourceSizeBytes"):
        fail("source bytes differ from processing evidence")
    if actual_candidate_sha != candidate_sha or actual_candidate_size != receipt.get("candidateSizeBytes"):
        fail("candidate bytes differ from processing evidence")
    if actual_candidate_size != evaluation.get("candidateSizeBytes"):
        fail("candidate byte length differs from evaluation evidence")

    if args.verify_pixels:
        source_features = feature_vector(load_image(source, int(contract["limits"]["maximumDecodedPixels"])))
        candidate_features = feature_vector(load_image(candidate, int(contract["limits"]["maximumDecodedPixels"])))
        if canonical_json(receipt.get("beforeFeatures")) != canonical_json(source_features):
            fail("processing beforeFeatures do not match current source pixels")
        if canonical_json(receipt.get("afterFeatures")) != canonical_json(candidate_features):
            fail("processing afterFeatures do not match current candidate pixels")
        if canonical_json(evaluation.get("sourceFeatures")) != canonical_json(source_features):
            fail("evaluation sourceFeatures do not match current source pixels")
        if canonical_json(evaluation.get("candidateFeatures")) != canonical_json(candidate_features):
            fail("evaluation candidateFeatures do not match current candidate pixels")

    return {
        "status": "passed",
        "sourceSha256": source_sha,
        "candidateSha256": candidate_sha,
        "workOrderFileSha256": work_order_file_sha,
        "styleBankFileSha256": bank_file_sha,
        "processingReceiptFileSha256": receipt_file_sha,
        "candidateEvaluationFileSha256": hashlib.sha256(evaluation_bytes).hexdigest(),
        "evaluationStatus": evaluation["status"],
        "verifiedSourceBytes": args.verify_source_bytes,
        "verifiedPixels": args.verify_pixels,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--candidate-root", type=Path, required=True)
    parser.add_argument("--work-order", type=Path, required=True)
    parser.add_argument("--style-bank", type=Path, required=True)
    parser.add_argument("--processing-receipt", type=Path, required=True)
    parser.add_argument("--evaluation", type=Path, required=True)
    parser.add_argument("--verify-source-bytes", action="store_true")
    parser.add_argument("--verify-pixels", action="store_true")
    parser.add_argument("--allow-blocked", action="store_true")
    args = parser.parse_args()
    try:
        result = verify(args)
    except (OSError, UnicodeError, ValueError, TypeError, KeyError, json.JSONDecodeError, RuntimeError) as error:
        print(f"image pipeline evidence verification failed: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
