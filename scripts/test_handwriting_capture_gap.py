from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "handwriting_capture_gap.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("handwriting_capture_gap", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class HandwritingCaptureGapTests(unittest.TestCase):
    def test_reports_missing_variant_counts_for_glyphs_and_whole_marks(self):
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            spec = {
                "schema": module.SPEC_SCHEMA,
                "profileId": "test",
                "slots": [
                    {"id": "a-1", "kind": "glyph", "token": "a"},
                    {"id": "a-2", "kind": "glyph", "token": "a"},
                    {"id": "sig-1", "kind": "signature", "token": "SIGNATURE"},
                    {"id": "sig-2", "kind": "signature", "token": "SIGNATURE"},
                ],
            }
            atlas = {
                "schema": module.ATLAS_SCHEMA,
                "atlasId": "atlas",
                "glyphs": {"a": [{"sha256": "a" * 64}]},
                "wholeMarks": {"signature": [{"sha256": "b" * 64}]},
            }
            spec_path = root / "spec.json"
            atlas_path = root / "atlas.json"
            spec_path.write_text(json.dumps(spec), encoding="utf-8")
            atlas_path.write_text(json.dumps(atlas), encoding="utf-8")
            report = module.compare(spec_path, atlas_path)
            self.assertEqual(report["missingRequirementCount"], 2)
            self.assertEqual(report["missingVariantCount"], 2)
            by_kind = {(item["kind"], item["token"]): item for item in report["missing"]}
            self.assertEqual(by_kind[("glyph", "a")]["missingVariants"], 1)
            self.assertEqual(by_kind[("signature", "SIGNATURE")]["missingVariants"], 1)
            self.assertFalse(report["truthBoundary"]["signatureSynthesizedFromGlyphs"])

    def test_complete_requirement_is_not_reported_missing(self):
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            spec = {"schema": module.SPEC_SCHEMA, "profileId": "test", "slots": [{"id": "x-1", "kind": "glyph", "token": "x"}]}
            atlas = {"schema": module.ATLAS_SCHEMA, "atlasId": "atlas", "glyphs": {"x": [{"sha256": "a" * 64}]}, "wholeMarks": {}}
            (root / "spec.json").write_text(json.dumps(spec), encoding="utf-8")
            (root / "atlas.json").write_text(json.dumps(atlas), encoding="utf-8")
            report = module.compare(root / "spec.json", root / "atlas.json")
            self.assertEqual(report["missingRequirementCount"], 0)
            self.assertEqual(report["completeRequirementCount"], 1)


if __name__ == "__main__":
    unittest.main()
