from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "handwriting_capture_register.py"

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


def _load_module():
    spec = importlib.util.spec_from_file_location("handwriting_capture_register", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _sheet(module):
    return {
        "schema": module.SHEET_SCHEMA,
        "pageSizeMm": [210.0, 297.0],
        "pageCount": 1,
        "geometry": [
            {"slotId": "lowercase-a-v1", "token": "a", "variant": 1, "kind": "glyph", "style": "natural-lowercase", "page": 1, "recommendedInkKeepMm": [21.0, 29.7, 42.0, 59.4]},
            {"slotId": "digits-1-v1", "token": "1", "variant": 1, "kind": "glyph", "style": "natural-numeric", "page": 1, "recommendedInkKeepMm": [63.0, 29.7, 84.0, 59.4]},
        ],
    }


def _corners():
    return {"topLeft": [0, 0], "topRight": [1000, 0], "bottomRight": [1000, 1400], "bottomLeft": [0, 1400]}


@unittest.skipUnless(PIL_AVAILABLE, "Pillow is optional")
class HandwritingCaptureRegisterTests(unittest.TestCase):
    def test_maps_manual_a4_geometry_to_document_layout(self):
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            photo = root / "page.png"
            Image.new("RGB", (1000, 1400), "white").save(photo)
            registration = {"schema": module.REGISTRATION_SCHEMA, "page": 1, "cornersPx": _corners()}
            sheet_path = root / "sheet.json"
            reg_path = root / "registration.json"
            output = root / "layout.json"
            sheet_path.write_text(json.dumps(_sheet(module)), encoding="utf-8")
            reg_path.write_text(json.dumps(registration), encoding="utf-8")
            report = module.register(sheet_path, reg_path, photo, output)
            layout = json.loads(output.read_text(encoding="utf-8"))
            self.assertTrue(report["ok"])
            self.assertFalse(report["autoDetected"])
            self.assertTrue(report["manualReviewCompleted"])
            self.assertEqual(layout["schema"], module.DOCUMENT_LAYOUT_SCHEMA)
            self.assertEqual(layout["sourcePixelSize"], [1000, 1400])
            self.assertEqual(len(layout["rows"]), 2)
            self.assertEqual(layout["rows"][0]["kind"], "mark")
            self.assertEqual(layout["rows"][0]["items"][0]["glyph"], "a")
            self.assertEqual(layout["rows"][1]["kind"], "date-glyph")
            rect = layout["rows"][0]["items"][0]["inkRect"]
            self.assertTrue(98 <= rect[0] <= 102)
            self.assertTrue(138 <= rect[1] <= 142)
            self.assertTrue(198 <= rect[2] <= 202)
            self.assertTrue(278 <= rect[3] <= 282)
            self.assertFalse(report["handwritingBytesReturned"])

    def test_rejects_unreviewed_auto_detected_registration(self):
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            photo = root / "page.png"
            Image.new("RGB", (1000, 1400), "white").save(photo)
            sheet_path = root / "sheet.json"
            reg_path = root / "proposal.json"
            sheet_path.write_text(json.dumps(_sheet(module)), encoding="utf-8")
            reg_path.write_text(json.dumps({
                "schema": module.REGISTRATION_SCHEMA,
                "page": 1,
                "cornersPx": _corners(),
                "detectionEvidence": {
                    "method": "solid-square-fiducials-v1",
                    "fiducialCentersPx": _corners(),
                    "downsampleScale": 1.0,
                    "manualReviewRequired": True,
                },
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "requires explicit review evidence"):
                module.register(sheet_path, reg_path, photo, root / "layout.json")

    def test_accepts_reviewed_auto_detected_registration(self):
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            photo = root / "page.png"
            Image.new("RGB", (1000, 1400), "white").save(photo)
            sheet_path = root / "sheet.json"
            reg_path = root / "reviewed.json"
            output = root / "layout.json"
            sheet_path.write_text(json.dumps(_sheet(module)), encoding="utf-8")
            reg_path.write_text(json.dumps({
                "schema": module.REGISTRATION_SCHEMA,
                "page": 1,
                "cornersPx": _corners(),
                "detectionEvidence": {
                    "method": "solid-square-fiducials-v1",
                    "fiducialCentersPx": _corners(),
                    "downsampleScale": 1.0,
                    "manualReviewRequired": True,
                },
                "reviewEvidence": {
                    "proposalSha256": "1" * 64,
                    "decision": "accept",
                    "cornersChanged": False,
                    "manualReviewCompleted": True,
                },
            }), encoding="utf-8")
            report = module.register(sheet_path, reg_path, photo, output)
            self.assertTrue(report["autoDetected"])
            self.assertTrue(report["manualReviewCompleted"])
            layout = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(layout["registrationEvidence"]["proposalSha256"], "1" * 64)

    def test_rejects_registration_corner_outside_photo(self):
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            photo = root / "page.png"
            Image.new("RGB", (100, 100), "white").save(photo)
            sheet_path = root / "sheet.json"
            reg_path = root / "registration.json"
            sheet_path.write_text(json.dumps({"schema": module.SHEET_SCHEMA, "pageSizeMm": [210, 297], "pageCount": 1, "geometry": [{"slotId": "a", "token": "a", "kind": "glyph", "page": 1, "recommendedInkKeepMm": [20, 20, 40, 40]}]}), encoding="utf-8")
            reg_path.write_text(json.dumps({"schema": module.REGISTRATION_SCHEMA, "page": 1, "cornersPx": {"topLeft": [0, 0], "topRight": [120, 0], "bottomRight": [100, 100], "bottomLeft": [0, 100]}}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "outside source image"):
                module.register(sheet_path, reg_path, photo, root / "layout.json")


if __name__ == "__main__":
    unittest.main()
