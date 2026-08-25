from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "handwriting_realism_qa.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("handwriting_realism_qa", TOOL)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def _atlas(path: Path, variants: int = 3) -> Path:
    value = {
        "schema": "evavo.art-studio.handwriting-atlas.v1",
        "atlasId": "qa",
        "glyphs": {
            "A": [
                {"style": "uppercase", "naturalAdvancePx": 24.0 + index, "inkSize": [20, 38]}
                for index in range(variants)
            ]
        },
    }
    path.write_text(json.dumps(value), encoding="utf-8")
    return path


def _single(path: Path, variants: list[int], *, balanced: bool = False) -> Path:
    tokens = []
    for index, variant in enumerate(variants):
        item = {
            "text": "A",
            "variant": variant,
            "rotationDegrees": (-0.2 + index * 0.14),
            "scale": 0.99 + index * 0.004,
        }
        if balanced:
            item["variantCycle"] = index // 3 + 1
        tokens.append(item)
    value = {
        "schema": "evavo.art-studio.handwriting-render.v1",
        "style": "uppercase",
        "tokens": tokens,
        "truthBoundary": {
            "fontFallbackUsed": False,
            "syntheticHandwritingGenerated": False,
            "strokeDeformation": False,
        },
    }
    if balanced:
        value["variantSelection"] = {
            "mode": "deterministic-shuffled-genuine-variant-bag-v1",
            "usesEveryAvailableVariantBeforeRefill": True,
            "avoidsSameVariantAcrossBagBoundary": True,
        }
    path.write_text(json.dumps(value), encoding="utf-8")
    return path


class HandwritingRealismQaTests(unittest.TestCase):
    def test_clean_balanced_multi_variant_repeat_scores_strong(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = module.evaluate(_atlas(root / "atlas.json"), _single(root / "receipt.json", [0, 1, 2, 0], balanced=True))
            self.assertEqual(result["grade"], "strong")
            self.assertEqual(result["warnings"], [])
            self.assertTrue(result["metrics"]["balancedVariantSelection"]["used"])
            self.assertTrue(result["truthBoundary"]["readOnlyDiagnostic"])
            self.assertFalse(result["truthBoundary"]["handwritingModified"])

    def test_flags_legacy_selector_when_repeated_variants_are_available(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = module.evaluate(_atlas(root / "atlas.json"), _single(root / "receipt.json", [0, 1, 2, 0]))
            codes = {item["code"] for item in result["warnings"]}
            self.assertIn("legacy-variant-selection", codes)
            self.assertFalse(result["metrics"]["balancedVariantSelection"]["used"])

    def test_flags_immediate_same_variant_repeat(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = module.evaluate(_atlas(root / "atlas.json"), _single(root / "receipt.json", [0, 0, 1]))
            codes = {item["code"] for item in result["warnings"]}
            self.assertIn("immediate-variant-repeat", codes)
            self.assertLess(result["score"], 100)

    def test_flags_single_variant_bank(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = module.evaluate(_atlas(root / "atlas.json", variants=1), _single(root / "receipt.json", [0, 0, 0]))
            codes = {item["code"] for item in result["warnings"]}
            self.assertIn("single-variant-bank", codes)

    def test_flags_mechanical_multiline_starts(self) -> None:
        module = _load_module()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = _atlas(root / "atlas.json")
            receipt = root / "receipt.json"
            receipt.write_text(json.dumps({
                "schema": "evavo.art-studio.handwriting-multiline-render.v1",
                "style": "uppercase",
                "variantSelection": {"mode": "deterministic-shuffled-genuine-variant-bag-v1", "balancedPerLine": True},
                "lines": [
                    {"blank": False, "xPx": 2.0, "lineScale": 1.0, "effectiveTargetInkHeightPx": 38.0},
                    {"blank": False, "xPx": 2.0, "lineScale": 1.0, "effectiveTargetInkHeightPx": 38.1},
                    {"blank": False, "xPx": 2.0, "lineScale": 1.0, "effectiveTargetInkHeightPx": 38.0},
                ],
                "truthBoundary": {
                    "fontFallbackUsed": False,
                    "syntheticHandwritingGenerated": False,
                    "strokeDeformation": False,
                },
            }), encoding="utf-8")
            result = module.evaluate(atlas, receipt)
            codes = {item["code"] for item in result["warnings"]}
            self.assertIn("mechanical-line-starts", codes)
            self.assertNotIn("legacy-variant-selection", codes)


if __name__ == "__main__":
    unittest.main()
