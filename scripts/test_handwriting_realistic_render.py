from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "handwriting_realistic_render.py"

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


def _load_module():
    spec = importlib.util.spec_from_file_location("handwriting_realistic_render", TOOL)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def _png(path: Path, offset: int) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (36 + offset, 50 + offset), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.line((5, image.height - 6, image.width - 5, 5), fill=(20, 28, 55, 245), width=4)
    image.save(path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _atlas(module, root: Path) -> Path:
    assets = root / "assets"
    variants = []
    for index in range(3):
        path = assets / f"A-{index}.png"
        sha = _png(path, index)
        variants.append({
            "file": path.relative_to(assets).as_posix(),
            "sha256": sha,
            "style": "natural-uppercase",
            "naturalAdvancePx": 27.0 + index,
            "inkBox": [5, 5, 30 + index, 44 + index],
            "inkSize": [25 + index, 39 + index],
        })
    atlas = {
        "schema": module.atlas_tool.ATLAS_SCHEMA,
        "atlasId": "balanced-fixture",
        "assetRoot": str(assets),
        "glyphs": {"A": variants},
        "rendering": {
            "trackingPx": 1.5,
            "spaceFactor": 0.48,
            "baselineJitterFraction": 0.016,
            "scaleJitterFraction": 0.012,
            "rotationDegrees": 0.45,
        },
    }
    path = root / "atlas.json"
    path.write_text(json.dumps(atlas), encoding="utf-8")
    return path


@unittest.skipUnless(PIL_AVAILABLE, "Pillow is optional")
class HandwritingRealisticRenderTests(unittest.TestCase):
    def test_uses_all_three_genuine_variants_before_refill(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(module, root)
            result = module.render_text(atlas, "AAAAAA", root / "out.png", seed="bag-1", style="natural-uppercase")
            variants = [item["variant"] for item in result["tokens"]]
            cycles = [item["variantCycle"] for item in result["tokens"]]
            self.assertEqual(set(variants[:3]), {0, 1, 2})
            self.assertEqual(set(variants[3:6]), {0, 1, 2})
            self.assertEqual(cycles[:3], [1, 1, 1])
            self.assertEqual(cycles[3:6], [2, 2, 2])
            self.assertNotEqual(variants[2], variants[3])
            self.assertEqual(result["variantSelection"]["mode"], "deterministic-shuffled-genuine-variant-bag-v1")
            self.assertTrue(result["variantSelection"]["usesEveryAvailableVariantBeforeRefill"])
            self.assertFalse(result["truthBoundary"]["fontFallbackUsed"])
            self.assertFalse(result["truthBoundary"]["syntheticHandwritingGenerated"])

    def test_same_seed_is_pixel_deterministic(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(module, root)
            first = module.render_text(atlas, "AAAAAA", root / "a.png", seed="same", style="natural-uppercase")
            second = module.render_text(atlas, "AAAAAA", root / "b.png", seed="same", style="natural-uppercase")
            self.assertEqual(first["outputSha256"], second["outputSha256"])
            self.assertEqual([x["variant"] for x in first["tokens"]], [x["variant"] for x in second["tokens"]])

    def test_missing_character_still_fails_closed(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(module, root)
            with self.assertRaisesRegex(ValueError, "missing character"):
                module.render_text(atlas, "AB", root / "bad.png", seed="bad", style="natural-uppercase")


if __name__ == "__main__":
    unittest.main()
