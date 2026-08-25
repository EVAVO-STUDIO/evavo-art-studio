from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "handwriting_document_bridge.py"
spec = importlib.util.spec_from_file_location("handwriting_document_bridge", TOOL)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class HandwritingDocumentBridgeTests(unittest.TestCase):
    def _atlas(self, root: Path, *, complete_digits: bool = True) -> Path:
        fake_sha = "a" * 64
        glyphs = {
            "A": [{"file": "A.png", "sha256": fake_sha, "naturalAdvancePx": 24.5, "style": "uppercase", "inkBox": [2, 2, 20, 30], "sideBearingPx": {"left": 2, "right": 3, "top": 2, "bottom": 2}}],
        }
        for number in range(10 if complete_digits else 9):
            glyphs[str(number)] = [{"file": f"{number}.png", "sha256": fake_sha, "naturalAdvancePx": 18.0, "style": "numeric"}]
        glyphs["/"] = [{"file": "slash.png", "sha256": fake_sha, "naturalAdvancePx": 10.0, "style": "numeric"}]
        atlas = {
            "schema": module.ATLAS_SCHEMA,
            "atlasId": "fixture",
            "assetRoot": str(root / "private-assets"),
            "glyphs": glyphs,
            "wholeMarks": {
                "name": [{"file": "name.png", "sha256": "b" * 64, "naturalAdvancePx": 90.0, "style": "natural"}],
                "signature": [{"file": "signature.png", "sha256": "c" * 64, "naturalAdvancePx": 120.0, "style": "natural"}],
            },
            "rendering": {"trackingPx": 1.5, "rotationDegrees": 0.45},
        }
        path = root / "atlas.json"
        path.write_text(json.dumps(atlas), encoding="utf-8")
        return path

    def test_export_preserves_hashes_metrics_and_whole_marks_without_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = self._atlas(root)
            output = root / "seed.json"
            result = module.export_seed(atlas, output)
            self.assertTrue(result["ok"])
            seed = json.loads(output.read_text())
            self.assertEqual(seed["marks"]["signature"][0]["sha256"], "c" * 64)
            self.assertEqual(seed["marks"]["name"][0]["sha256"], "b" * 64)
            self.assertEqual(seed["textGlyphs"]["A"][0]["advancePx"], 24.5)
            self.assertEqual(seed["dateGlyphs"]["/"][0]["advancePx"], 10.0)
            self.assertFalse(seed["truthBoundary"]["imageBytesCopied"])
            self.assertFalse(seed["truthBoundary"]["signatureSynthesizedFromGlyphs"])
            self.assertTrue(seed["truthBoundary"]["requiresDocumentStudioApprovalForPdfExecution"])
            self.assertFalse(result["privatePathsReturned"])

    def test_export_requires_all_genuine_date_digits(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = self._atlas(root, complete_digits=False)
            with self.assertRaisesRegex(ValueError, "missing genuine date digit"):
                module.export_seed(atlas, root / "seed.json")


if __name__ == "__main__":
    unittest.main()
