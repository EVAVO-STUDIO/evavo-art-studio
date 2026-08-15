import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "raw_art_visual_catalog.py"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class RawArtVisualCatalogTests(unittest.TestCase):
    def fixture(self, root: Path) -> tuple[Path, dict[str, str]]:
        raw = root / "raw_Art"
        (raw / "fighters").mkdir(parents=True)
        first = raw / "fighters" / "bastion-idle.png"
        second = raw / "fighters" / "viper-idle.png"
        third = raw / "title.png"
        Image.new("RGBA", (48, 64), (190, 35, 24, 255)).save(first)
        transparent = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        for x in range(12, 52):
            for y in range(8, 58):
                transparent.putpixel((x, y), (25, 170, 210, 255))
        transparent.save(second)
        Image.new("RGB", (96, 32), (16, 16, 18)).save(third)
        return raw, {str(path.relative_to(raw)): digest(path) for path in (first, second, third)}

    def command(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, str(SCRIPT), *arguments], text=True, capture_output=True, check=False)

    def test_build_and_verify_catalog_without_mutating_sources(self) -> None:
        with tempfile.TemporaryDirectory(prefix="evavo-raw-art-visual-") as value:
            root = Path(value)
            raw, before = self.fixture(root)
            output = root / "evidence" / "catalog-001"
            output.parent.mkdir()
            built = self.command("build", "--raw-art-root", str(raw), "--output-root", str(output), "--project-id", "steel-dominion", "--packet-size", "4")
            self.assertEqual(built.returncode, 0, built.stderr)
            summary = json.loads(built.stdout)
            self.assertEqual(summary["totals"]["pngFiles"], 3)
            self.assertFalse(summary["sourceMutation"])
            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["schema"], "evavo.raw-art-visual-catalog.v1")
            self.assertEqual(len(manifest["files"]), 3)
            self.assertEqual(len(manifest["reviewPackets"]), 1)
            self.assertTrue((output / "index.html").is_file())
            self.assertTrue((output / "contact-sheets" / "packet-0001.png").is_file())
            verified = self.command("verify", "--output-root", str(output), "--raw-art-root", str(raw))
            self.assertEqual(verified.returncode, 0, verified.stderr)
            verification = json.loads(verified.stdout)
            self.assertEqual(verification["sourcesVerified"], 3)
            after = {str(path.relative_to(raw)): digest(path) for path in raw.rglob("*.png")}
            self.assertEqual(before, after)

    def test_output_inside_raw_art_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory(prefix="evavo-raw-art-visual-") as value:
            root = Path(value)
            raw, _ = self.fixture(root)
            failed = self.command("build", "--raw-art-root", str(raw), "--output-root", str(raw / "generated"))
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("completely disjoint", failed.stderr)

    def test_tampered_preview_fails_verification(self) -> None:
        with tempfile.TemporaryDirectory(prefix="evavo-raw-art-visual-") as value:
            root = Path(value)
            raw, _ = self.fixture(root)
            output = root / "catalog"
            built = self.command("build", "--raw-art-root", str(raw), "--output-root", str(output))
            self.assertEqual(built.returncode, 0, built.stderr)
            preview = next((output / "thumbnails").glob("*.png"))
            preview.write_bytes(b"tampered")
            failed = self.command("verify", "--output-root", str(output))
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("identity differs", failed.stderr)


if __name__ == "__main__":
    unittest.main()
