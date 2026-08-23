from __future__ import annotations

import ast
import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "premultiplied_alpha_interpolate.py"


class PremultipliedAlphaInterpolationContractTests(unittest.TestCase):
    def test_tool_is_non_networked_non_shell_and_create_only(self) -> None:
        source = TOOL.read_text(encoding="utf-8")
        tree = ast.parse(source)
        imports: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name.split(".", 1)[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module.split(".", 1)[0])

        self.assertFalse({"subprocess", "socket", "urllib", "requests", "http", "ftplib"} & imports)
        for forbidden in (
            "os.system(",
            "Popen(",
            "subprocess.",
            "git commit",
            "git push",
            "providerExecution\": True",
            "automaticApproval\": True",
            "candidatePromotion\": True",
            "runtimeActivation\": True",
            "websiteActivation\": True",
        ):
            self.assertNotIn(forbidden, source)

        for required in (
            'PLAN_SCHEMA = "evavo.premultiplied-alpha-interpolation-plan.v1"',
            'RECEIPT_SCHEMA = "evavo.premultiplied-alpha-interpolation-receipt.v1"',
            'before.convert("RGBa")',
            'after.convert("RGBa")',
            "Image.blend(before_pm, after_pm, amount).convert(\"RGBA\")",
            'if output_path.exists() or receipt_path.exists():',
            'fail("output and receipt are create-only")',
            '"sourceOverwrite": False',
            '"providerExecution": False',
            '"automaticApproval": False',
            '"candidatePromotion": False',
            '"runtimeActivation": False',
            '"websiteActivation": False',
            '"forcePush": False',
        ):
            self.assertIn(required, source)

    def test_transparent_endpoint_does_not_bleed_hidden_rgb(self) -> None:
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow is owned by the managed image-finishing environment")

        spec = importlib.util.spec_from_file_location("evavo_premultiplied_alpha_interpolate", TOOL)
        self.assertIsNotNone(spec)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        try:
            before = Image.new("RGBA", (1, 1), (255, 0, 0, 0))
            after = Image.new("RGBA", (1, 1), (0, 0, 255, 255))
            midpoint = module.interpolate(before, after, 0.5)
            red, green, blue, alpha = midpoint.getpixel((0, 0))
            self.assertEqual(red, 0)
            self.assertEqual(green, 0)
            self.assertGreaterEqual(blue, 254)
            self.assertIn(alpha, (127, 128))
        finally:
            sys.modules.pop(spec.name, None)

    def test_endpoint_amounts_preserve_visible_pixels(self) -> None:
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow is owned by the managed image-finishing environment")

        spec = importlib.util.spec_from_file_location("evavo_premultiplied_alpha_interpolate_endpoints", TOOL)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        try:
            before = Image.new("RGBA", (2, 1), (12, 34, 56, 255))
            after = Image.new("RGBA", (2, 1), (78, 90, 123, 255))
            self.assertEqual(list(module.interpolate(before, after, 0.0).getdata()), list(before.getdata()))
            self.assertEqual(list(module.interpolate(before, after, 1.0).getdata()), list(after.getdata()))
        finally:
            sys.modules.pop(spec.name, None)


if __name__ == "__main__":
    unittest.main()
