import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from tools.sprite_sheet_safe_margin import matte_colour, repair


class SpriteSheetSafeMarginTests(unittest.TestCase):
    def test_translates_edge_contact_without_scaling_or_redrawing(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder) / "source.png", Path(folder) / "output.png"
            image = Image.new("RGB", (128, 64), (0, 255, 0))
            draw = ImageDraw.Draw(image)
            draw.rectangle((48, 16, 63, 47), fill=(180, 20, 20))
            draw.rectangle((80, 16, 96, 47), fill=(20, 20, 180))
            image.save(source)
            report = repair(source, output, 2, 1, 0, 8, 30)
            self.assertEqual(report["cells"][0]["translation"], [-8, 0])
            self.assertEqual(report["cells"][1]["translation"], [0, 0])
            repaired = Image.open(output)
            self.assertEqual(repaired.getpixel((40, 16)), (180, 20, 20))
            self.assertEqual(repaired.getpixel((80, 16)), (20, 20, 180))

    def test_rejects_foreground_too_large_for_translation(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder) / "source.png", Path(folder) / "output.png"
            image = Image.new("RGB", (64, 64), (0, 255, 0))
            ImageDraw.Draw(image).rectangle((2, 8, 61, 55), fill=(180, 20, 20))
            image.save(source)
            with self.assertRaisesRegex(RuntimeError, "without scaling"):
                repair(source, output, 1, 1, 0, 8, 30)

    def test_uses_full_border_when_grid_divider_contaminates_two_corners(self):
        image = Image.new("RGB", (64, 64), (0, 255, 0))
        ImageDraw.Draw(image).line((0, 63, 63, 63), fill=(255, 255, 255))
        self.assertEqual(matte_colour(image), (0, 255, 0))

    def test_retains_and_moves_subject_pixels_touching_cell_boundary(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder) / "source.png", Path(folder) / "output.png"
            image = Image.new("RGB", (64, 64), (0, 255, 0))
            draw = ImageDraw.Draw(image)
            draw.line((0, 0, 63, 0), fill=(255, 255, 255), width=2)
            draw.rectangle((24, 40, 39, 63), fill=(180, 20, 20))
            image.save(source)
            report = repair(source, output, 1, 1, 4, 8, 30)
            self.assertEqual(report["cells"][0]["translation"], [0, -8])
            self.assertEqual(report["cells"][0]["removed_edge_divider_px"]["top"], 2)
            repaired = Image.open(output)
            self.assertEqual(repaired.getpixel((24, 55)), (180, 20, 20))
            self.assertEqual(repaired.getpixel((24, 63)), (0, 255, 0))


if __name__ == "__main__":
    unittest.main()
