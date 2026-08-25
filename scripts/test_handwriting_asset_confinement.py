from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load(relative: str, name: str):
    path = ROOT / relative
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class HandwritingAssetConfinementTests(unittest.TestCase):
    def test_atlas_rejects_windows_drive_and_parent_escape_cross_platform(self) -> None:
        module = _load("tools/handwriting_atlas.py", "atlas_confinement")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for value in (r"C:\\private\\A.png", r"..\\private\\A.png", "/private/A.png", r"\\server\\share\\A.png"):
                with self.assertRaises(ValueError, msg=value):
                    module._safe_asset(root, value)

    def test_whole_mark_rejects_windows_drive_and_parent_escape_cross_platform(self) -> None:
        module = _load("tools/handwriting_whole_mark.py", "whole_mark_confinement")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for value in (r"C:\\private\\sig.png", r"..\\private\\sig.png", "/private/sig.png", r"\\server\\share\\sig.png"):
                with self.assertRaises(ValueError, msg=value):
                    module._safe_asset(root, value)


if __name__ == "__main__":
    unittest.main()
