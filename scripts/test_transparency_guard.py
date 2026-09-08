import math
import unittest

from PIL import Image, ImageDraw

from tools.transparency_guard import inspect_transparency


class TransparencyGuardTest(unittest.TestCase):
    def test_rejects_warped_painted_checkerboard(self) -> None:
        width = height = 320
        tile = 10
        image = Image.new("RGB", (width, height))
        pixels = image.load()
        colours = ((154, 154, 154), (205, 205, 205))
        for y in range(height):
            horizontal_warp = round(2.5 * math.sin(y / 19.0))
            for x in range(width):
                vertical_warp = round(2.0 * math.sin(x / 23.0))
                parity = ((x + horizontal_warp) // tile + (y + vertical_warp) // tile) & 1
                pixels[x, y] = colours[parity]
        ImageDraw.Draw(image).ellipse((92, 70, 228, 274), fill=(42, 58, 39))

        evidence = inspect_transparency(image, policy="required")

        self.assertFalse(evidence["passed"])
        self.assertIn("painted-checkerboard-detected", evidence["blockers"])
        self.assertTrue(evidence["checkerboard"]["warpedGrid"]["detected"])

    def test_does_not_call_a_flat_grey_field_a_checkerboard(self) -> None:
        image = Image.new("RGB", (192, 192), (170, 170, 170))
        evidence = inspect_transparency(image, policy="required")
        self.assertFalse(evidence["checkerboard"]["detected"])


if __name__ == "__main__":
    unittest.main()
