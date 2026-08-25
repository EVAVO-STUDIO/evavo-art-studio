from __future__ import annotations

import importlib.util
import tempfile
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
    def test_default_spec_covers_lowercase_digits_fragments_names_and_signatures(self):
        module = _load_module()
        value = module.build_spec(profile_id="test")
        tokens = [slot["token"] for slot in value["slots"]]
        for token in "abcdefghijklmnopqrstuvwxyz0123456789":
            self.assertIn(token, tokens)
        self.assertIn(".com", tokens)
        self.assertIn("Jan", tokens)
        self.assertIn("Dec", tokens)
        self.assertEqual(tokens.count("FULL_NAME"), 4)
        self.assertEqual(tokens.count("SIGNATURE"), 4)
        self.assertTrue(value["acceptance"]["signatureMustRemainWholeCapture"])
        self.assertFalse(value["acceptance"]["syntheticStrokeGenerationAllowed"])

    def test_uppercase_is_opt_in(self):
        module = _load_module()
        without = module.build_spec(profile_id="test", include_uppercase=False)
        with_upper = module.build_spec(profile_id="test", include_uppercase=True)
        self.assertNotIn("A", [slot["token"] for slot in without["slots"]])
        self.assertIn("A", [slot["token"] for slot in with_upper["slots"]])
        self.assertGreater(len(with_upper["slots"]), len(without["slots"]))


if __name__ == "__main__":
    unittest.main()
