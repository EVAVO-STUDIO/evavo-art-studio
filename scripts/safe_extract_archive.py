#!/usr/bin/env python3
"""Create-only, bounded ZIP/TAR extraction for governed CI workflows."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import sys
import tarfile
import tempfile
import zipfile
from typing import BinaryIO

from safe_archive_contract import (
    SCHEMA, SHA256_RE, COPY_CHUNK_BYTES,
    DEFAULT_MAX_ARCHIVE_BYTES, DEFAULT_MAX_MEMBERS, DEFAULT_MAX_FILES,
    DEFAULT_MAX_TOTAL_BYTES, DEFAULT_MAX_FILE_BYTES,
    DEFAULT_MAX_COMPRESSION_RATIO, DEFAULT_MAX_PATH_BYTES,
    DEFAULT_MAX_PATH_DEPTH, Entry, Limits, SafeArchiveError, fail,
    _copy_stream, _create_directory, _destination_parent, _fsync_parent,
    _fsync_tree, _hash_descriptor, _publish_no_replace, _safe_member_path,
    _same_identity, _stable_archive, _validate_entries,
    _ensure_parent_directories,
)


def _zip_entries(archive: zipfile.ZipFile, limits: Limits) -> list[Entry]:
    entries: list[Entry] = []
    for info in archive.infolist():
        is_directory = info.is_dir()
        path = _safe_member_path(info.filename, is_directory, limits)
        if info.flag_bits & 0x1:
            fail("SAFE_ARCHIVE_ENCRYPTED_MEMBER", f"Encrypted member is forbidden: {path}")
        mode = (info.external_attr >> 16) & 0xFFFF
        file_type = stat.S_IFMT(mode)
        if file_type == stat.S_IFLNK:
            fail("SAFE_ARCHIVE_SPECIAL_MEMBER", f"Symbolic link is forbidden: {path}")
        if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
            fail("SAFE_ARCHIVE_SPECIAL_MEMBER", f"Special member is forbidden: {path}")
        entries.append(
            Entry(
                source=info,
                path=path,
                is_directory=is_directory,
                size=0 if is_directory else info.file_size,
                compressed_size=0 if is_directory else info.compress_size,
                executable=bool(mode & 0o111),
            )
        )
    validated, _, _ = _validate_entries(entries, limits)
    return validated


def _tar_entries(archive: tarfile.TarFile, limits: Limits, archive_bytes: int) -> list[Entry]:
    entries: list[Entry] = []
    for index, member in enumerate(archive, start=1):
        if index > limits.max_members:
            fail("SAFE_ARCHIVE_MEMBER_LIMIT_EXCEEDED")
        if member.isdir():
            is_directory = True
        elif member.isreg():
            is_directory = False
        else:
            fail("SAFE_ARCHIVE_SPECIAL_MEMBER", f"Special TAR member is forbidden: {member.name}")
        if getattr(member, "sparse", None):
            fail("SAFE_ARCHIVE_SPECIAL_MEMBER", f"Sparse TAR member is forbidden: {member.name}")
        path = _safe_member_path(member.name, is_directory, limits)
        entries.append(
            Entry(
                source=member,
                path=path,
                is_directory=is_directory,
                size=0 if is_directory else member.size,
                compressed_size=None,
                executable=bool(member.mode & 0o111),
            )
        )
    validated, _, total_bytes = _validate_entries(entries, limits)
    if archive_bytes > 0 and total_bytes / archive_bytes > limits.max_compression_ratio:
        fail("SAFE_ARCHIVE_COMPRESSION_RATIO_EXCEEDED")
    return validated


def _extract_zip(file_object: BinaryIO, root: str, limits: Limits) -> tuple[list[dict[str, object]], int]:
    records: list[dict[str, object]] = []
    with zipfile.ZipFile(file_object, mode="r") as archive:
        entries = _zip_entries(archive, limits)
        for entry in entries:
            target = os.path.join(root, *entry.path.split("/"))
            if entry.is_directory:
                _create_directory(root, entry.path)
                continue
            _ensure_parent_directories(root, entry.path)
            with archive.open(entry.source, mode="r") as source:
                evidence = _copy_stream(source, target, entry.size, entry.executable)
            records.append({"path": entry.path, **evidence})
    return records, len(entries)


def _extract_tar(file_object: BinaryIO, root: str, limits: Limits, archive_bytes: int) -> tuple[list[dict[str, object]], int]:
    records: list[dict[str, object]] = []
    with tarfile.open(fileobj=file_object, mode="r:*") as archive:
        entries = _tar_entries(archive, limits, archive_bytes)
        for entry in entries:
            target = os.path.join(root, *entry.path.split("/"))
            if entry.is_directory:
                _create_directory(root, entry.path)
                continue
            _ensure_parent_directories(root, entry.path)
            source = archive.extractfile(entry.source)
            if source is None:
                fail("SAFE_ARCHIVE_MEMBER_READ_FAILED")
            with source:
                evidence = _copy_stream(source, target, entry.size, entry.executable)
            records.append({"path": entry.path, **evidence})
    return records, len(entries)


def extract_archive(
    *,
    archive_path: str,
    destination: str,
    expected_sha256: str,
    archive_format: str = "auto",
    limits: Limits = Limits(),
) -> dict[str, object]:
    if not SHA256_RE.fullmatch(expected_sha256):
        fail("SAFE_ARCHIVE_SHA256_INVALID")
    if archive_format not in {"auto", "zip", "tar"}:
        fail("SAFE_ARCHIVE_FORMAT_INVALID")

    descriptor = -1
    staging: str | None = None
    published = False
    try:
        target, parent = _destination_parent(destination)
        descriptor, before = _stable_archive(archive_path, limits)
        staging = tempfile.mkdtemp(
            prefix=f".{os.path.basename(target)}.staging-",
            dir=parent,
        )
        actual_sha256 = _hash_descriptor(descriptor)
        if actual_sha256 != expected_sha256:
            fail("SAFE_ARCHIVE_SHA256_MISMATCH")
        selected_format = archive_format
        if selected_format == "auto":
            prefix = os.read(descriptor, 4)
            os.lseek(descriptor, 0, os.SEEK_SET)
            selected_format = "zip" if prefix.startswith(b"PK") else "tar"

        with os.fdopen(os.dup(descriptor), "rb", closefd=True) as file_object:
            if selected_format == "zip":
                records, member_count = _extract_zip(file_object, staging, limits)
            else:
                records, member_count = _extract_tar(
                    file_object,
                    staging,
                    limits,
                    before.st_size,
                )

        _same_identity(before, os.fstat(descriptor), "SAFE_ARCHIVE_INPUT_CHANGED")
        _fsync_tree(staging)
        _publish_no_replace(staging, target)
        published = True
        _fsync_parent(parent)
        total_bytes = sum(int(record["bytes"]) for record in records)
        body: dict[str, object] = {
            "schema": SCHEMA,
            "archiveSha256": actual_sha256,
            "archiveBytes": before.st_size,
            "format": selected_format,
            "destination": target,
            "memberCount": member_count,
            "fileCount": len(records),
            "totalExtractedBytes": total_bytes,
            "files": sorted(records, key=lambda record: str(record["path"])),
            "createOnly": True,
            "symbolicLinksAllowed": False,
            "specialFilesAllowed": False,
        }
        body["receiptSha256"] = hashlib.sha256(
            json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        return body
    except SafeArchiveError:
        raise
    except (zipfile.BadZipFile, tarfile.TarError, EOFError) as error:
        fail("SAFE_ARCHIVE_FORMAT_INVALID", str(error))
    except OSError as error:
        fail("SAFE_ARCHIVE_IO_FAILED", str(error))
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        if staging is not None and not published:
            shutil.rmtree(staging, ignore_errors=True)


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def _positive_float(value: str) -> float:
    parsed = float(value)
    if not (parsed > 0):
        raise argparse.ArgumentTypeError("must be a positive number")
    return parsed


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--format", choices=("auto", "zip", "tar"), default="auto")
    parser.add_argument("--max-archive-bytes", type=_positive_int, default=DEFAULT_MAX_ARCHIVE_BYTES)
    parser.add_argument("--max-members", type=_positive_int, default=DEFAULT_MAX_MEMBERS)
    parser.add_argument("--max-files", type=_positive_int, default=DEFAULT_MAX_FILES)
    parser.add_argument("--max-total-bytes", type=_positive_int, default=DEFAULT_MAX_TOTAL_BYTES)
    parser.add_argument("--max-file-bytes", type=_positive_int, default=DEFAULT_MAX_FILE_BYTES)
    parser.add_argument("--max-compression-ratio", type=_positive_float, default=DEFAULT_MAX_COMPRESSION_RATIO)
    parser.add_argument("--max-path-bytes", type=_positive_int, default=DEFAULT_MAX_PATH_BYTES)
    parser.add_argument("--max-path-depth", type=_positive_int, default=DEFAULT_MAX_PATH_DEPTH)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    arguments = parse_args(sys.argv[1:] if argv is None else argv)
    limits = Limits(
        max_archive_bytes=arguments.max_archive_bytes,
        max_members=arguments.max_members,
        max_files=arguments.max_files,
        max_total_bytes=arguments.max_total_bytes,
        max_file_bytes=arguments.max_file_bytes,
        max_compression_ratio=arguments.max_compression_ratio,
        max_path_bytes=arguments.max_path_bytes,
        max_path_depth=arguments.max_path_depth,
    )
    try:
        receipt = extract_archive(
            archive_path=arguments.archive,
            destination=arguments.destination,
            expected_sha256=arguments.expected_sha256,
            archive_format=arguments.format,
            limits=limits,
        )
    except SafeArchiveError as error:
        print(f"{error.code}: {error}", file=sys.stderr)
        return 1
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
