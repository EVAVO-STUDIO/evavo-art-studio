#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import io
import os
import stat
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("safe_extract_archive.py")
SPEC = importlib.util.spec_from_file_location("safe_extract_archive", MODULE_PATH)
assert SPEC and SPEC.loader
safe = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = safe
SPEC.loader.exec_module(safe)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class SafeArchiveExtractionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def zip_path(self, name: str = "input.zip") -> Path:
        return self.root / name

    def extract(self, archive: Path, destination: str = "output", **kwargs):
        return safe.extract_archive(
            archive_path=str(archive),
            destination=str(self.root / destination),
            expected_sha256=sha256(archive),
            archive_format=kwargs.pop("archive_format", "auto"),
            limits=kwargs.pop("limits", safe.Limits()),
            **kwargs,
        )

    def assert_code(self, code: str, callable_):
        with self.assertRaises(safe.SafeArchiveError) as raised:
            callable_()
        self.assertEqual(raised.exception.code, code)

    def test_extracts_valid_zip_create_only(self) -> None:
        archive = self.zip_path()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr("bin/tool", b"tool-bytes")
            bundle.writestr("share/readme.txt", b"readme")
        receipt = self.extract(archive)
        self.assertEqual((self.root / "output/bin/tool").read_bytes(), b"tool-bytes")
        self.assertEqual(receipt["archiveSha256"], sha256(archive))
        self.assertEqual(receipt["fileCount"], 2)
        self.assertTrue(receipt["createOnly"])
        sentinel = self.root / "output/sentinel"
        sentinel.write_text("keep", encoding="utf-8")
        self.assert_code(
            "SAFE_ARCHIVE_DESTINATION_EXISTS",
            lambda: self.extract(archive),
        )
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

    def test_rejects_hash_mismatch_without_destination(self) -> None:
        archive = self.zip_path()
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr("file.txt", b"data")
        self.assert_code(
            "SAFE_ARCHIVE_SHA256_MISMATCH",
            lambda: safe.extract_archive(
                archive_path=str(archive),
                destination=str(self.root / "output"),
                expected_sha256="0" * 64,
                archive_format="zip",
            ),
        )
        self.assertFalse((self.root / "output").exists())

    def test_rejects_traversal_and_case_collisions(self) -> None:
        traversal = self.zip_path("traversal.zip")
        with zipfile.ZipFile(traversal, "w") as bundle:
            bundle.writestr("../escape.txt", b"escape")
        self.assert_code(
            "SAFE_ARCHIVE_MEMBER_PATH_INVALID",
            lambda: self.extract(traversal, "traversal-output"),
        )
        self.assertFalse((self.root / "escape.txt").exists())
        self.assertFalse((self.root / "traversal-output").exists())

        collision = self.zip_path("collision.zip")
        with zipfile.ZipFile(collision, "w") as bundle:
            bundle.writestr("Asset.txt", b"one")
            bundle.writestr("asset.txt", b"two")
        self.assert_code(
            "SAFE_ARCHIVE_MEMBER_COLLISION",
            lambda: self.extract(collision, "collision-output"),
        )
        self.assertFalse((self.root / "collision-output").exists())

    def test_rejects_zip_symlink_and_compression_bomb(self) -> None:
        symlink = self.zip_path("symlink.zip")
        with zipfile.ZipFile(symlink, "w") as bundle:
            info = zipfile.ZipInfo("link")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            bundle.writestr(info, "target")
        self.assert_code(
            "SAFE_ARCHIVE_SPECIAL_MEMBER",
            lambda: self.extract(symlink, "symlink-output"),
        )

        bomb = self.zip_path("bomb.zip")
        with zipfile.ZipFile(bomb, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr("zeros.bin", b"0" * (1024 * 1024))
        self.assert_code(
            "SAFE_ARCHIVE_COMPRESSION_RATIO_EXCEEDED",
            lambda: self.extract(
                bomb,
                "bomb-output",
                limits=safe.Limits(max_compression_ratio=10.0),
            ),
        )

    def test_extracts_valid_tar_and_rejects_links(self) -> None:
        archive = self.root / "input.tar"
        payload = b"tar-data"
        with tarfile.open(archive, "w") as bundle:
            info = tarfile.TarInfo("dir/file.txt")
            info.size = len(payload)
            bundle.addfile(info, io.BytesIO(payload))
        receipt = self.extract(archive, "tar-output", archive_format="tar")
        self.assertEqual((self.root / "tar-output/dir/file.txt").read_bytes(), payload)
        self.assertEqual(receipt["format"], "tar")

        linked = self.root / "linked.tar"
        with tarfile.open(linked, "w") as bundle:
            info = tarfile.TarInfo("link")
            info.type = tarfile.SYMTYPE
            info.linkname = "target"
            bundle.addfile(info)
        self.assert_code(
            "SAFE_ARCHIVE_SPECIAL_MEMBER",
            lambda: self.extract(linked, "linked-output", archive_format="tar"),
        )

    def test_rejects_empty_and_hard_linked_archives(self) -> None:
        empty = self.zip_path("empty.zip")
        with zipfile.ZipFile(empty, "w"):
            pass
        self.assert_code(
            "SAFE_ARCHIVE_EMPTY",
            lambda: self.extract(empty, "empty-output"),
        )

        linked = self.zip_path("linked.zip")
        with zipfile.ZipFile(linked, "w") as bundle:
            bundle.writestr("file.txt", b"data")
        hard_link = self.root / "linked-copy.zip"
        os.link(linked, hard_link)
        self.assert_code(
            "SAFE_ARCHIVE_INPUT_INVALID",
            lambda: self.extract(linked, "hard-link-output"),
        )


if __name__ == "__main__":
    unittest.main()
