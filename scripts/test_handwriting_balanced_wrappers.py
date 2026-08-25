from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MULTILINE = ROOT / "tools" / "handwriting_balanced_multiline.py"
PARAGRAPH = ROOT / "tools" / "handwriting_balanced_paragraph.py"

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


def _png(path: Path, offset: int) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (34 + offset, 48 + offset), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.line((5, image.height - 6, image.width - 5, 5), fill=(25, 31, 58, 245), width=4)
    image.save(path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _atlas(root: Path) -> Path:
    assets = root / "assets"
    glyphs = {}
    for glyph in ("A", "B"):
        variants = []
        for index in range(3):
            path = assets / f"{glyph}-{index}.png"
            variants.append({
                "file": path.relative_to(assets).as_posix(),
                "sha256": _png(path, index),
                "style": "natural-uppercase",
                "naturalAdvancePx": 25.0 + index,
                "inkBox": [5, 5, 29 + index, 42 + index],
                "inkSize": [24 + index, 37 + index],
            })
        glyphs[glyph] = variants
    path = root / "atlas.json"
    path.write_text(json.dumps({
        "schema": "evavo.art-studio.handwriting-atlas.v1",
        "atlasId": "wrapper-fixture",
        "assetRoot": str(assets),
        "glyphs": glyphs,
        "rendering": {
            "trackingPx": 1.5,
            "spaceFactor": 0.48,
            "baselineJitterFraction": 0.016,
            "scaleJitterFraction": 0.012,
            "rotationDegrees": 0.45,
        },
    }), encoding="utf-8")
    return path


@unittest.skipUnless(PIL_AVAILABLE, "Pillow is optional")
class HandwritingBalancedWrapperTests(unittest.TestCase):
    def test_programmatic_multiline_receipt_matches_balanced_result(self) -> None:
        module = _load(MULTILINE, "balanced_multiline_test")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(root)
            receipt = root / "receipt.json"
            result = module.render_multiline(
                atlas,
                "AAA\nBBB",
                root / "out.png",
                seed="wrap",
                style="natural-uppercase",
                receipt=receipt,
            )
            saved = json.loads(receipt.read_text(encoding="utf-8"))
            self.assertEqual(saved["variantSelection"], result["variantSelection"])
            self.assertEqual(saved["variantSelection"]["mode"], "deterministic-shuffled-genuine-variant-bag-v1")
            self.assertTrue(saved["variantSelection"]["balancedPerLine"])

    def test_programmatic_paragraph_receipt_matches_balanced_result(self) -> None:
        module = _load(PARAGRAPH, "balanced_paragraph_test")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(root)
            receipt = root / "receipt.json"
            result = module.render_paragraph(
                atlas,
                "AAA BBB AAA",
                root / "out.png",
                seed="paragraph",
                max_width_px=180,
                style="natural-uppercase",
                receipt=receipt,
            )
            saved = json.loads(receipt.read_text(encoding="utf-8"))
            self.assertEqual(saved["variantSelection"], result["variantSelection"])
            self.assertEqual(saved["variantSelection"]["mode"], "deterministic-shuffled-genuine-variant-bag-v1")
            self.assertTrue(saved["variantSelection"]["balancedAcrossEachWrappedLine"])


if __name__ == "__main__":
    unittest.main()
