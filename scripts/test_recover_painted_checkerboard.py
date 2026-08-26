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


if __name__ == "__main__":
    unittest.main()
