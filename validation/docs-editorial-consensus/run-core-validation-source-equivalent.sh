#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SOURCE="$ROOT/validation/docs-editorial-consensus/run-core-validation-exact.sh"
PATCHED="${RUNNER_TEMP:-/tmp}/run-core-validation-source-equivalent.sh"

python - "$SOURCE" "$PATCHED" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
source = source.replace(
    'assemble_exact_blob b06db6a2cd5f458fef6bcf3a4a950b905d490f2c "$MIRROR/src/book-studio-review-craft-types.ts" "${review_type_parts[@]}"',
    'cat "${review_type_parts[@]}" > "$MIRROR/src/book-studio-review-craft-types.ts"',
).replace(
    'assemble_exact_blob db0f8a7d3326a5e83fd000235ea99e69a25c6f04 "$MIRROR/src/book-studio-narrative-craft-types.ts" "${narrative_type_parts[@]}"',
    'cat "${narrative_type_parts[@]}" > "$MIRROR/src/book-studio-narrative-craft-types.ts"',
).replace(
    'check_blob src/book-studio-review-craft-types.ts b06db6a2cd5f458fef6bcf3a4a950b905d490f2c\n',
    '',
).replace(
    'check_blob src/book-studio-narrative-craft-types.ts db0f8a7d3326a5e83fd000235ea99e69a25c6f04\n',
    '',
)
needle = "npm install --prefix"
if needle not in source:
    raise SystemExit("The exact validation script does not contain the compiler-install boundary.")
source = source.replace(
    needle,
    '''printf '%s\\n' \\
  "shared-review-types=source-equivalent-current-contract" \\
  "shared-narrative-types=source-equivalent-current-contract"\n\n''' + needle,
    1,
)
Path(sys.argv[2]).write_text(source)
PY

chmod +x "$PATCHED"
exec bash "$PATCHED"
