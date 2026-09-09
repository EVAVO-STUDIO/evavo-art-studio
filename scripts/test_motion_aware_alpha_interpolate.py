from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TOOL_PATH = ROOT / "tools" / "motion_aware_alpha_interpolate.py"
spec = importlib.util.spec_from_file_location("motion_tool", TOOL_PATH)
motion_tool = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = motion_tool
spec.loader.exec_module(motion_tool)


def make_subject(size=(96, 128), offset=(0, 0), color=(210, 70, 30, 255)):
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    x, y = offset
    draw.rounded_rectangle((28 + x, 22 + y, 66 + x, 108 + y), radius=13, fill=color)
    draw.ellipse((37 + x, 8 + y, 58 + x, 31 + y), fill=color)
    return image


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class MotionAwareAlphaInterpolationTests(unittest.TestCase):
    def test_endpoints_are_pixel_exact(self):
        before = make_subject(color=(255, 0, 0, 255))
        after = make_subject(offset=(3, 2), color=(0, 0, 255, 255))
        out0, _ = motion_tool.interpolate_images(before, after, 0.0)
        out1, _ = motion_tool.interpolate_images(before, after, 1.0)
        self.assertEqual(out0.tobytes(), before.tobytes())
        self.assertEqual(out1.tobytes(), after.tobytes())

    def test_translation_registration_recovers_known_motion(self):
        before = make_subject(offset=(0, 0))
        after = make_subject(offset=(12, 7))
        _, evidence = motion_tool.interpolate_images(
            before,
            after,
            0.5,
            horizontal_radius=20,
            vertical_radius=20,
            minimum_score=0.18,
            minimum_improvement=0.01,
        )
        self.assertIsNone(evidence.fallback_reason)
        self.assertLessEqual(abs(evidence.selected_dx + 12), 1)
        self.assertLessEqual(abs(evidence.selected_dy + 7), 1)
        self.assertGreater(evidence.score, evidence.zero_offset_score)

    def test_empty_alpha_uses_deterministic_fallback(self):
        before = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        after = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        output, evidence = motion_tool.interpolate_images(before, after, 0.5)
        self.assertEqual(evidence.fallback_reason, "registration-empty-alpha")
        self.assertEqual(output.getbbox(), None)

    def test_opaque_bounds_clip_guard_is_strict(self):
        self.assertFalse(
            motion_tool._translated_bbox_fits((0, 10, 24, 54), -0.25, 0.0, 64, 64)
        )
        self.assertFalse(
            motion_tool._translated_bbox_fits((40, 10, 64, 54), 0.25, 0.0, 64, 64)
        )
        self.assertTrue(
            motion_tool._translated_bbox_fits((8, 10, 56, 54), 2.0, 1.0, 64, 64)
        )

    def test_premultiplied_blend_does_not_leak_hidden_rgb(self):
        before = Image.new("RGBA", (8, 8), (255, 0, 0, 0))
        after = Image.new("RGBA", (8, 8), (0, 0, 255, 0))
        before.putpixel((3, 3), (255, 255, 255, 255))
        after.putpixel((3, 3), (255, 255, 255, 255))
        output, _ = motion_tool.interpolate_images(before, after, 0.5)
        for r, g, b, a in output.get_flattened_data():
            if a == 0:
                self.assertEqual((r, g, b), (0, 0, 0))

    def test_cli_is_create_only_and_receipt_is_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before_path = root / "before.png"
            after_path = root / "after.png"
            make_subject(offset=(0, 0)).save(before_path, format="PNG")
            make_subject(offset=(6, 4)).save(after_path, format="PNG")

            tool_bytes = TOOL_PATH.read_bytes()
            tool_blob = motion_tool._git_blob_sha1(tool_bytes)
            common = [
                "--source-before", str(before_path),
                "--source-after", str(after_path),
                "--frame-id", "test-frame-001",
                "--amount", "0.5",
                "--producer-commit", "1" * 40,
                "--producer-tool-blob-sha1", tool_blob,
                "--expected-width", "96",
                "--expected-height", "128",
                "--horizontal-radius", "20",
                "--vertical-radius", "20",
            ]

            out1 = root / "out1.png"
            receipt1 = root / "receipt1.json"
            result1 = motion_tool.run(
                common + ["--output", str(out1), "--receipt", str(receipt1)]
            )
            self.assertEqual(result1["schema"], motion_tool.RECEIPT_SCHEMA)
            self.assertTrue(out1.exists())
            self.assertTrue(receipt1.exists())
            parsed = json.loads(receipt1.read_text("utf-8"))
            self.assertEqual(parsed["output"]["sha256"], sha256(out1.read_bytes()))
            self.assertFalse(parsed["constraints"]["network"])
            self.assertFalse(parsed["constraints"]["modelInference"])

            out2 = root / "out2.png"
            receipt2 = root / "receipt2.json"
            result2 = motion_tool.run(
                common + ["--output", str(out2), "--receipt", str(receipt2)]
            )
            self.assertEqual(
                result1["output"]["sha256"], result2["output"]["sha256"]
            )
            self.assertEqual(out1.read_bytes(), out2.read_bytes())
            self.assertEqual(receipt1.read_bytes(), receipt2.read_bytes())

            with self.assertRaises(motion_tool.ProducerError):
                motion_tool.run(
                    common
                    + [
                        "--output", str(out1),
                        "--receipt", str(root / "r3.json"),
                    ]
                )

    def test_invalid_amount_rejected(self):
        before = make_subject()
        after = make_subject(offset=(1, 0))
        with self.assertRaises(motion_tool.ProducerError):
            motion_tool.interpolate_images(before, after, 1.01)


if __name__ == "__main__":
    unittest.main()
