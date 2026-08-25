from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "handwriting_paragraph.py"

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


def _load_module():
    spec = importlib.util.spec_from_file_location("handwriting_paragraph", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _make(path: Path, *, width: int = 30, height: int = 48) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.line((5, height - 6, width - 5, 5), fill=(25, 30, 52, 245), width=4)
    image.save(path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _atlas(module, root: Path) -> Path:
    assets = root / "assets"
    glyphs = {}
    for glyph in ("A", "B"):
        path = assets / f"{glyph}.png"
        sha = _make(path)
        glyphs[glyph] = [{
            "file": path.relative_to(assets).as_posix(),
            "sha256": sha,
            "style": "uppercase",
            "naturalAdvancePx": 25.0,
            "inkBox": [5, 5, 25, 42],
            "inkSize": [20, 37],
        }]
    atlas = {
        "schema": module.atlas_tool.ATLAS_SCHEMA,
        "atlasId": "paragraph-test",
        "assetRoot": str(assets),
        "glyphs": glyphs,
        "rendering": {"trackingPx": 1.5, "spaceFactor": 0.48},
    }
    path = root / "atlas.json"
    path.write_text(json.dumps(atlas), encoding="utf-8")
    return path


@unittest.skipUnless(PIL_AVAILABLE, "Pillow is optional")
class HandwritingParagraphTests(unittest.TestCase):
    def test_wraps_at_spaces_using_measured_genuine_advances(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(module, root)
            wrapped, evidence = module.wrap_text(atlas, "AA BB AA", max_width_px=125, style="uppercase")
            self.assertEqual(wrapped, "AA BB\nAA")
            self.assertEqual(len(evidence), 2)
            self.assertTrue(all(item["estimatedWidthPx"] <= 125 for item in evidence if not item["blank"]))

    def test_preserves_explicit_blank_paragraph_line(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(module, root)
            wrapped, evidence = module.wrap_text(atlas, "AA\n\nBB", max_width_px=120, style="uppercase")
            self.assertEqual(wrapped, "AA\n\nBB")
            self.assertEqual(sum(1 for item in evidence if item["blank"]), 1)

    def test_rejects_single_word_that_cannot_fit_without_arbitrary_split(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(module, root)
            with self.assertRaisesRegex(ValueError, "cannot be safely split"):
                module.wrap_text(atlas, "AAAAAA", max_width_px=120, style="uppercase")

    def test_render_is_deterministic_for_same_seed_and_width(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(module, root)
            first = root / "first.png"
            second = root / "second.png"
            a = module.render_paragraph(atlas, "AA BB AA", first, seed="same", max_width_px=125, style="uppercase")
            b = module.render_paragraph(atlas, "AA BB AA", second, seed="same", max_width_px=125, style="uppercase")
            self.assertEqual(a["outputSha256"], b["outputSha256"])
            self.assertTrue(a["truthBoundary"]["wordWrappingUsesMeasuredGenuineAdvances"])
            self.assertFalse(a["truthBoundary"]["fontFallbackUsed"])

    def test_missing_character_still_fails_closed(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(module, root)
            with self.assertRaisesRegex(ValueError, "missing character"):
                module.wrap_text(atlas, "AA Z", max_width_px=160, style="uppercase")


if __name__ == "__main__":
    unittest.main()
