#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SOURCE="$ROOT/validation/docs-narrative-craft/run-unattended-authorial-validation.sh"
PATCHED="${RUNNER_TEMP:-/tmp}/run-unattended-authorial-validation-current.sh"

sed \
  -e 's/8aeea45b1224683c12060e82f3d838522934a15a/6509256a38b9968f74e922a005d54102840fd83c/g' \
  -e 's/2ce70202a693dbb46aeda5f051f88eee0a3fa93b/8e1fc964d5dbafcdfbf15645a93cf441e3fb428d/g' \
  "$SOURCE" > "$PATCHED"
chmod +x "$PATCHED"
exec bash "$PATCHED"
