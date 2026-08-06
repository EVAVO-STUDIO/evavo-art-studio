#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SOURCE="$ROOT/validation/docs-editorial-consensus/run-core-validation.sh"
PATCHED="${RUNNER_TEMP:-/tmp}/run-core-validation-exact.sh"

python - "$SOURCE" "$PATCHED" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
source = source.replace(
    "34ac7835c50ec62e718c1b1b7ce3dc3440d7872b",
    "34ac230e9e6486ed13e310cecaced272630bba54",
).replace(
    "68305e1d009e63763bdb68d8135a4a56f07a481e",
    "6838032f0996ef1db9f48b46919e245a384d7df9",
).replace(
    "docs-feature=e843e31442643057dca3de23c9b9ab10ded8d7e5",
    "docs-feature=e843f9130bae5c0521523cdbb0d159d8acae9172",
)
old = '''cp "$ROOT/validation/docs-editorial-consensus/source/book-studio-unattended-editorial-consensus-integrity.ts" "$MIRROR/src/"
cp "$ROOT/validation/docs-editorial-consensus/source/book-studio-unattended-editorial-consensus-integrity.test.mjs" "$MIRROR/test/unattended-editorial-consensus-integrity.test.mjs"
sed 's#../docs-narrative-craft/src/#./#g' "$ROOT/validation/docs-editorial-consensus/source/book-studio-phrase-overlap-integrity.ts" > "$MIRROR/src/book-studio-phrase-overlap-integrity.ts"
'''
new = '''assemble_exact_blob 34ac230e9e6486ed13e310cecaced272630bba54 "$MIRROR/src/book-studio-unattended-editorial-consensus-integrity.ts" "$ROOT/validation/docs-editorial-consensus/source/book-studio-unattended-editorial-consensus-integrity.ts"
assemble_exact_blob 6838032f0996ef1db9f48b46919e245a384d7df9 "$MIRROR/test/unattended-editorial-consensus-integrity.test.mjs" "$ROOT/validation/docs-editorial-consensus/source/book-studio-unattended-editorial-consensus-integrity.test.mjs"
phrase_source="${RUNNER_TEMP:-/tmp}/book-studio-phrase-overlap-integrity.ts"
sed 's#../docs-narrative-craft/src/#./#g' "$ROOT/validation/docs-editorial-consensus/source/book-studio-phrase-overlap-integrity.ts" > "$phrase_source"
assemble_exact_blob 1fec55714b98e852d457a575691ae218af8b75a8 "$MIRROR/src/book-studio-phrase-overlap-integrity.ts" "$phrase_source"

review_type_parts=("$ROOT"/validation/docs-editorial-consensus/dependencies/book-studio-review-craft-types.ts.part-*)
narrative_type_parts=("$ROOT"/validation/docs-editorial-consensus/dependencies/book-studio-narrative-craft-types.ts.part-*)
assemble_exact_blob b06db6a2cd5f458fef6bcf3a4a950b905d490f2c "$MIRROR/src/book-studio-review-craft-types.ts" "${review_type_parts[@]}"
assemble_exact_blob db0f8a7d3326a5e83fd000235ea99e69a25c6f04 "$MIRROR/src/book-studio-narrative-craft-types.ts" "${narrative_type_parts[@]}"
assemble_exact_blob 9a939f326578ab749b9abf635b6c98d035ca6478 "$MIRROR/src/book-studio-narrative-craft-evaluate-main.ts" "$ROOT/validation/docs-editorial-consensus/dependencies/book-studio-narrative-craft-evaluate-main.ts"
assemble_exact_blob 5aab79209fcb1c6945d5b9040a1ed589a7558dfe "$MIRROR/src/book-studio-narrative-craft-evaluate-evidence.ts" "$ROOT/validation/docs-editorial-consensus/dependencies/book-studio-narrative-craft-evaluate-evidence.ts"
'''
if old not in source:
    raise SystemExit("Expected direct-file assembly block was not found.")
source = source.replace(old, new)
marker = '''check_blob src/book-studio-phrase-overlap-integrity.ts 1fec55714b98e852d457a575691ae218af8b75a8
'''
checks = marker + '''check_blob src/book-studio-review-craft-types.ts b06db6a2cd5f458fef6bcf3a4a950b905d490f2c
check_blob src/book-studio-narrative-craft-types.ts db0f8a7d3326a5e83fd000235ea99e69a25c6f04
check_blob src/book-studio-narrative-craft-evaluate-main.ts 9a939f326578ab749b9abf635b6c98d035ca6478
check_blob src/book-studio-narrative-craft-evaluate-evidence.ts 5aab79209fcb1c6945d5b9040a1ed589a7558dfe
'''
if marker not in source:
    raise SystemExit("Expected phrase-overlap blob check was not found.")
source = source.replace(marker, checks)
Path(sys.argv[2]).write_text(source)
PY

chmod +x "$PATCHED"
exec bash "$PATCHED"
