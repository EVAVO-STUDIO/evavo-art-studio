from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "handwriting_coverage.py"
spec = importlib.util.spec_from_file_location("handwriting_coverage", TOOL)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


def _mark(path: Path) -> str:
    import hashlib
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (24, 34), (0, 0, 0, 0))
    ImageDraw.Draw(image).line((4, 28, 19, 5), fill=(25, 35, 65, 245), width=4)
    image.save(path)
    return hashlib.sha256(path.read_bytes()).hexdigest()


@unittest.skipUnless(PIL_AVAILABLE, "Pillow is optional")
class HandwritingCoverageTests(unittest.TestCase):
    def test_reports_complete_uppercase_digits_and_missing_lowercase(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = root / "assets"
            glyphs = {}
            for token in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/":
                path = assets / f"{ord(token)}.png"
                sha = _mark(path)
                glyphs[token] = [{"file": path.name, "sha256": sha}]
            name = assets / "name.png"
            signature = assets / "signature.png"
            name_sha = _mark(name)
            signature_sha = _mark(signature)
            atlas = {
                "schema": module.ATLAS_SCHEMA,
                "atlasId": "coverage-test",
                "assetRoot": str(assets),
                "glyphs": glyphs,
                "wholeMarks": {
                    "name": [{"file": name.name, "sha256": name_sha, "style": "natural"}],
                    "signature": [{"file": signature.name, "sha256": signature_sha}],
                },
            }
            atlas_path = root / "atlas.json"
            atlas_path.write_text(json.dumps(atlas), encoding="utf-8")
            report = module.inspect_coverage(atlas_path)
            self.assertTrue(report["coverage"]["completeUppercaseAlphabet"])
            self.assertTrue(report["coverage"]["completeDigits"])
            self.assertFalse(report["coverage"]["completeLowercaseAlphabet"])
            self.assertEqual(len(report["coverage"]["missingLowercase"]), 26)
            self.assertEqual(report["coverage"]["wholeNameVariantCount"], 1)
            self.assertEqual(report["coverage"]["wholeSignatureVariantCount"], 1)
            self.assertTrue(report["integrity"]["assetRootConfined"])
            self.assertFalse(report["integrity"]["privatePathsReturned"])
            self.assertFalse(report["truthBoundary"]["signatureSynthesizedFromGlyphs"])

    def test_rejects_changed_asset(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = root / "assets"
            path = assets / "A.png"
            sha = _mark(path)
            atlas_path = root / "atlas.json"
            atlas_path.write_text(json.dumps({
                "schema": module.ATLAS_SCHEMA,
                "atlasId": "tamper",
                "assetRoot": str(assets),
                "glyphs": {"A": [{"file": path.name, "sha256": sha}]},
                "wholeMarks": {},
            }), encoding="utf-8")
            path.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "sha256 mismatch"):
                module.inspect_coverage(atlas_path)


if __name__ == "__main__":
    unittest.main()
