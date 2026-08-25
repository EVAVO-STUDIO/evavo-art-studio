from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "handwriting_atlas.py"
spec = importlib.util.spec_from_file_location("handwriting_atlas", TOOL)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


def _make(path: Path, *, width: int, height: int, x0: int = 5, x1: int | None = None) -> str:
    import hashlib
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    x1 = x1 if x1 is not None else width - 5
    draw.line((x0, height - 6, x1, 5), fill=(28, 34, 62, 245), width=4)
    image.save(path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


@unittest.skipUnless(PIL_AVAILABLE, "Pillow is optional")
class HandwritingAtlasTests(unittest.TestCase):
    def _fixture(self, root: Path) -> tuple[Path, Path]:
        assets = root / "assets"
        glyphs = {}
        for glyph in ("A", "B", ".com"):
            variants = []
            for suffix, dims in (("a", (30, 48)), ("b", (36, 56))):
                path = assets / f"{glyph.replace('.', 'dot')}-{suffix}.png"
                sha = _make(path, width=dims[0], height=dims[1], x0=4 if suffix == "a" else 7)
                variants.append({"file": path.relative_to(assets).as_posix(), "sha256": sha, "style": "uppercase"})
            glyphs[glyph] = variants
        sigs = []
        for suffix in ("a", "b"):
            path = assets / f"signature-{suffix}.png"
            sha = _make(path, width=110, height=38, x0=8)
            sigs.append({"file": path.name, "sha256": sha, "style": "natural"})
        catalog = {
            "atlasId": "fixture",
            "glyphs": glyphs,
            "wholeMarks": {"signature": sigs},
        }
        catalog_path = root / "catalog.json"
        catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
        return assets, catalog_path

    def test_build_measures_natural_advance_and_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets, catalog = self._fixture(root)
            atlas_path = root / "atlas.json"
            result = module.build_atlas(catalog, asset_root=assets, output=atlas_path)
            self.assertTrue(result["ok"])
            atlas = json.loads(atlas_path.read_text())
            sample = atlas["glyphs"]["A"][0]
            self.assertGreater(sample["naturalAdvancePx"], sample["inkSize"][0])
            self.assertEqual(len(sample["sha256"]), 64)
            self.assertFalse(atlas["truthBoundary"]["fontFallbackUsed"])
            self.assertTrue(atlas["truthBoundary"]["wholeSignatureVariantsOnly"])

    def test_render_uses_longest_fragment_and_avoids_immediate_repeat(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets, catalog = self._fixture(root)
            atlas_path = root / "atlas.json"
            module.build_atlas(catalog, asset_root=assets, output=atlas_path)
            out = root / "render.png"
            proof = root / "proof.png"
            receipt = root / "receipt.json"
            result = module.render_text(atlas_path, "AA.com", out, seed="job-1", style="uppercase", proof=proof, receipt=receipt)
            self.assertTrue(out.is_file())
            self.assertTrue(proof.is_file())
            token_text = [item["text"] for item in result["tokens"]]
            self.assertEqual(token_text, ["A", "A", ".com"])
            self.assertNotEqual(result["tokens"][0]["variant"], result["tokens"][1]["variant"])
            self.assertFalse(result["truthBoundary"]["fontFallbackUsed"])
            self.assertFalse(result["truthBoundary"]["syntheticHandwritingGenerated"])

    def test_render_fails_on_missing_character(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets, catalog = self._fixture(root)
            atlas_path = root / "atlas.json"
            module.build_atlas(catalog, asset_root=assets, output=atlas_path)
            with self.assertRaisesRegex(ValueError, "missing character"):
                module.render_text(atlas_path, "AZ", root / "render.png", seed="job-2")

    def test_signature_selection_uses_whole_genuine_variant_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets, catalog = self._fixture(root)
            atlas_path = root / "atlas.json"
            module.build_atlas(catalog, asset_root=assets, output=atlas_path)
            selected = module.select_whole_mark(atlas_path, kind="signature", seed="job-3", style="natural")
            self.assertEqual(len(selected["selectedSha256"]), 64)
            self.assertFalse(selected["signatureSynthesizedFromGlyphs"])
            self.assertTrue(selected["privatePathsReturned"] is False)


if __name__ == "__main__":
    unittest.main()
