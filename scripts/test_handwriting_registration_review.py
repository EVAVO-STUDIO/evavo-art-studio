from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from tools.handwriting_registration_review import bind_review


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class HandwritingRegistrationReviewTests(unittest.TestCase):
    def _proposal(self, root: Path) -> Path:
        path = root / "proposal.json"
        path.write_text(json.dumps({
            "schema": "evavo.art-studio.handwriting-photo-registration.v1",
            "page": 1,
            "cornersPx": {
                "topLeft": [10, 10], "topRight": [990, 12], "bottomRight": [988, 1390], "bottomLeft": [12, 1388]
            },
            "cropMarginPx": 36,
            "keepMarginPx": 6,
            "detectionEvidence": {
                "method": "solid-square-fiducials-v1",
                "fiducialCentersPx": {
                    "topLeft": [70, 65], "topRight": [930, 66], "bottomRight": [930, 1335], "bottomLeft": [70, 1334]
                },
                "downsampleScale": 1.0,
                "manualReviewRequired": True
            }
        }), encoding="utf-8")
        return path

    def test_binds_review_to_exact_proposal_and_review_sha(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            proposal = self._proposal(root)
            review = root / "review.json"
            output = root / "reviewed.json"
            review.write_text(json.dumps({
                "schema": "evavo.art-studio.handwriting-registration-review.v1",
                "proposalSha256": _sha(proposal),
                "decision": "accept",
                "reviewedCornersPx": {
                    "topLeft": [11, 10], "topRight": [990, 12], "bottomRight": [988, 1390], "bottomLeft": [12, 1388]
                }
            }), encoding="utf-8")
            review_sha = _sha(review)
            report = bind_review(proposal, review, output)
            result = json.loads(output.read_text(encoding="utf-8"))
            self.assertTrue(report["ok"])
            self.assertTrue(report["cornersChanged"])
            self.assertTrue(result["reviewEvidence"]["manualReviewCompleted"])
            self.assertEqual(result["reviewEvidence"]["proposalSha256"], _sha(proposal))
            self.assertEqual(result["reviewEvidence"]["reviewArtifactSha256"], review_sha)
            self.assertEqual(report["reviewArtifactSha256"], review_sha)

    def test_rejects_review_bound_to_different_proposal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            proposal = self._proposal(root)
            review = root / "review.json"
            review.write_text(json.dumps({
                "schema": "evavo.art-studio.handwriting-registration-review.v1",
                "proposalSha256": "0" * 64,
                "decision": "accept",
                "reviewedCornersPx": {
                    "topLeft": [10, 10], "topRight": [990, 12], "bottomRight": [988, 1390], "bottomLeft": [12, 1388]
                }
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "proposalSha256"):
                bind_review(proposal, review, root / "reviewed.json")

    def test_rejects_review_with_unknown_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            proposal = self._proposal(root)
            review = root / "review.json"
            review.write_text(json.dumps({
                "schema": "evavo.art-studio.handwriting-registration-review.v1",
                "proposalSha256": _sha(proposal),
                "decision": "accept",
                "reviewedCornersPx": {
                    "topLeft": [10, 10], "topRight": [990, 12], "bottomRight": [988, 1390], "bottomLeft": [12, 1388]
                },
                "extra": True,
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unsupported field"):
                bind_review(proposal, review, root / "reviewed.json")

    def test_rejects_non_detected_registration_as_proposal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            proposal = root / "manual.json"
            proposal.write_text(json.dumps({"schema": "evavo.art-studio.handwriting-photo-registration.v1", "page": 1, "cornersPx": {}}), encoding="utf-8")
            review = root / "review.json"
            review.write_text(json.dumps({"schema": "evavo.art-studio.handwriting-registration-review.v1", "proposalSha256": _sha(proposal), "decision": "accept", "reviewedCornersPx": {}}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "review-required auto-detection"):
                bind_review(proposal, review, root / "reviewed.json")


if __name__ == "__main__":
    unittest.main()
