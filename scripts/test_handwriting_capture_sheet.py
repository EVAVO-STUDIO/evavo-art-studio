from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "handwriting_capture_sheet.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("handwriting_capture_sheet", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class HandwritingCaptureSheetTests(unittest.TestCase):
    def test_renders_svg_pages_and_geometry_without_handwriting_bytes(self):
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            spec = {
                "schema": module.SPEC_SCHEMA,
                "profileId": "test",
                "slots": [
                    {"id": f"slot-{index}", "token": chr(97 + (index % 26)), "variant": 1, "kind": "glyph", "style": "natural"}
                    for index in range(17)
                ],
            }
            spec_path = root / "spec.json"
            spec_path.write_text(json.dumps(spec), encoding="utf-8")
            output = root / "sheets"
            report = module.render(spec_path, output)
            manifest = json.loads((output / "capture-sheet-manifest.json").read_text(encoding="utf-8"))
            self.assertTrue(report["ok"])
            self.assertEqual(report["pageCount"], 2)
            self.assertEqual(manifest["slotCount"], 17)
            self.assertEqual(len(manifest["geometry"]), 17)
            self.assertFalse(manifest["truthBoundary"]["containsGeneratedHandwriting"])
            self.assertFalse(manifest["truthBoundary"]["containsSignatureImage"])
            self.assertTrue(all((output / page).is_file() for page in manifest["pages"]))
            svg = (output / manifest["pages"][0]).read_text(encoding="utf-8")
            self.assertIn("EVAVO Genuine Handwriting Capture", svg)
            self.assertIn("<rect", svg)

    def test_rejects_nonempty_output_directory(self):
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            spec_path = root / "spec.json"
            spec_path.write_text(json.dumps({"schema": module.SPEC_SCHEMA, "profileId": "test", "slots": []}), encoding="utf-8")
            output = root / "sheets"
            output.mkdir()
            (output / "existing.txt").write_text("x", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "not empty"):
                module.render(spec_path, output)


if __name__ == "__main__":
    unittest.main()
