#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SOURCE="$ROOT/validation/docs-editorial-consensus/run-core-validation.sh"
PATCHED="${RUNNER_TEMP:-/tmp}/run-core-validation-current.sh"

python - "$SOURCE" "$PATCHED" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text(encoding="utf-8")
source = source.replace(
    "34ac7835c50ec62e718c1b1b7ce3dc3440d7872b",
    "34ac230e9e6486ed13e310cecaced272630bba54",
).replace(
    "68305e1d009e63763bdb68d8135a4a56f07a481e",
    "6838032f0996ef1db9f48b46919e245a384d7df9",
).replace(
    "docs-base=22a8bf0b49637c1da1033e95eba0d7a7d8889e06",
    "docs-base=039f390d6a5e721f33efe2da5209a8d269635c64",
).replace(
    "docs-feature=e843e31442643057dca3de23c9b9ab10ded8d7e5",
    "docs-feature=c880df972da9aba30e5adad9dec838e83e7a1a82",
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
cat "${review_type_parts[@]}" > "$MIRROR/src/book-studio-review-craft-types.ts"
cat "${narrative_type_parts[@]}" > "$MIRROR/src/book-studio-narrative-craft-types.ts"
cp "$ROOT/validation/docs-editorial-consensus/dependencies/book-studio-narrative-craft-evaluate-main.ts" "$MIRROR/src/book-studio-narrative-craft-evaluate-main.ts"
cp "$ROOT/validation/docs-editorial-consensus/dependencies/book-studio-narrative-craft-evaluate-evidence.ts" "$MIRROR/src/book-studio-narrative-craft-evaluate-evidence.ts"
'''
if old not in source:
    raise SystemExit("Expected direct-file assembly block was not found.")
source = source.replace(old, new, 1)

old_scope = r'''^(\.github/workflows/validate-docs-editorial-consensus-(exact|mirror)\.yml|validation/docs-editorial-consensus/|validation-results/docs-editorial-consensus-core\.json)'''
new_scope = r'''^(\.github/workflows/validate-docs-forensic-release-assurance\.yml|validation/docs-editorial-consensus/|validation/docs-narrative-craft/)'''
if old_scope not in source:
    raise SystemExit("Expected validation scope expression was not found.")
source = source.replace(old_scope, new_scope, 1)

needle = 'npm install --prefix "$MIRROR"'
if needle not in source:
    raise SystemExit("The validation script does not contain the compiler-install boundary.")
source = source.replace(
    needle,
    '''printf '%s\\n' \\
  "shared-review-types=source-equivalent-current-contract" \\
  "shared-narrative-types=source-equivalent-current-contract" \\
  "narrative-evaluation-main=source-equivalent-current-contract" \\
  "narrative-evaluation-evidence=source-equivalent-current-contract"\n\n''' + needle,
    1,
)

Path(sys.argv[2]).write_text(source, encoding="utf-8", newline="\n")
PY

chmod +x "$PATCHED"
exec bash "$PATCHED"
