from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

REGISTRATION_SCHEMA = "evavo.art-studio.handwriting-photo-registration.v1"
REVIEW_SCHEMA = "evavo.art-studio.handwriting-registration-review.v1"


def _load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _corners(value, *, label: str) -> dict[str, list[float]]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    result: dict[str, list[float]] = {}
    for key in ("topLeft", "topRight", "bottomRight", "bottomLeft"):
        point = value.get(key)
        if not isinstance(point, list) or len(point) != 2:
            raise ValueError(f"{label}.{key} must contain x,y")
        x, y = float(point[0]), float(point[1])
        if x < 0 or y < 0:
            raise ValueError(f"{label}.{key} must be non-negative")
        result[key] = [round(x, 3), round(y, 3)]
    return result


def bind_review(proposal_path: Path, review_path: Path, output: Path) -> dict:
    if output.exists():
        raise ValueError(f"create-only reviewed registration output already exists: {output}")
    proposal = _load(proposal_path)
    review = _load(review_path)
    if proposal.get("schema") != REGISTRATION_SCHEMA:
        raise ValueError("input proposal is not a handwriting photo registration")
    detection = proposal.get("detectionEvidence")
    if not isinstance(detection, dict) or detection.get("manualReviewRequired") is not True:
        raise ValueError("registration proposal is not a review-required auto-detection result")
    if review.get("schema") != REVIEW_SCHEMA:
        raise ValueError("invalid handwriting registration review schema")
    actual_proposal_sha = _sha_file(proposal_path)
    if str(review.get("proposalSha256") or "").casefold() != actual_proposal_sha:
        raise ValueError("registration review proposalSha256 does not match selected proposal")
    if review.get("decision") != "accept":
        raise ValueError("registration review decision must be accept")
    reviewed_corners = _corners(review.get("reviewedCornersPx"), label="reviewedCornersPx")
    proposed_corners = _corners(proposal.get("cornersPx"), label="proposal.cornersPx")
    corners_changed = reviewed_corners != proposed_corners
    reviewed = dict(proposal)
    reviewed["cornersPx"] = reviewed_corners
    reviewed["reviewEvidence"] = {
        "proposalSha256": actual_proposal_sha,
        "decision": "accept",
        "cornersChanged": corners_changed,
        "manualReviewCompleted": True,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(reviewed, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {
        "ok": True,
        "schema": REGISTRATION_SCHEMA,
        "proposalSha256": actual_proposal_sha,
        "reviewedRegistrationSha256": _sha_file(output),
        "cornersChanged": corners_changed,
        "manualReviewCompleted": True,
        "privatePathsReturned": False,
        "handwritingBytesReturned": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bind an explicit review artifact to an auto-detected handwriting registration proposal")
    parser.add_argument("proposal")
    parser.add_argument("review")
    parser.add_argument("output")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(bind_review(Path(args.proposal), Path(args.review), Path(args.output)), sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
