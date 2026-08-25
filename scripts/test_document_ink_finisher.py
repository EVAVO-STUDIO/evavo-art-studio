from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "document_ink_finisher.py"
spec = importlib.util.spec_from_file_location("document_ink_finisher", TOOL)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


@unittest.skipUnless(PIL_AVAILABLE, "Pillow is optional")
class DocumentInkFinisherTests(unittest.TestCase):
    def test_master_preserves_visible_ink_and_transparency(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "mark.png"
            output = root / "master.png"
            image = Image.new("RGBA", (120, 60), (255, 255, 255, 0))
            draw = ImageDraw.Draw(image)
            draw.line((20, 30, 100, 25), fill=(28, 40, 78, 240), width=4)
            image.save(source)
            receipt = module.master_transparent_ink(source, output)
            self.assertTrue(output.is_file())
            self.assertTrue(receipt["visibleInkRgbPreserved"])
            self.assertFalse(receipt["syntheticHandwritingGenerated"])
            self.assertTrue(receipt["createOnly"])
            mastered = Image.open(output).convert("RGBA")
            self.assertEqual(mastered.getchannel("A").getextrema()[0], 0)

    def test_master_refuses_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "mark.png"
            output = root / "master.png"
            image = Image.new("RGBA", (80, 40), (0, 0, 0, 0))
            ImageDraw.Draw(image).line((10, 20, 70, 18), fill=(25, 35, 70, 230), width=3)
            image.save(source)
            output.write_bytes(b"do-not-overwrite")
            with self.assertRaisesRegex(ValueError, "create-only"):
                module.master_transparent_ink(source, output)
            self.assertEqual(output.read_bytes(), b"do-not-overwrite")

    def test_photo_extraction_removes_coloured_uneven_paper(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "photo.png"
            output = root / "extracted.png"
            proof = root / "proof.png"
            image = Image.new("RGB", (220, 120))
            px = image.load()
            for y in range(image.height):
                for x in range(image.width):
                    # Uneven pink/purple photographed paper with a diagonal shadow.
                    shade = int((x / image.width) * 18 + (y / image.height) * 14)
                    px[x, y] = (238 - shade, 217 - shade // 2, 226 - shade // 3)
            draw = ImageDraw.Draw(image)
            draw.line((45, 62, 170, 50), fill=(34, 30, 45), width=5)
            image.save(source)
            receipt = module.extract_photo_handwriting(source, output, kind="text", proof=proof)
            self.assertTrue(receipt["paperCastRemoved"])
            self.assertTrue(receipt["shadowGradientRemoved"])
            self.assertFalse(receipt["syntheticHandwritingGenerated"])
            self.assertFalse(receipt["strokeGeometryChanged"])
            extracted = Image.open(output).convert("RGBA")
            alpha = extracted.getchannel("A")
            self.assertEqual(alpha.getextrema()[0], 0)
            self.assertGreater(alpha.getextrema()[1], 180)
            self.assertTrue(proof.is_file())
            self.assertEqual(len(receipt["hostileBackgroundProofSha256"]), 64)

    def test_photo_extraction_keep_rect_excludes_neighbouring_mark(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "photo.png"
            output = root / "kept.png"
            image = Image.new("RGB", (180, 90), (235, 224, 226))
            draw = ImageDraw.Draw(image)
            draw.line((28, 45, 80, 38), fill=(28, 27, 36), width=5)
            draw.line((135, 25, 155, 65), fill=(28, 27, 36), width=5)
            image.save(source)
            receipt = module.extract_photo_handwriting(
                source,
                output,
                crop_rect=(10, 10, 170, 80),
                keep_rect=(0, 0, 95, 70),
                kind="signature",
            )
            self.assertEqual(receipt["inkKeepRect"], [0, 0, 95, 70])
            extracted = Image.open(output).convert("RGBA")
            self.assertLess(extracted.width, 110)

    def test_photo_extraction_fails_closed_on_clipped_ink(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "photo.png"
            output = root / "bad.png"
            image = Image.new("RGB", (100, 60), (236, 225, 225))
            ImageDraw.Draw(image).line((0, 30, 75, 26), fill=(25, 25, 30), width=5)
            image.save(source)
            with self.assertRaisesRegex(ValueError, "touches crop edge"):
                module.extract_photo_handwriting(source, output, kind="text")

    def test_transform_is_deterministic_and_bounded(self) -> None:
        first = module.natural_transform(seed="job-1", kind="signature")
        second = module.natural_transform(seed="job-1", kind="signature")
        self.assertEqual(first, second)
        self.assertLessEqual(abs(first["rotationDegrees"]), 0.8)
        self.assertLessEqual(abs(first["scale"] - 1.0), 0.0181)
        self.assertFalse(first["syntheticStrokeDeformation"])

    def test_variant_selection_prefers_another_genuine_sample(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            a = root / "a.png"
            b = root / "b.png"
            a.write_bytes(b"first-genuine-sample")
            b.write_bytes(b"second-genuine-sample")
            first_sha = module._file_sha(a)
            selected = module.choose_genuine_variant([a, b], seed="job-2", previous_sha256=first_sha)
            self.assertEqual(selected["selectedSha256"], module._file_sha(b))
            self.assertEqual(selected["variantCount"], 2)

    def test_local_paper_integration_does_not_degrade_whole_document(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mark = root / "mark.png"
            paper = root / "paper.png"
            output = root / "integrated.png"
            ink = Image.new("RGBA", (90, 35), (0, 0, 0, 0))
            draw = ImageDraw.Draw(ink)
            draw.line((10, 20, 80, 15), fill=(24, 35, 70, 230), width=3)
            ink.save(mark)
            Image.new("RGB", (220, 90), (236, 233, 224)).save(paper)
            receipt = module.integrate_into_paper(mark, paper, output, seed="job-3", kind="signature")
            self.assertTrue(output.is_file())
            self.assertEqual(receipt["blendMode"], "multiply-local-paper")
            self.assertFalse(receipt["wholePageDegradationApplied"])
            self.assertFalse(receipt["syntheticHandwritingGenerated"])
            self.assertTrue(receipt["createOnly"])


if __name__ == "__main__":
    unittest.main()
