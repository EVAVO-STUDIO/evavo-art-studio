#!/usr/bin/env python3
"""Security primitives for bounded create-only archive extraction."""

from __future__ import annotations

import ctypes
import errno
import hashlib
import os
import re
import stat
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import BinaryIO, Iterable, NoReturn

SCHEMA = "evavo.ci-safe-archive-extraction-receipt.v1"
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
DRIVE_RE = re.compile(r"^[A-Za-z]:")
WINDOWS_RESERVED = {
    "con", "prn", "aux", "nul",
    *(f"com{number}" for number in range(1, 10)),
    *(f"lpt{number}" for number in range(1, 10)),
}
DEFAULT_MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
DEFAULT_MAX_MEMBERS = 4096
DEFAULT_MAX_FILES = 4096
DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
DEFAULT_MAX_FILE_BYTES = 512 * 1024 * 1024
DEFAULT_MAX_COMPRESSION_RATIO = 200.0
DEFAULT_MAX_PATH_BYTES = 1024
DEFAULT_MAX_PATH_DEPTH = 32
COPY_CHUNK_BYTES = 1024 * 1024


class SafeArchiveError(RuntimeError):
    def __init__(self, code: str, message: str | None = None) -> None:
        super().__init__(message or code)
        self.code = code


def fail(code: str, message: str | None = None) -> NoReturn:
    raise SafeArchiveError(code, message)


@dataclass(frozen=True)
class Limits:
    max_archive_bytes: int = DEFAULT_MAX_ARCHIVE_BYTES
    max_members: int = DEFAULT_MAX_MEMBERS
    max_files: int = DEFAULT_MAX_FILES
    max_total_bytes: int = DEFAULT_MAX_TOTAL_BYTES
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES
    max_compression_ratio: float = DEFAULT_MAX_COMPRESSION_RATIO
    max_path_bytes: int = DEFAULT_MAX_PATH_BYTES
    max_path_depth: int = DEFAULT_MAX_PATH_DEPTH


@dataclass(frozen=True)
class Entry:
    source: object
    path: str
    is_directory: bool
    size: int
    compressed_size: int | None
    executable: bool


def _absolute_path(value: str, label: str) -> str:
    if not isinstance(value, str) or "\x00" in value or not os.path.isabs(value):
        fail("SAFE_ARCHIVE_PATH_INVALID", f"{label} must be an absolute path.")
    normalized = os.path.normpath(value)
    if normalized != value:
        fail("SAFE_ARCHIVE_PATH_INVALID", f"{label} must already be normalized.")
    return normalized


def _stable_archive(path: str, limits: Limits) -> tuple[int, os.stat_result]:
    absolute = _absolute_path(path, "archive")
    before = os.lstat(absolute)
    if not stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode):
        fail("SAFE_ARCHIVE_INPUT_INVALID", "Archive must be an ordinary file.")
    if before.st_nlink != 1:
        fail("SAFE_ARCHIVE_INPUT_INVALID", "Archive must have exactly one hard link.")
    if before.st_size < 1 or before.st_size > limits.max_archive_bytes:
        fail("SAFE_ARCHIVE_SIZE_INVALID", "Archive size is outside the configured bounds.")
    if os.path.realpath(absolute) != absolute:
        fail("SAFE_ARCHIVE_INPUT_INVALID", "Archive must not traverse a symbolic path.")

    flags = os.O_RDONLY
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(absolute, flags)
    try:
        opened = os.fstat(descriptor)
        _same_identity(before, opened, "SAFE_ARCHIVE_INPUT_CHANGED")
    except Exception:
        os.close(descriptor)
        raise
    return descriptor, before


def _same_identity(
    left: os.stat_result,
    right: os.stat_result,
    code: str,
) -> None:
    keys = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
    if any(getattr(left, key) != getattr(right, key) for key in keys):
        fail(code, "Archive identity changed during processing.")


def _hash_descriptor(descriptor: int) -> str:
    os.lseek(descriptor, 0, os.SEEK_SET)
    digest = hashlib.sha256()
    while True:
        chunk = os.read(descriptor, COPY_CHUNK_BYTES)
        if not chunk:
            break
        digest.update(chunk)
    os.lseek(descriptor, 0, os.SEEK_SET)
    return digest.hexdigest()


def _destination_parent(destination: str) -> tuple[str, str]:
    absolute = _absolute_path(destination, "destination")
    if os.path.lexists(absolute):
        fail("SAFE_ARCHIVE_DESTINATION_EXISTS", "Destination is create-only and already exists.")
    parent = os.path.dirname(absolute)
    metadata = os.lstat(parent)
    if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
        fail("SAFE_ARCHIVE_DESTINATION_PARENT_INVALID")
    if os.path.realpath(parent) != parent:
        fail("SAFE_ARCHIVE_DESTINATION_PARENT_INVALID")
    return absolute, parent


def _safe_member_path(name: str, is_directory: bool, limits: Limits) -> str:
    if not isinstance(name, str) or not name:
        fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Archive member path is empty.")
    if "\x00" in name or any(ord(character) < 32 or ord(character) == 127 for character in name):
        fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Archive member path contains control characters.")
    if "\\" in name:
        fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Backslash path separators are forbidden.")
    if name.startswith("/") or name.startswith("//") or DRIVE_RE.match(name):
        fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Absolute archive paths are forbidden.")
    if "//" in name:
        fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Repeated path separators are forbidden.")

    candidate = name[:-1] if is_directory and name.endswith("/") else name
    if not candidate or candidate.endswith("/"):
        fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID")
    normalized = unicodedata.normalize("NFC", candidate)
    if normalized != candidate:
        fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Member paths must use canonical NFC Unicode.")

    parts = PurePosixPath(normalized).parts
    if not parts or len(parts) > limits.max_path_depth:
        fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Member path depth is outside the configured bounds.")
    for part in parts:
        if part in ("", ".", ".."):
            fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Traversal segments are forbidden.")
        encoded = part.encode("utf-8")
        if len(encoded) > 255 or part.endswith(" ") or part.endswith("."):
            fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Member path segment is unsafe.")
        if part.split(".", 1)[0].casefold() in WINDOWS_RESERVED:
            fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Reserved device names are forbidden.")
    if len(normalized.encode("utf-8")) > limits.max_path_bytes:
        fail("SAFE_ARCHIVE_MEMBER_PATH_INVALID", "Member path is too long.")
    return normalized


def _validate_entries(entries: Iterable[Entry], limits: Limits) -> tuple[list[Entry], int, int]:
    output: list[Entry] = []
    exact: set[str] = set()
    folded: set[str] = set()
    file_paths: set[str] = set()
    all_paths: set[str] = set()
    namespace: dict[str, str] = {}
    file_count = 0
    total_bytes = 0

    for entry in entries:
        if len(output) >= limits.max_members:
            fail("SAFE_ARCHIVE_MEMBER_LIMIT_EXCEEDED")
        path = entry.path
        folded_path = unicodedata.normalize("NFC", path).casefold()
        if path in exact or folded_path in folded:
            fail("SAFE_ARCHIVE_MEMBER_COLLISION", f"Colliding archive member: {path}")

        parts = path.split("/")
        for index in range(1, len(parts) + 1):
            exact_prefix = "/".join(parts[:index])
            folded_prefix = unicodedata.normalize("NFC", exact_prefix).casefold()
            existing_prefix = namespace.get(folded_prefix)
            if existing_prefix is not None and existing_prefix != exact_prefix:
                fail("SAFE_ARCHIVE_MEMBER_COLLISION", f"Case or Unicode path collision: {path}")
            namespace[folded_prefix] = exact_prefix
        prefixes = ["/".join(parts[:index]) for index in range(1, len(parts))]
        if any(prefix in file_paths for prefix in prefixes):
            fail("SAFE_ARCHIVE_MEMBER_COLLISION", f"File/directory conflict: {path}")
        if not entry.is_directory and any(
            existing.startswith(f"{path}/") for existing in all_paths
        ):
            fail("SAFE_ARCHIVE_MEMBER_COLLISION", f"File/directory conflict: {path}")

        exact.add(path)
        folded.add(folded_path)
        all_paths.add(path)
        if not entry.is_directory:
            file_paths.add(path)
            file_count += 1
            total_bytes += entry.size
            if file_count > limits.max_files:
                fail("SAFE_ARCHIVE_FILE_LIMIT_EXCEEDED")
            if entry.size < 0 or entry.size > limits.max_file_bytes:
                fail("SAFE_ARCHIVE_FILE_SIZE_INVALID", f"File is outside bounds: {path}")
            if total_bytes > limits.max_total_bytes:
                fail("SAFE_ARCHIVE_TOTAL_SIZE_EXCEEDED")
            if entry.compressed_size is not None:
                if entry.size > 0 and entry.compressed_size <= 0:
                    fail("SAFE_ARCHIVE_COMPRESSION_RATIO_EXCEEDED")
                if entry.compressed_size > 0 and entry.size / entry.compressed_size > limits.max_compression_ratio:
                    fail("SAFE_ARCHIVE_COMPRESSION_RATIO_EXCEEDED", f"Compression ratio is unsafe: {path}")
        output.append(entry)

    if not output or file_count == 0:
        fail("SAFE_ARCHIVE_EMPTY", "Archive must contain at least one ordinary file.")
    return output, file_count, total_bytes


def _open_output(path: str) -> int:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    return os.open(path, flags, 0o600)


def _copy_stream(source: BinaryIO, destination: str, expected_size: int, executable: bool) -> dict[str, object]:
    descriptor = _open_output(destination)
    digest = hashlib.sha256()
    written = 0
    try:
        while True:
            chunk = source.read(COPY_CHUNK_BYTES)
            if not chunk:
                break
            written += len(chunk)
            if written > expected_size:
                fail("SAFE_ARCHIVE_MEMBER_SIZE_MISMATCH")
            view = memoryview(chunk)
            while view:
                consumed = os.write(descriptor, view)
                if consumed <= 0:
                    fail("SAFE_ARCHIVE_MEMBER_WRITE_FAILED")
                view = view[consumed:]
            digest.update(chunk)
        if written != expected_size:
            fail("SAFE_ARCHIVE_MEMBER_SIZE_MISMATCH")
        os.fsync(descriptor)
        os.fchmod(descriptor, 0o755 if executable else 0o644)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return {"sha256": digest.hexdigest(), "bytes": written}


def _ensure_parent_directories(root: str, relative_path: str) -> None:
    current = root
    for part in relative_path.split("/")[:-1]:
        current = os.path.join(current, part)
        try:
            os.mkdir(current, 0o700)
        except FileExistsError:
            metadata = os.lstat(current)
            if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
                fail("SAFE_ARCHIVE_MEMBER_COLLISION")


def _create_directory(root: str, relative_path: str) -> None:
    current = root
    for part in relative_path.split("/"):
        current = os.path.join(current, part)
        try:
            os.mkdir(current, 0o700)
        except FileExistsError:
            metadata = os.lstat(current)
            if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
                fail("SAFE_ARCHIVE_MEMBER_COLLISION")


def _fsync_tree(root: str) -> None:
    directories: list[str] = []
    for current, children, files in os.walk(root, topdown=True, followlinks=False):
        directories.append(current)
        for name in children:
            metadata = os.lstat(os.path.join(current, name))
            if stat.S_ISLNK(metadata.st_mode):
                fail("SAFE_ARCHIVE_SPECIAL_MEMBER")
        for name in files:
            metadata = os.lstat(os.path.join(current, name))
            if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
                fail("SAFE_ARCHIVE_SPECIAL_MEMBER")
    for directory in reversed(directories):
        flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(directory, flags)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def _publish_no_replace(staging: str, destination: str) -> None:
    if sys.platform.startswith("linux"):
        libc = ctypes.CDLL(None, use_errno=True)
        renameat2 = getattr(libc, "renameat2", None)
        if renameat2 is None:
            fail("SAFE_ARCHIVE_NOREPLACE_UNSUPPORTED")
        renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        renameat2.restype = ctypes.c_int
        result = renameat2(
            -100,
            os.fsencode(staging),
            -100,
            os.fsencode(destination),
            1,
        )
        if result != 0:
            error_number = ctypes.get_errno()
            if error_number in (errno.EEXIST, errno.ENOTEMPTY):
                fail("SAFE_ARCHIVE_DESTINATION_EXISTS")
            fail("SAFE_ARCHIVE_PUBLISH_FAILED", os.strerror(error_number))
        return

    if os.name == "nt":
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        move_file_ex = kernel32.MoveFileExW
        move_file_ex.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint]
        move_file_ex.restype = ctypes.c_int
        if not move_file_ex(staging, destination, 0x8):
            error_number = ctypes.get_last_error()
            if error_number in (80, 183):
                fail("SAFE_ARCHIVE_DESTINATION_EXISTS")
            fail("SAFE_ARCHIVE_PUBLISH_FAILED", f"Windows error {error_number}")
        return

    fail("SAFE_ARCHIVE_NOREPLACE_UNSUPPORTED")


def _fsync_parent(parent: str) -> None:
    if os.name == "nt":
        return
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(parent, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
