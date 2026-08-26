import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

MODULE_PATH = Path(__file__).resolve().parents[1] / "tools/recover_painted_checkerboard.py"
SPEC = importlib.util.spec_from_file_location("recover_painted_checkerboard", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class PaintedCheckerboardRecoveryTest(unittest.TestCase):
    def test_removes_only_border_connected_checker(self) -> None:
        image = Image.new("RGB", (96, 72))
        draw = ImageDraw.Draw(image)
        colours = ((238, 238, 239), (253, 253, 254))
        for y in range(0, 72, 8):
            for x in range(0, 96, 8):
                draw.rectangle((x, y, x + 7, y + 7), fill=colours[(x // 8 + y // 8) % 2])
        draw.rectangle((28, 16, 67, 66), fill=(44, 61, 70))
        draw.rectangle((39, 27, 56, 54), fill=colours[0])  # interior armour detail must survive
        result, evidence = MODULE.recover(image, border_band=8, threshold=4)
        alpha = result.getchannel("A")
        self.assertEqual(0, alpha.getpixel((0, 0)))
        self.assertEqual(255, alpha.getpixel((32, 24)))
        self.assertEqual(255, alpha.getpixel((45, 35)))
        self.assertGreater(evidence["transparent_fraction"], 0.5)
        self.assertEqual(0, evidence["fringe_removed_pixels"])

    def test_removes_declared_black_matte_without_erasing_black_interior(self) -> None:
        image = Image.new("RGB", (64, 64), (0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rectangle((16, 8, 47, 60), fill=(185, 170, 145))
        draw.rectangle((25, 20, 38, 45), fill=(0, 0, 0))
        result, evidence = MODULE.recover(
            image, border_band=4, threshold=2, fringe_threshold=2,
            fringe_passes=1, matte_colour=(0, 0, 0),
        )
        alpha = result.getchannel("A")
        self.assertEqual(0, alpha.getpixel((0, 0)))
        self.assertEqual(255, alpha.getpixel((30, 30)))
        self.assertEqual("declared-matte-plus-edge-connected-removal", evidence["method"])


if __name__ == "__main__":
    unittest.main()
