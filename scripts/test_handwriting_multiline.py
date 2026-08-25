from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ATLAS_TOOL = ROOT / "tools" / "handwriting_atlas.py"
MULTILINE_TOOL = ROOT / "tools" / "handwriting_multiline.py"

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def _make(path: Path, offset: int) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (34, 50), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.line((5 + offset, 43, 26 + offset, 6), fill=(20, 30, 50, 245), width=4)
    image.save(path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


@unittest.skipUnless(PIL_AVAILABLE, "Pillow is optional")
class HandwritingMultilineTests(unittest.TestCase):
    def _atlas(self, root: Path) -> Path:
        atlas_module = _load(ATLAS_TOOL, "handwriting_atlas_fixture")
        assets = root / "assets"
        glyphs = {}
        for glyph in ("A", "B"):
            variants = []
            for index in range(2):
                path = assets / f"{glyph}-{index}.png"
                variants.append({"file": path.name, "sha256": _make(path, index), "style": "uppercase"})
            glyphs[glyph] = variants
        catalog = root / "catalog.json"
        catalog.write_text(json.dumps({"atlasId": "multiline-fixture", "glyphs": glyphs}), encoding="utf-8")
        atlas = root / "atlas.json"
        atlas_module.build_atlas(catalog, asset_root=assets, output=atlas)
        return atlas

    def test_renders_real_line_breaks_and_blank_lines(self) -> None:
        module = _load(MULTILINE_TOOL, "handwriting_multiline")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = self._atlas(root)
            output = root / "multiline.png"
            proof = root / "proof.png"
            receipt = root / "receipt.json"
            result = module.render_multiline(atlas, "AA\n\nBB", output, seed="ml-1", style="uppercase", proof=proof, receipt=receipt)
            self.assertTrue(output.is_file())
            self.assertTrue(proof.is_file())
            self.assertTrue(receipt.is_file())
            self.assertEqual(result["lineCount"], 3)
            self.assertEqual(result["inkLineCount"], 2)
            self.assertEqual(result["blankLineCount"], 1)
            self.assertGreater(result["pixelSize"][1], result["pixelSize"][0] // 2)
            self.assertFalse(result["truthBoundary"]["fontFallbackUsed"])
            self.assertFalse(result["truthBoundary"]["syntheticHandwritingGenerated"])
            self.assertTrue(result["truthBoundary"]["lineImagesRenderedByGenuineAtlas"])

    def test_is_deterministic_for_same_seed(self) -> None:
        module = _load(MULTILINE_TOOL, "handwriting_multiline_determinism")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = self._atlas(root)
            first = root / "a.png"
            second = root / "b.png"
            one = module.render_multiline(atlas, "AB\nBA", first, seed="same", style="uppercase")
            two = module.render_multiline(atlas, "AB\nBA", second, seed="same", style="uppercase")
            self.assertEqual(one["outputSha256"], two["outputSha256"])

    def test_missing_character_still_fails_closed(self) -> None:
        module = _load(MULTILINE_TOOL, "handwriting_multiline_missing")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = self._atlas(root)
            with self.assertRaisesRegex(ValueError, "missing character"):
                module.render_multiline(atlas, "AA\nAZ", root / "bad.png", seed="ml-2", style="uppercase")


if __name__ == "__main__":
    unittest.main()
