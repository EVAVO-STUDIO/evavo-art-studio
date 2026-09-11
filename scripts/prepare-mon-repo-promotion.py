from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare a governed MÔN repository promotion manifest for a reviewed image candidate")
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--family-id", required=True)
    parser.add_argument("--candidate-id", required=True)
    parser.add_argument("--target-repo", required=True)
    parser.add_argument("--target-path", required=True)
    parser.add_argument("--commit-message", required=True)
    parser.add_argument("--review-receipt", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    candidate = args.candidate.resolve()
    if not candidate.is_file():
        raise SystemExit(f"candidate not found: {candidate}")

    review = None
    if args.review_receipt:
        review_path = args.review_receipt.resolve()
        if not review_path.is_file():
            raise SystemExit(f"review receipt not found: {review_path}")
        review = json.loads(review_path.read_text(encoding="utf-8"))
        if review.get("sha256") and review["sha256"] != sha256_file(candidate):
            raise SystemExit("review receipt does not match exact candidate bytes")

    manifest = {
        "schema_version": 1,
        "id": f"{args.candidate_id}_promotion",
        "candidate_id": args.candidate_id,
        "asset_id": args.asset_id,
        "family_id": args.family_id,
        "candidate_path": str(candidate),
        "candidate_sha256": sha256_file(candidate),
        "review_receipt": str(args.review_receipt.resolve()) if args.review_receipt else None,
        "review_passed": bool(review.get("technical_pass", False)) if isinstance(review, dict) else False,
        "target": {
            "repo": args.target_repo,
            "path": args.target_path.replace("\\", "/"),
            "branch": "main",
            "commit_message": args.commit_message,
        },
        "promotion_rules": {
            "exact_hash_only": True,
            "overwrite_existing_requires_explicit_review": True,
            "commit_direct_to_main_when_authorized": True,
            "github_actions_required": False,
            "hosted_ci_required": False,
            "runtime_authority_after_consumer_validation_only": True,
        },
    }
    out = args.output.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "manifest": str(out), "candidate_sha256": manifest["candidate_sha256"], "target": manifest["target"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
