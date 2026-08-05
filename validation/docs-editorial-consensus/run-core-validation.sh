#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
MIRROR="${RUNNER_TEMP:-/tmp}/docs-editorial-consensus-mirror"
rm -rf "$MIRROR"
cp -R "$ROOT/validation/docs-narrative-craft" "$MIRROR"
rm -rf "$MIRROR/node_modules"

carrier="refs/remotes/origin/automation/validate-docs-book-unattended-production-20260804"
git -C "$ROOT" fetch --no-tags origin "+refs/heads/automation/validate-docs-book-unattended-production-20260804:$carrier"
git -C "$ROOT" show "$carrier:validation/docs-book-universal-readiness/packages/core/src/book-studio-project-contracts.ts" > "$MIRROR/src/book-studio-project-contracts.ts"
git -C "$ROOT" show "$carrier:validation/docs-book-universal-readiness/packages/core/src/book-studio-universal-readiness.ts" > "$MIRROR/src/book-studio-universal-readiness.ts"
git -C "$ROOT" show "$carrier:validation/docs-book-universal-readiness/packages/core/src/book-studio-universal-readiness-governance.ts" > "$MIRROR/src/book-studio-universal-readiness-governance.ts"

encoded="${RUNNER_TEMP:-/tmp}/docs-book-unattended-production.b64"
archive="${RUNNER_TEMP:-/tmp}/docs-book-unattended-production.tar.gz"
overlay="${RUNNER_TEMP:-/tmp}/docs-book-unattended-overlay"
rm -rf "$encoded" "$archive" "$overlay"
for part in {00..05}; do
  git -C "$ROOT" show "$carrier:validation/docs-book-unattended-production-payload/part-$part.b64" >> "$encoded"
done
test "$(wc -c < "$encoded")" = "31376"
test "$(sha256sum "$encoded" | cut -d' ' -f1)" = "a2559ebe10e04debf667f26a41117b967c19ac842b97d89164fd62d3cb8336f7"
base64 --decode "$encoded" > "$archive"
test "$(wc -c < "$archive")" = "23532"
test "$(sha256sum "$archive" | cut -d' ' -f1)" = "575bc289dc84444259bb3e86b1d96174fa3c07f26251004b718d1418b699e592"
mkdir -p "$overlay"
tar -xzf "$archive" -C "$overlay"
cp "$overlay/packages/core/src/book-studio-unattended-production.ts" "$MIRROR/src/"

cat "$ROOT"/validation/docs-editorial-consensus/payload/book-studio-unattended-editorial-consensus.ts.part-* > "$MIRROR/src/book-studio-unattended-editorial-consensus.ts"
cat "$ROOT"/validation/docs-editorial-consensus/payload/book-studio-unattended-editorial-consensus.test.mjs.part-* > "$MIRROR/test/unattended-editorial-consensus.test.mjs"
cp "$ROOT/validation/docs-editorial-consensus/source/book-studio-unattended-editorial-consensus-integrity.ts" "$MIRROR/src/"
cp "$ROOT/validation/docs-editorial-consensus/source/book-studio-unattended-editorial-consensus-integrity.test.mjs" "$MIRROR/test/unattended-editorial-consensus-integrity.test.mjs"
sed 's#../docs-narrative-craft/src/#./#g' "$ROOT/validation/docs-editorial-consensus/source/book-studio-phrase-overlap-integrity.ts" > "$MIRROR/src/book-studio-phrase-overlap-integrity.ts"

check_blob() {
  local relative="$1"
  local expected="$2"
  local actual
  actual="$(git -C "$ROOT" hash-object "$MIRROR/$relative")"
  printf '%s=%s\n' "$relative" "$actual"
  test "$actual" = "$expected"
}

check_blob src/book-studio-project-contracts.ts fa5fd3bf4ceb314cb4926add4231d22cb82863d6
check_blob src/book-studio-universal-readiness.ts 3c348b4969d94f2e81a7a4e8e0f9c2399850e640
check_blob src/book-studio-universal-readiness-governance.ts aac0ff806dbfc41259b4925918a96103a5615489
check_blob src/book-studio-unattended-production.ts a680376b58addae4ffb6b8a9cdfcab361a2711e4
check_blob src/book-studio-unattended-editorial-consensus.ts 4b340d331ea40cf1a1958b38f08cbdd4ce987331
check_blob src/book-studio-unattended-editorial-consensus-integrity.ts 34ac7835c50ec62e718c1b1b7ce3dc3440d7872b
check_blob src/book-studio-phrase-overlap-integrity.ts 1fec55714b98e852d457a575691ae218af8b75a8
check_blob test/unattended-editorial-consensus.test.mjs 52860de647aa83d696aa60df7a738b06768f6ba5
check_blob test/unattended-editorial-consensus-integrity.test.mjs 68305e1d009e63763bdb68d8135a4a56f07a481e

npm install --prefix "$MIRROR" --no-save --package-lock=false --ignore-scripts \
  typescript@5.9.3 @types/node@22 tsx@4.20.3
"$MIRROR/node_modules/.bin/tsc" -p "$MIRROR/tsconfig.json"
"$MIRROR/node_modules/.bin/tsx" --test \
  "$MIRROR/test/unattended-editorial-consensus.test.mjs" \
  "$MIRROR/test/unattended-editorial-consensus-integrity.test.mjs"

git -C "$ROOT" fetch --no-tags origin main
merge_base="$(git -C "$ROOT" merge-base HEAD origin/main)"
unexpected="$(git -C "$ROOT" diff --name-only "$merge_base" HEAD | grep -Ev '^(\.github/workflows/validate-docs-editorial-consensus-(exact|mirror)\.yml|validation/docs-editorial-consensus/|validation-results/docs-editorial-consensus-core\.json)' || true)"
test -z "$unexpected" || {
  printf '%s\n' "$unexpected"
  exit 1
}

printf '%s\n' \
  'validation=byte-pinned-editorial-consensus-core' \
  'docs-base=22a8bf0b49637c1da1033e95eba0d7a7d8889e06' \
  'docs-feature=e843e31442643057dca3de23c9b9ab10ded8d7e5' \
  'strict-core-typescript=true' \
  'consensus-dissent-and-semantic-tamper-attacks=true' \
  'provider-call-performed=false' \
  'canonical-manuscript-mutation-performed=false' \
  'automatic-canonical-admission-allowed=false' \
  'art-studio-production-source-changed=false' \
  'publication-performed=false'
