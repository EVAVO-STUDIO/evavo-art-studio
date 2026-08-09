#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("pixel_font_studio.py")
SPEC = Path(__file__).parents[1] / "examples" / "brass-brine-pixel-font-family.v1.json"
module_spec = importlib.util.spec_from_file_location("pixel_font_studio", MODULE_PATH)
assert module_spec and module_spec.loader
studio = importlib.util.module_from_spec(module_spec)
sys.modules[module_spec.name] = studio
module_spec.loader.exec_module(studio)

class PixelFontStudioTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = Path(tempfile.mkdtemp(prefix="evavo-pixel-font-test-"))
    def tearDown(self) -> None:
        shutil.rmtree(self.temp, ignore_errors=True)
    def test_compile_verify_and_expected_family(self) -> None:
        output = self.temp / "family"
        manifest = studio.compile_family(SPEC, output)
        self.assertEqual(manifest["schema"], studio.MANIFEST_SCHEMA)
        self.assertEqual(manifest["familyId"], "brass-brine-dos")
        self.assertEqual(len(manifest["fonts"]), 5)
        self.assertEqual(studio.verify_family(output / "pixel-font-family.manifest.json")["status"], "passed")
        self.assertTrue((output / "brass-brine-dos.theme.tres").is_file())
        for font_id in ["bb_dos_display", "bb_dos_ui", "bb_dos_ledger", "bb_dos_micro", "bb_dos_symbols"]:
            parsed = studio.parse_fnt((output / f"{font_id}.fnt").read_text(encoding="utf-8"))
            self.assertGreater(len(parsed["chars"]), 90)
            self.assertTrue((output / f"{font_id}.png").is_file())
    def test_output_is_reproducible(self) -> None:
        first, second = self.temp / "first", self.temp / "second"
        studio.compile_family(SPEC, first); studio.compile_family(SPEC, second)
        names = sorted(path.name for path in first.iterdir() if path.name != ".evavo-pixel-font-generated")
        self.assertEqual(names, sorted(path.name for path in second.iterdir() if path.name != ".evavo-pixel-font-generated"))
        for name in names: self.assertEqual((first / name).read_bytes(), (second / name).read_bytes(), name)
    def test_existing_output_requires_explicit_generated_replace(self) -> None:
        output = self.temp / "family"; studio.compile_family(SPEC, output)
        with self.assertRaisesRegex(studio.PixelFontError, "already exists"): studio.compile_family(SPEC, output)
        studio.compile_family(SPEC, output, replace=True)
        other = self.temp / "other"; other.mkdir()
        with self.assertRaisesRegex(studio.PixelFontError, "generated marker"): studio.compile_family(SPEC, other, replace=True)
    def test_tampered_atlas_fails_manifest_identity(self) -> None:
        output = self.temp / "family"; studio.compile_family(SPEC, output)
        atlas = output / "bb_dos_ui.png"; data = bytearray(atlas.read_bytes()); data[-8] ^= 1; atlas.write_bytes(data)
        with self.assertRaisesRegex(studio.PixelFontError, "manifest identity differs"): studio.verify_family(output / "pixel-font-family.manifest.json")
    def test_non_integer_godot_size_is_rejected(self) -> None:
        raw = json.loads(SPEC.read_text(encoding="utf-8")); raw["fonts"][1]["theme"]["fontSize"] = 14
        with self.assertRaisesRegex(studio.PixelFontError, "integer multiple"): studio.normalize_spec(raw)
    def test_wrong_glyph_master_pin_is_rejected(self) -> None:
        raw = json.loads(SPEC.read_text(encoding="utf-8")); raw["glyphMasterSha256"] = "0" * 64
        wrong = self.temp / "wrong.json"; wrong.write_text(json.dumps(raw), encoding="utf-8")
        with self.assertRaisesRegex(studio.PixelFontError, "pin the current EVAVO"): studio.compile_family(wrong, self.temp / "wrong-output")
    def test_provider_brief_is_reference_only(self) -> None:
        destination = self.temp / "brief.json"; brief = studio.provider_brief(SPEC, destination)
        self.assertFalse(brief["authority"]["providerExecution"]); self.assertFalse(brief["authority"]["runtimeFontCreation"])
        studio.verify_document_hash(brief, "briefSha256")
        with self.assertRaisesRegex(studio.PixelFontError, "must not already exist"): studio.provider_brief(SPEC, destination)

if __name__ == "__main__": unittest.main()
