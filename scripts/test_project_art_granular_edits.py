from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

from PIL import Image


TOOLS_PATH = Path(__file__).resolve().parents[1] / "tools"
MODULE_PATH = TOOLS_PATH / "run_project_art_sandbox.py"
sys.path.insert(0, str(TOOLS_PATH))
SPEC = importlib.util.spec_from_file_location("project_art_sandbox", MODULE_PATH)
assert SPEC and SPEC.loader
SANDBOX = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SANDBOX)


class GranularEditTests(unittest.TestCase):
    def test_alpha_clean_makes_canonical_binary_alpha(self) -> None:
        image = Image.new("RGBA", (3, 1))
        image.putdata([(10, 20, 30, 0), (40, 50, 60, 95), (70, 80, 90, 96)])
        result = SANDBOX.apply_operation(image, {"op": "alpha-clean", "threshold": 96})
        self.assertEqual(list(result.get_flattened_data()), [(0, 0, 0, 0), (0, 0, 0, 0), (70, 80, 90, 255)])

    def test_chroma_to_alpha_preserves_cyan_effects_and_opaque_shadows(self) -> None:
        image = Image.new("RGBA", (3, 1))
        image.putdata([(10, 80, 10, 40), (10, 70, 90, 40), (80, 90, 60, 200)])
        result = SANDBOX.apply_operation(image, {"op": "chroma-to-alpha", "channel": "green", "maximumAlpha": 95})
        self.assertEqual(result.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertEqual(result.getpixel((1, 0)), (10, 70, 90, 40))
        self.assertEqual(result.getpixel((2, 0)), (80, 90, 60, 200))

    def test_component_prune_removes_only_small_islands(self) -> None:
        image = Image.new("RGBA", (5, 3), (0, 0, 0, 0))
        image.putpixel((0, 0), (255, 0, 0, 255))
        for x, y in ((2, 1), (3, 1), (2, 2), (3, 2)):
            image.putpixel((x, y), (0, 0, 255, 255))
        result = SANDBOX.apply_operation(image, {"op": "component-prune", "minimumPixels": 2})
        self.assertEqual(result.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertEqual(result.getpixel((2, 1)), (0, 0, 255, 255))

    def test_selection_clear_fill_and_clone_stamp(self) -> None:
        image = Image.new("RGBA", (4, 2), (10, 10, 10, 255))
        filled = SANDBOX.apply_operation(image, {"op": "rect-fill", "x": 0, "y": 0, "width": 2, "height": 1, "colour": "#ff0000ff"})
        cloned = SANDBOX.apply_operation(filled, {"op": "clone-stamp", "source": {"x": 0, "y": 0, "width": 2, "height": 1}, "destination": {"x": 2, "y": 1}})
        cleared = SANDBOX.apply_operation(cloned, {"op": "rect-clear", "x": 0, "y": 0, "width": 1, "height": 1})
        self.assertEqual(cleared.getpixel((0, 0)), (0, 0, 0, 0))
        self.assertEqual(cleared.getpixel((2, 1)), (255, 0, 0, 255))


if __name__ == "__main__":
    unittest.main()
