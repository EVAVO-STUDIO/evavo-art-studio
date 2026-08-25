from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "handwriting_capture_spec.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("handwriting_capture_spec", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class HandwritingCaptureSpecTests(unittest.TestCase):
    def test_default_spec_targets_three_lowercase_and_punctuation_variants(self):
        module = _load_module()
        value = module.build_spec(profile_id="test")
        tokens = [slot["token"] for slot in value["slots"]]
        for token in "abcdefghijklmnopqrstuvwxyz0123456789":
            self.assertIn(token, tokens)
        self.assertEqual(tokens.count("a"), 3)
        self.assertEqual(tokens.count("z"), 3)
        self.assertEqual(tokens.count("0"), 3)
        self.assertEqual(tokens.count("/"), 3)
        self.assertEqual(tokens.count("@"), 3)
        self.assertIn(".com", tokens)
        self.assertIn("Jan", tokens)
        self.assertIn("Dec", tokens)
        self.assertEqual(tokens.count(".com"), 2)
        self.assertEqual(tokens.count("FULL_NAME"), 4)
        self.assertEqual(tokens.count("SIGNATURE"), 4)
        self.assertEqual(value["captureIntent"], "variation-rich-genuine-handwriting-bank")
        self.assertEqual(value["acceptance"]["minimumVariants"]["lowercase"], 3)
        self.assertEqual(value["acceptance"]["minimumVariants"]["punctuation"], 3)
        self.assertTrue(value["acceptance"]["signatureMustRemainWholeCapture"])
        self.assertFalse(value["acceptance"]["syntheticStrokeGenerationAllowed"])

    def test_uppercase_is_opt_in_and_defaults_to_three_variants(self):
        module = _load_module()
        without = module.build_spec(profile_id="test", include_uppercase=False)
        with_upper = module.build_spec(profile_id="test", include_uppercase=True)
        self.assertNotIn("A", [slot["token"] for slot in without["slots"]])
        upper_tokens = [slot["token"] for slot in with_upper["slots"]]
        self.assertEqual(upper_tokens.count("A"), 3)
        self.assertEqual(upper_tokens.count("Z"), 3)
        self.assertGreater(len(with_upper["slots"]), len(without["slots"]))

    def test_variant_targets_are_configurable_without_generating_samples(self):
        module = _load_module()
        value = module.build_spec(
            profile_id="test",
            include_uppercase=True,
            lowercase_variants=4,
            uppercase_variants=5,
            punctuation_variants=2,
        )
        tokens = [slot["token"] for slot in value["slots"]]
        self.assertEqual(tokens.count("a"), 4)
        self.assertEqual(tokens.count("A"), 5)
        self.assertEqual(tokens.count("/"), 2)
        self.assertFalse(value["acceptance"]["syntheticStrokeGenerationAllowed"])

    def test_variant_targets_fail_outside_safe_bounds(self):
        module = _load_module()
        for bad in (0, 7):
            with self.assertRaisesRegex(ValueError, "between 1 and 6"):
                module.build_spec(profile_id="test", lowercase_variants=bad)


if __name__ == "__main__":
    unittest.main()
