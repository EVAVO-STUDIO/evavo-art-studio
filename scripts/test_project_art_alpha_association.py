"""Regression coverage for straight and premultiplied alpha conversion."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from run_project_art_sandbox import (  # noqa: E402
    SandboxError,
    alpha_premultiply,
    alpha_unpremultiply,
    apply_operation,
)


class ProjectArtAlphaAssociationTests(unittest.TestCase):
    def test_premultiply_is_exact_and_does_not_mutate_source(self) -> None:
        source = Image.new("RGBA", (3, 1))
        source.putdata(
            [
                (200, 100, 50, 128),
                (19, 201, 73, 255),
                (99, 88, 77, 0),
            ]
        )
        before = source.tobytes()
        output = alpha_premultiply(source, {"op": "alpha-premultiply"})
        try:
            self.assertEqual(source.tobytes(), before)
            self.assertEqual(
                list(output.getdata()),
                [
                    (100, 50, 25, 128),
                    (19, 201, 73, 255),
                    (0, 0, 0, 0),
                ],
            )
        finally:
            output.close()
            source.close()

    def test_unpremultiply_is_exact_for_valid_associated_pixels(self) -> None:
        source = Image.new("RGBA", (3, 1))
        source.putdata(
            [
                (100, 50, 25, 128),
                (19, 201, 73, 255),
                (0, 0, 0, 0),
            ]
        )
        output = alpha_unpremultiply(
            source,
            {"op": "alpha-unpremultiply", "mode": "strict"},
        )
        try:
            self.assertEqual(
                list(output.getdata()),
                [
                    (199, 100, 50, 128),
                    (19, 201, 73, 255),
                    (0, 0, 0, 0),
                ],
            )
        finally:
            output.close()
            source.close()

    def test_strict_unpremultiply_rejects_invalid_associated_pixels(self) -> None:
        for pixel, message in (
            ((200, 10, 0, 100), "premultiplied-alpha invariant"),
            ((1, 0, 0, 0), "non-zero RGB at alpha zero"),
        ):
            with self.subTest(pixel=pixel):
                source = Image.new("RGBA", (1, 1), pixel)
                try:
                    with self.assertRaisesRegex(SandboxError, message):
                        alpha_unpremultiply(
                            source,
                            {"op": "alpha-unpremultiply", "mode": "strict"},
                        )
                finally:
                    source.close()

    def test_clamp_mode_is_explicit_and_dispatchable(self) -> None:
        source = Image.new("RGBA", (2, 1))
        source.putdata([(200, 10, 0, 100), (9, 8, 7, 0)])
        output = apply_operation(
            source,
            {"op": "alpha-unpremultiply", "mode": "clamp"},
        )
        try:
            self.assertEqual(
                list(output.getdata()),
                [(255, 26, 0, 100), (0, 0, 0, 0)],
            )
        finally:
            output.close()
            source.close()

    def test_unknown_modes_fail_closed(self) -> None:
        source = Image.new("RGBA", (1, 1), (1, 1, 1, 1))
        try:
            with self.assertRaisesRegex(SandboxError, "must be nearest"):
                alpha_premultiply(
                    source,
                    {"op": "alpha-premultiply", "mode": "floor"},
                )
            with self.assertRaisesRegex(SandboxError, "must be strict or clamp"):
                alpha_unpremultiply(
                    source,
                    {"op": "alpha-unpremultiply", "mode": "guess"},
                )
        finally:
            source.close()


if __name__ == "__main__":
    unittest.main()
