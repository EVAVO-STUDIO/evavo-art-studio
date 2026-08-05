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
'''
if old not in source:
    raise SystemExit("Expected direct-file assembly block was not found.")
Path(sys.argv[2]).write_text(source.replace(old, new))
PY

chmod +x "$PATCHED"
exec bash "$PATCHED"
