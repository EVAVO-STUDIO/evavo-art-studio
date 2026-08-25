from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.handwriting_fiducial_detect import detect

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


@unittest.skipUnless(PIL_AVAILABLE, "Pillow is optional")
class HandwritingFiducialDetectionTests(unittest.TestCase):
    def _photo(self, path: Path, *, ambiguous: bool = False) -> None:
        width, height = 1000, 1400
        image = Image.new("RGB", (width, height), (244, 242, 238))
        draw = ImageDraw.Draw(image)
        centers = {
            "tl": (95, 78),
            "tr": (905, 92),
            "br": (886, 1320),
            "bl": (108, 1302),
        }
        for cx, cy in centers.values():
            draw.rectangle((cx - 17, cy - 17, cx + 17, cy + 17), fill=(4, 4, 4))
        # Light worksheet geometry and handwriting-like strokes should not be mistaken for fiducials.
        for y in (260, 490, 720, 950, 1180):
            draw.line((100, y, 900, y + 12), fill=(125, 125, 125), width=2)
        draw.line((160, 320, 260, 350), fill=(30, 30, 30), width=5)
        draw.line((520, 640, 620, 612), fill=(28, 28, 28), width=5)
        if ambiguous:
            # A second plausible solid square near the expected TL marker must make detection fail closed.
            draw.rectangle((124, 64, 158, 98), fill=(5, 5, 5))
        image.save(path, format="PNG")

    def test_detects_four_fiducials_and_extrapolates_page_corners(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "photo.png"
            output = root / "registration.json"
            self._photo(source)
            report = detect(source, output, page=2)
            registration = json.loads(output.read_text(encoding="utf-8"))
            self.assertTrue(report["ok"])
            self.assertEqual(report["fiducialCount"], 4)
            self.assertTrue(report["manualReviewRequired"])
            self.assertEqual(registration["page"], 2)
            self.assertEqual(set(registration["cornersPx"]), {"topLeft", "topRight", "bottomRight", "bottomLeft"})
            self.assertTrue(registration["detectionEvidence"]["manualReviewRequired"])
            self.assertLess(registration["cornersPx"]["topLeft"][0], 60)
            self.assertLess(registration["cornersPx"]["topLeft"][1], 60)
            self.assertGreater(registration["cornersPx"]["bottomRight"][0], 940)
            self.assertGreater(registration["cornersPx"]["bottomRight"][1], 1340)

    def test_rejects_ambiguous_corner_detection(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "photo.png"
            self._photo(source, ambiguous=True)
            with self.assertRaisesRegex(ValueError, "ambiguous fiducial detection"):
                detect(source, root / "registration.json")

    def test_create_only_registration(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "photo.png"
            output = root / "registration.json"
            self._photo(source)
            detect(source, output)
            with self.assertRaisesRegex(ValueError, "create-only"):
                detect(source, output)


if __name__ == "__main__":
    unittest.main()
