from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TOOL_PATH = ROOT / "tools" / "region_aware_alpha_interpolate_admission.py"
spec = importlib.util.spec_from_file_location("region_admission_tool", TOOL_PATH)
region_admission = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = region_admission
spec.loader.exec_module(region_admission)


def make_subject(size=(160, 220), *, head_dx=0, torso_dx=0, lower_dx=0):
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((58 + head_dx, 12, 102 + head_dx, 56), fill=(235, 180, 150, 255))
    draw.rounded_rectangle((48 + torso_dx, 58, 112 + torso_dx, 150), radius=18, fill=(80, 120, 220, 255))
    draw.rounded_rectangle((55 + lower_dx, 145, 105 + lower_dx, 205), radius=13, fill=(50, 70, 130, 255))
    return image


class RegionAwareAdmissionTests(unittest.TestCase):
    def test_dependency_pins_match_reviewed_tools(self):
        region_admission._verify_dependency_bytes()
        self.assertEqual(
            region_admission.REGION_TOOL_BLOB_SHA1,
            "5ad3e97d4e653a11418603f3f7b40fc7644689b6",
        )
        self.assertEqual(
            region_admission.BASE_TOOL_BLOB_SHA1,
            "e5e4a2d24d2b82d31356c0a8adbf1d4a3f64deb4",
        )

    def test_receipt_preserves_v1_admission_surface_and_adds_regional_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before_path = root / "before.png"
            after_path = root / "after.png"
            output_path = root / "out.png"
            receipt_path = root / "receipt.json"
            make_subject().save(before_path, format="PNG")
            make_subject(head_dx=7, torso_dx=3, lower_dx=-2).save(after_path, format="PNG")
            tool_blob = region_admission.base._git_blob_sha1(TOOL_PATH.read_bytes())
            receipt = region_admission.run([
                "--source-before", str(before_path),
                "--source-after", str(after_path),
                "--output", str(output_path),
                "--receipt", str(receipt_path),
                "--frame-id", "eva-region-admission-test-001",
                "--amount", "0.5",
                "--producer-commit", "1" * 40,
                "--producer-tool-blob-sha1", tool_blob,
                "--expected-width", "160",
                "--expected-height", "220",
                "--horizontal-radius", "16",
                "--vertical-radius", "12",
                "--minimum-score", "0.15",
                "--minimum-improvement", "0.001",
            ])
            parsed = json.loads(receipt_path.read_text("utf-8"))
            self.assertEqual(receipt["schema"], "evavo.motion-aware-alpha-interpolation-receipt.v1")
            self.assertEqual(parsed["producer"]["tool"], "tools/region_aware_alpha_interpolate_admission.py")
            self.assertEqual(parsed["producer"]["version"], "2.1.0")
            self.assertIn(parsed["registration"]["method"], {
                "region-aware-alpha-registration",
                "alpha-silhouette-bounded-translation-registration",
            })
            self.assertTrue(parsed["registration"]["regional"]["attempted"])
            self.assertEqual(parsed["registration"]["regional"]["bandCount"], 4)
            self.assertIn(parsed["interpolation"]["method"], {
                "registered-premultiplied-alpha-linear-interpolation",
                "premultiplied-alpha-linear-interpolation",
            })
            self.assertFalse(parsed["constraints"]["network"])
            self.assertFalse(parsed["constraints"]["modelInference"])
            self.assertFalse(parsed["constraints"]["creativeGeneration"])
            self.assertFalse(parsed["constraints"]["creativeApproval"])
            self.assertFalse(parsed["constraints"]["runtimeActivation"])
            self.assertTrue(output_path.exists())

    def test_create_only_pair_rejects_reexecution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before_path = root / "before.png"
            after_path = root / "after.png"
            output_path = root / "out.png"
            receipt_path = root / "receipt.json"
            make_subject().save(before_path, format="PNG")
            make_subject(head_dx=4, torso_dx=2).save(after_path, format="PNG")
            tool_blob = region_admission.base._git_blob_sha1(TOOL_PATH.read_bytes())
            args = [
                "--source-before", str(before_path),
                "--source-after", str(after_path),
                "--output", str(output_path),
                "--receipt", str(receipt_path),
                "--frame-id", "eva-region-admission-test-002",
                "--amount", "0.5",
                "--producer-commit", "2" * 40,
                "--producer-tool-blob-sha1", tool_blob,
                "--expected-width", "160",
                "--expected-height", "220",
                "--horizontal-radius", "16",
                "--vertical-radius", "12",
                "--minimum-score", "0.15",
                "--minimum-improvement", "0.001",
            ]
            region_admission.run(args)
            with self.assertRaises(region_admission.base.ProducerError):
                region_admission.run(args)


if __name__ == "__main__":
    unittest.main()
