import importlib.util
import sys
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

MODULE_PATH = Path(__file__).resolve().parents[1] / "tools/recover_painted_checkerboard.py"
sys.path.insert(0, str(MODULE_PATH.parent))
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
        draw.rectangle((39, 27, 56, 54), fill=colours[0])
        result, evidence = MODULE.recover(image, border_band=8, threshold=4)
        alpha = result.getchannel("A")
        self.assertEqual(0, alpha.getpixel((0, 0)))
        self.assertEqual(255, alpha.getpixel((32, 24)))
        self.assertEqual(255, alpha.getpixel((45, 35)))
        self.assertGreater(evidence["transparent_fraction"], 0.5)
        self.assertEqual(0, evidence["fringe_removed_pixels"])
        admission = MODULE.validate_recovered_output(result)
        self.assertTrue(admission["passed"])
        self.assertTrue(admission["guarantees"]["paintedGridNeverAcceptedAsAlpha"])

    def test_removes_declared_black_matte_without_erasing_black_interior(self) -> None:
        image = Image.new("RGB", (64, 64), (0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rectangle((16, 8, 47, 60), fill=(185, 170, 145))
        draw.rectangle((25, 20, 38, 45), fill=(0, 0, 0))
        result, evidence = MODULE.recover(image, border_band=4, threshold=2, fringe_threshold=2, fringe_passes=1, matte_colour=(0, 0, 0))
        alpha = result.getchannel("A")
        self.assertEqual(0, alpha.getpixel((0, 0)))
        self.assertEqual(255, alpha.getpixel((30, 30)))
        self.assertEqual("declared-matte-plus-edge-connected-removal", evidence["method"])

    def test_removes_small_visible_islands_without_erasing_subject(self) -> None:
        image = Image.new("RGB", (80, 64), (255, 255, 255))
        draw = ImageDraw.Draw(image)
        draw.rectangle((20, 12, 59, 58), fill=(40, 50, 60))
        draw.rectangle((4, 4, 5, 5), fill=(230, 220, 210))
        result, evidence = MODULE.recover(image, threshold=2, fringe_threshold=2, fringe_passes=1, matte_colour=(255, 255, 255), min_visible_island=16)
        alpha = result.getchannel("A")
        self.assertEqual(0, alpha.getpixel((4, 4)))
        self.assertEqual(255, alpha.getpixel((30, 30)))
        self.assertEqual(4, evidence["island_removed_pixels"])

    def test_builds_six_tile_hostile_background_proof(self) -> None:
        image = Image.new("RGBA", (2, 2), (200, 100, 50, 128))
        proof = MODULE.create_hostile_background_proof(image)
        self.assertEqual((6, 4), proof.size)
        self.assertEqual("RGB", proof.mode)
        self.assertEqual((100, 50, 25), proof.getpixel((0, 0)))
        self.assertEqual((128, 128, 128), proof.getpixel((4, 2)))

    def test_magenta_despill_caps_both_contaminated_channels(self) -> None:
        image = Image.new("RGB", (7, 7), (255, 0, 255))
        draw = ImageDraw.Draw(image)
        draw.rectangle((1, 1, 5, 5), fill=(80, 70, 60))
        image.putpixel((3, 3), (240, 20, 235))
        result, evidence = MODULE.recover(image, threshold=2, fringe_threshold=2, fringe_passes=1, matte_colour=(255, 0, 255), despill="magenta")
        self.assertEqual((20, 20, 20, 255), result.getpixel((3, 3)))
        self.assertEqual(1, evidence["despilled_pixels"])

    def test_protect_mask_restores_a_removed_pixel(self) -> None:
        image = Image.new("RGB", (7, 7), (255, 0, 255))
        ImageDraw.Draw(image).rectangle((2, 2, 4, 4), fill=(90, 55, 35))
        protect = Image.new("L", image.size, 0)
        protect.putpixel((1, 3), 255)
        output, evidence = MODULE.recover(image, matte_colour=(255, 0, 255), protect_mask=protect)
        self.assertEqual(output.getpixel((1, 3)), (255, 0, 255, 255))
        self.assertEqual(evidence["artist_guidance"]["protected_pixels"], 1)

    def test_remove_mask_can_erase_an_interior_artifact(self) -> None:
        image = Image.new("RGB", (7, 7), (255, 0, 255))
        ImageDraw.Draw(image).rectangle((2, 2, 4, 4), fill=(90, 55, 35))
        remove = Image.new("L", image.size, 0)
        remove.putpixel((3, 3), 255)
        output, evidence = MODULE.recover(image, matte_colour=(255, 0, 255), remove_mask=remove)
        self.assertEqual(output.getpixel((3, 3))[3], 0)
        self.assertEqual(evidence["artist_guidance"]["removed_or_softened_pixels"], 1)

    def test_strongly_overlapping_guidance_fails_closed(self) -> None:
        image = Image.new("RGB", (7, 7), (255, 0, 255))
        ImageDraw.Draw(image).rectangle((2, 2, 4, 4), fill=(90, 55, 35))
        mask = Image.new("L", image.size, 0)
        mask.putpixel((3, 3), 255)
        with self.assertRaisesRegex(ValueError, "strongly overlap"):
            MODULE.recover(image, matte_colour=(255, 0, 255), protect_mask=mask, remove_mask=mask)


if __name__ == "__main__":
    unittest.main()
