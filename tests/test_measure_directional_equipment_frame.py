from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from tools.measure_directional_equipment_frame import measure


class DirectionalEquipmentMeasurementTests(unittest.TestCase):
    def test_measures_stable_geometry_and_style(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            canonical = root / "canonical.png"
            frame = root / "frame.png"
            mask = root / "shield-mask.png"
            for path, offset in ((canonical, 0), (frame, 1)):
                image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
                draw = ImageDraw.Draw(image)
                draw.rectangle((18 + offset, 8, 42 + offset, 56), fill=(180, 130, 70, 255))
                draw.ellipse((35 + offset, 20, 53 + offset, 46), fill=(80, 120, 130, 255))
                image.save(path)
            equipment = Image.new("L", (64, 64), 0)
            ImageDraw.Draw(equipment).ellipse((36, 20, 54, 46), fill=255)
            equipment.save(mask)
            result = measure(canonical, frame, mask)
            self.assertEqual(result["schema"], "evavo.directional-equipment-frame-measurement.v1")
            self.assertGreater(result["equipmentScaleFraction"], 0)
            self.assertGreater(result["styleEvidence"]["centroidAlignedSilhouetteIoU"], 0.9)
            self.assertFalse(result["runtimeAuthority"])

    def test_rejects_equipment_mask_outside_subject(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image_path = root / "sprite.png"
            mask_path = root / "mask.png"
            image = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
            ImageDraw.Draw(image).rectangle((10, 10, 20, 28), fill=(255, 255, 255, 255))
            image.save(image_path)
            mask = Image.new("L", (32, 32), 0)
            ImageDraw.Draw(mask).rectangle((0, 0, 4, 4), fill=255)
            mask.save(mask_path)
            with self.assertRaisesRegex(ValueError, "outside the visible subject"):
                measure(image_path, image_path, mask_path)


if __name__ == "__main__":
    unittest.main()
