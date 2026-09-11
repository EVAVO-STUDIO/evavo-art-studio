from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TOOL_PATH = ROOT / "tools" / "region_aware_alpha_interpolate.py"
spec = importlib.util.spec_from_file_location("region_motion_tool", TOOL_PATH)
region_tool = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = region_tool
spec.loader.exec_module(region_tool)


def make_articulated_subject(size=(160, 220), *, head_dx=0, torso_dx=0, lower_dx=0):
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((58 + head_dx, 12, 102 + head_dx, 56), fill=(235, 180, 150, 255))
    draw.rounded_rectangle((48 + torso_dx, 58, 112 + torso_dx, 150), radius=18, fill=(80, 120, 220, 255))
    draw.rounded_rectangle((55 + lower_dx, 145, 105 + lower_dx, 205), radius=13, fill=(50, 70, 130, 255))
    return image


class RegionAwareAlphaInterpolationTests(unittest.TestCase):
    def test_endpoints_are_pixel_exact(self):
        before = make_articulated_subject()
        after = make_articulated_subject(head_dx=8, torso_dx=3, lower_dx=-2)
        out0, _ = region_tool.interpolate_images(before, after, 0.0)
        out1, _ = region_tool.interpolate_images(before, after, 1.0)
        self.assertEqual(out0.tobytes(), before.tobytes())
        self.assertEqual(out1.tobytes(), after.tobytes())

    def test_region_registration_can_represent_nonrigid_motion(self):
        before = make_articulated_subject()
        after = make_articulated_subject(head_dx=8, torso_dx=3, lower_dx=-2)
        _, evidence = region_tool.interpolate_images(
            before,
            after,
            0.5,
            horizontal_radius=16,
            vertical_radius=12,
            minimum_score=0.15,
            minimum_improvement=0.001,
            max_adjacent_offset_delta=24,
        )
        accepted = [band for band in evidence.bands if band.accepted]
        self.assertIsNone(evidence.fallback_reason)
        self.assertGreaterEqual(len(accepted), 3)
        distinct_x = {band.selected_dx for band in accepted}
        self.assertGreaterEqual(len(distinct_x), 2)

    def test_incoherent_field_falls_back_instead_of_forcing_warp(self):
        before = make_articulated_subject()
        after = make_articulated_subject(head_dx=14, torso_dx=0, lower_dx=-14)
        _, evidence = region_tool.interpolate_images(
            before,
            after,
            0.5,
            horizontal_radius=20,
            vertical_radius=12,
            minimum_score=0.10,
            minimum_improvement=0.0,
            max_adjacent_offset_delta=3,
        )
        self.assertIsNotNone(evidence.fallback_reason)
        self.assertIsNotNone(evidence.global_evidence)

    def test_empty_alpha_uses_safe_fallback(self):
        before = Image.new("RGBA", (96, 128), (0, 0, 0, 0))
        after = Image.new("RGBA", (96, 128), (0, 0, 0, 0))
        output, evidence = region_tool.interpolate_images(before, after, 0.5)
        self.assertEqual(evidence.fallback_reason, "regional-empty-alpha")
        self.assertIsNotNone(evidence.global_evidence)
        self.assertIsNone(output.getbbox())

    def test_transparent_rgb_is_cleared(self):
        before = make_articulated_subject()
        after = make_articulated_subject(head_dx=4, torso_dx=2)
        output, _ = region_tool.interpolate_images(before, after, 0.5)
        for red, green, blue, alpha in output.getdata():
            if alpha == 0:
                self.assertEqual((red, green, blue), (0, 0, 0))

    def test_cli_receipt_is_create_only_and_truthful(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before_path = root / "before.png"
            after_path = root / "after.png"
            output_path = root / "out.png"
            receipt_path = root / "receipt.json"
            make_articulated_subject().save(before_path, format="PNG")
            make_articulated_subject(head_dx=6, torso_dx=2, lower_dx=-1).save(after_path, format="PNG")
            tool_blob = region_tool.base._git_blob_sha1(TOOL_PATH.read_bytes())
            args = [
                "--source-before", str(before_path),
                "--source-after", str(after_path),
                "--output", str(output_path),
                "--receipt", str(receipt_path),
                "--frame-id", "eva-region-test-001",
                "--amount", "0.5",
                "--producer-commit", "1" * 40,
                "--producer-tool-blob-sha1", tool_blob,
                "--expected-width", "160",
                "--expected-height", "220",
                "--horizontal-radius", "16",
                "--vertical-radius", "12",
                "--minimum-score", "0.15",
                "--minimum-improvement", "0.001",
            ]
            receipt = region_tool.run(args)
            parsed = json.loads(receipt_path.read_text("utf-8"))
            self.assertEqual(receipt["schema"], region_tool.RECEIPT_SCHEMA)
            self.assertEqual(parsed["producer"]["version"], "2.0.0")
            self.assertFalse(parsed["constraints"]["network"])
            self.assertFalse(parsed["constraints"]["modelInference"])
            self.assertFalse(parsed["constraints"]["creativeApproval"])
            self.assertFalse(parsed["constraints"]["runtimeActivation"])
            self.assertTrue(output_path.exists())
            with self.assertRaises(region_tool.base.ProducerError):
                region_tool.run(args)


if __name__ == "__main__":
    unittest.main()
