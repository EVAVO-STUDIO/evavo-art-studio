from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "handwriting_whole_mark.py"
spec = importlib.util.spec_from_file_location("handwriting_whole_mark", TOOL)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


def _png(path: Path, offset: int) -> str:
    image = Image.new("RGBA", (140, 55), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.line((12 + offset, 35, 120, 18 + offset), fill=(25, 32, 65, 245), width=4)
    image.save(path, format="PNG")
    return hashlib.sha256(path.read_bytes()).hexdigest()


@unittest.skipUnless(PIL_AVAILABLE, "Pillow is optional")
class WholeMarkTests(unittest.TestCase):
    def _atlas(self, root: Path) -> Path:
        assets = root / "assets"
        assets.mkdir()
        sig_a = assets / "sig-a.png"
        sig_b = assets / "sig-b.png"
        name_a = assets / "name-a.png"
        sha_a = _png(sig_a, 0)
        sha_b = _png(sig_b, 4)
        sha_n = _png(name_a, 2)
        atlas = {
            "schema": "evavo.art-studio.handwriting-atlas.v1",
            "atlasId": "whole-mark-test",
            "assetRoot": str(assets),
            "glyphs": {"A": [{"file": "sig-a.png", "sha256": sha_a}]},
            "wholeMarks": {
                "signature": [
                    {"file": "sig-a.png", "sha256": sha_a, "style": "natural"},
                    {"file": "sig-b.png", "sha256": sha_b, "style": "natural"},
                ],
                "name": [{"file": "name-a.png", "sha256": sha_n, "style": "natural"}],
            },
        }
        path = root / "atlas.json"
        path.write_text(json.dumps(atlas), encoding="utf-8")
        return path

    def test_signature_render_is_whole_genuine_variant(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = self._atlas(root)
            output = root / "signature.png"
            proof = root / "proof.png"
            receipt = root / "receipt.json"
            result = module.render_whole_mark(atlas, output, kind="signature", seed="sig-seed", style="natural", proof=proof, receipt=receipt)
            self.assertTrue(output.is_file())
            self.assertTrue(proof.is_file())
            self.assertTrue(receipt.is_file())
            self.assertTrue(result["truthBoundary"]["wholeGenuineCapturedVariant"])
            self.assertFalse(result["truthBoundary"]["signatureSynthesizedFromGlyphs"])
            self.assertFalse(result["truthBoundary"]["syntheticHandwritingGenerated"])

    def test_same_seed_is_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = self._atlas(root)
            first = module.render_whole_mark(atlas, root / "first.png", kind="signature", seed="repeat")
            second = module.render_whole_mark(atlas, root / "second.png", kind="signature", seed="repeat")
            self.assertEqual(first["selectedSourceSha256"], second["selectedSourceSha256"])
            self.assertEqual(first["scale"], second["scale"])
            self.assertEqual(first["rotationDegrees"], second["rotationDegrees"])

    def test_previous_sha_prefers_alternate_variant(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = self._atlas(root)
            first = module.render_whole_mark(atlas, root / "first.png", kind="signature", seed="one")
            second = module.render_whole_mark(atlas, root / "second.png", kind="signature", seed="two", previous_sha256=first["selectedSourceSha256"])
            self.assertNotEqual(first["selectedSourceSha256"], second["selectedSourceSha256"])


if __name__ == "__main__":
    unittest.main()
