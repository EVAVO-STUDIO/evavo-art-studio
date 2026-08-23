from __future__ import annotations

import ast
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "premultiplied_alpha_resize.py"


class PremultipliedAlphaResizeContractTests(unittest.TestCase):
    def test_tool_is_non_networked_downsample_only_and_create_only(self) -> None:
        source = TOOL.read_text(encoding="utf-8")
        tree = ast.parse(source)
        imports: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name.split(".", 1)[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module.split(".", 1)[0])
        self.assertFalse({"subprocess", "socket", "urllib", "requests", "http", "ftplib"} & imports)
        for required in (
            'PLAN_SCHEMA = "evavo.premultiplied-alpha-resize-plan.v1"',
            'RECEIPT_SCHEMA = "evavo.premultiplied-alpha-resize-receipt.v1"',
            'source.convert("RGBa")',
            "Image.Resampling.BOX",
            'fail("premultiplied-alpha-area resize is downsample-only")',
            '"transparentRgbCleared": True',
            '"sourceOverwrite": False',
            '"providerExecution": False',
            '"automaticApproval": False',
            '"candidatePromotion": False',
            '"runtimeActivation": False',
            '"websiteActivation": False',
        ):
            self.assertIn(required, source)

    def _load(self):
        try:
            from PIL import Image  # noqa: F401
        except ImportError:
            self.skipTest("Pillow is owned by the managed image-finishing environment")
        spec = importlib.util.spec_from_file_location("evavo_premultiplied_alpha_resize", TOOL)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        self.addCleanup(lambda: sys.modules.pop(spec.name, None))
        return module

    def test_area_downsample_prevents_hidden_rgb_bleed(self) -> None:
        from PIL import Image

        module = self._load()
        source = Image.new("RGBA", (2, 1))
        source.putdata([(255, 0, 0, 0), (0, 0, 255, 255)])
        output = module.resize_premultiplied_area(source, 1, 1)
        red, green, blue, alpha = output.getpixel((0, 0))
        self.assertEqual(red, 0)
        self.assertEqual(green, 0)
        self.assertGreaterEqual(blue, 254)
        self.assertIn(alpha, (127, 128))

    def test_fully_transparent_output_rgb_is_cleared(self) -> None:
        from PIL import Image

        module = self._load()
        source = Image.new("RGBA", (2, 2), (123, 45, 67, 0))
        output = module.resize_premultiplied_area(source, 1, 1)
        self.assertEqual(output.getpixel((0, 0)), (0, 0, 0, 0))

    def test_upscale_is_rejected(self) -> None:
        from PIL import Image

        module = self._load()
        source = Image.new("RGBA", (2, 2), (1, 2, 3, 255))
        with self.assertRaisesRegex(ValueError, "downsample-only"):
            module.resize_premultiplied_area(source, 3, 3)


if __name__ == "__main__":
    unittest.main()
