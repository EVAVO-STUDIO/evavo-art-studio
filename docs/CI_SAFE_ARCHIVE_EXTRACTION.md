# Governed CI archive extraction

Workflow archives must not be unpacked with direct `unzip`, extracting `tar`,
`7z x`, `Expand-Archive`, `shutil.unpack_archive`, `extractall`, or equivalent
unguarded helpers.

The repository boundary is:

```text
scripts/safe_archive_contract.py
scripts/safe_extract_archive.py
```

The helper supports ZIP and TAR input using only the Python standard library.
It validates and hashes one securely opened archive descriptor, extracts into a
transaction-owned staging tree, synchronises the resulting files, and publishes
the destination with operating-system no-replace semantics.

## Usage

```bash
python -B scripts/safe_extract_archive.py \
  --archive "$RUNNER_TEMP/tool.zip" \
  --destination "$RUNNER_TEMP/tool" \
  --expected-sha256 "$TOOL_ARCHIVE_SHA256" \
  --format zip
```

The archive and destination must be absolute, normalized paths. The destination
must not already exist. Successful execution prints a self-hashed JSON receipt
to standard output.

## Stable input contract

The archive must be:

- an ordinary file;
- non-symbolic;
- single-linked;
- within the configured byte boundary;
- reachable without a symbolic parent path;
- unchanged in device, inode, size, modification time, and change time while it
  is inspected and extracted;
- exactly equal to the caller-supplied SHA-256.

Hashing and extraction use the same open descriptor. A path cannot be swapped
between a separate checksum command and extraction.

## Member admission

The helper rejects:

- absolute and drive-qualified paths;
- traversal, repeated separators, backslash separators, NULs, and control
  characters;
- non-NFC paths, overlong paths, excessive depth, trailing dots or spaces, and
  reserved device names;
- exact, case-folded, Unicode, file/directory, and parent-path collisions;
- encrypted ZIP members;
- symbolic links, hard links, devices, FIFOs, sparse files, and every other
  non-file/non-directory member;
- empty or directory-only archives;
- excessive archive bytes, member count, file count, per-file bytes, total
  uncompressed bytes, path bytes, path depth, or compression ratio.

Every output file is created with exclusive and non-following descriptor flags.
The helper verifies the exact extracted byte count, computes a SHA-256 for every
file, synchronises file and directory state, and sanitizes file modes.

## Publication transaction

Extraction occurs beneath a newly created staging directory inside the caller's
selected destination parent. Publication uses:

- Linux `renameat2(..., RENAME_NOREPLACE)`;
- Windows `MoveFileExW` without replacement.

Unsupported platforms fail closed. A failed transaction removes only its own
new staging directory. It never deletes or replaces an existing destination.

## Default limits

```text
archive bytes:             512 MiB
members:                   4,096
files:                     4,096
total uncompressed bytes:  2 GiB
single file bytes:         512 MiB
compression ratio:         200:1
path bytes:                1,024
path depth:                32
```

Every limit has a positive CLI override for a separately reviewed workflow.

## Verification

```bash
python -B -m py_compile \
  scripts/safe_archive_contract.py \
  scripts/safe_extract_archive.py \
  scripts/test_safe_extract_archive.py

python -B scripts/test_safe_extract_archive.py
node --test scripts/test-ci-media-tool-workflow-archive-extraction-authority.mjs
```

The adversarial suite covers valid ZIP and TAR extraction, no-replace behavior,
hash mismatch, traversal, case collision, symbolic links, compression abuse,
empty archives, hard-linked input, TAR links, and partial-output cleanup.

The Pixel Font Studio Godot download is the first workflow consumer. Its pinned
archive hash is verified inside this helper and the old direct `unzip` authority
is removed.
