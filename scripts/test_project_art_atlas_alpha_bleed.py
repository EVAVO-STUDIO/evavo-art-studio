"""Regression coverage for hidden RGB safety in encoded sprite atlases."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from project_art_atlas_alpha_bleed import bleed_transparent_rgb
from project_art_atlas_contract import canonical_json, sha256_bytes, sha256_file
from project_art_atlas_execution import execute


AUTHORITY = {
    "sourceRead": True,
    "atlasWrite": True,
    "sourceMutation": False,
    "sourceDeletion": False,
    "repositoryMutation": False,
    "storageWrite": False,
    "providerExecution": False,
    "candidateApproval": False,
    "candidatePromotion": False,
    "deployment": False,
    "publication": False,
    "forcePush": False,
}


class ProjectArtAtlasAlphaBleedTests(unittest.TestCase):
    def test_bounded_bleed_preserves_alpha_and_visible_rgb(self) -> None:
        source = Image.new("RGBA", (9, 9), (255, 0, 255, 0))
        ImageDraw.Draw(source).rectangle((3, 3, 5, 5), fill=(20, 100, 220, 255))
        before_alpha = source.getchannel("A").tobytes()
        before_visible = source.getpixel((4, 4))
        output, evidence = bleed_transparent_rgb(
            source,
            enabled=True,
            radius=2,
            alpha_threshold=0,
        )
        try:
            self.assertEqual(output.getchannel("A").tobytes(), before_alpha)
            self.assertEqual(output.getpixel((4, 4)), before_visible)
            self.assertEqual(output.getpixel((2, 4)), (20, 100, 220, 0))
            self.assertEqual(output.getpixel((0, 0)), (255, 0, 255, 0))
            self.assertGreater(evidence["filledPixels"], 0)
            self.assertGreater(evidence["unreachedPixels"], 0)
            self.assertTrue(evidence["guarantees"]["alphaPreserved"])
            self.assertTrue(evidence["guarantees"]["strongerAlphaRgbPreserved"])
        finally:
            output.close()
            source.close()

    def test_encoded_atlas_and_extrusion_keep_subject_colour_under_zero_alpha(self) -> None:
        with tempfile.TemporaryDirectory(prefix="evavo-atlas-alpha-") as temporary:
            root = Path(temporary)
            source_root = root / "sources"
            source_root.mkdir()
            source_path = source_root / "diamond.png"
            source = Image.new("RGBA", (24, 24), (255, 0, 255, 0))
            ImageDraw.Draw(source).polygon(
                ((12, 2), (21, 12), (12, 21), (2, 12)),
                fill=(30, 90, 180, 255),
            )
            source.save(source_path, format="PNG")
            source.close()
            source_hash = sha256_file(source_path)
            source_bytes = source_path.stat().st_size

            body = {
                "schema": "evavo.project-art-atlas-plan.v1",
                "requestSchema": "evavo.project-art-atlas-request.v1",
                "atlasId": "alpha-safe",
                "projectId": "test-game",
                "outputName": "alpha-safe",
                "compiledAt": "2026-08-16T00:00:00.000Z",
                "allowedSourceRoots": [str(source_root.resolve())],
                "frames": [{
                    "id": "hero/idle/01",
                    "sourcePath": str(source_path.resolve()),
                    "contentSha256": source_hash,
                    "sizeBytes": source_bytes,
                    "pivot": {"x": 0.5, "y": 0.5},
                    "tags": ["alpha-regression"],
                }],
                "options": {
                    "alphaPolicy": "required",
                    "trimAlpha": True,
                    "alphaThreshold": 0,
                    "transparentRgbBleed": True,
                    "transparentRgbBleedRadius": 8,
                    "transparentRgbAlphaThreshold": 0,
                    "padding": 2,
                    "margin": 2,
                    "extrude": 1,
                    "powerOfTwo": True,
                    "square": False,
                    "allowRotation": False,
                    "maximumWidth": 64,
                    "maximumHeight": 64,
                    "outputFormat": "png",
                    "metadataFormats": [
                        "evavo",
                        "texturepacker-json-hash",
                        "phaser-json-hash",
                        "godot-region-map",
                    ],
                },
                "outputFiles": {
                    "image": "alpha-safe.png",
                    "manifest": "alpha-safe.atlas.json",
                    "texturePacker": "alpha-safe.texturepacker.json",
                    "phaser": "alpha-safe.phaser.json",
                    "godot": "alpha-safe.godot.json",
                    "receipt": "alpha-safe.receipt.json",
                },
                "limits": {
                    "maximumFrames": 20_000,
                    "maximumSourceBytes": 512 * 1024 * 1024,
                    "maximumTotalBytes": 16 * 1024 * 1024 * 1024,
                    "maximumDecodedPixelsPerFrame": 220_000_000,
                },
                "authority": AUTHORITY,
                "createOnlyOutput": True,
                "atomicPublication": True,
                "bytesFlowThroughMcp": False,
            }
            plan = {
                **body,
                "planSha256": sha256_bytes(canonical_json(body).encode("utf-8")),
            }
            plan_bytes = (json.dumps(plan, indent=2) + "\n").encode("utf-8")
            output_root = root / "atlas"
            receipt = execute(plan, plan_bytes, output_root)

            self.assertEqual(sha256_file(source_path), source_hash)
            self.assertEqual(source_path.stat().st_size, source_bytes)
            summary = receipt["transparentRgbBleed"]
            self.assertTrue(summary["enabled"])
            self.assertTrue(summary["alphaPreserved"])
            self.assertTrue(summary["strongerAlphaRgbPreserved"])
            self.assertTrue(summary["exactRgbaAtlasPaste"])
            self.assertGreater(summary["filledPixels"], 0)

            manifest = json.loads((output_root / "alpha-safe.atlas.json").read_text("utf-8"))
            frame = manifest["frames"]["hero/idle/01"]
            evidence = frame["transparentRgbBleed"]
            self.assertTrue(evidence["applied"])
            self.assertGreater(evidence["filledPixels"], 0)
            self.assertEqual(evidence["alphaThreshold"], 0)

            region = frame["frame"]
            atlas = Image.open(output_root / "alpha-safe.png").convert("RGBA")
            try:
                x = int(region["x"])
                y = int(region["y"])
                hidden_inside = atlas.getpixel((x, y))
                hidden_extruded = atlas.getpixel((x - 1, y))
                untouched_canvas = atlas.getpixel((0, 0))
                self.assertEqual(hidden_inside, (30, 90, 180, 0))
                self.assertEqual(hidden_extruded, (30, 90, 180, 0))
                self.assertEqual(untouched_canvas, (0, 0, 0, 0))
            finally:
                atlas.close()


if __name__ == "__main__":
    unittest.main()
