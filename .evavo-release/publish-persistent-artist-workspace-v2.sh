#!/usr/bin/env bash
set -euo pipefail

EXPECTED_BASE_SHA='8e77f81a6d38ad0ead5b56c084d8d097fe411b32'
FEATURE_BRANCH='agent/persistent-artist-workspace-20260811'
MANIFEST_PATH='.evavo-release/persistent-artist-workspace-manifest.json'
EXPECTED_PAYLOAD_SHA256='16b34d24a10596a655bf9f7578fc265fbc102fcc0a60422d32378d3c2a084e59'
CARRIER_ROOT="$(pwd)"

export PYTHONPYCACHEPREFIX="${RUNNER_TEMP}/persistent-artist-workspace-pycache"
mkdir -p "$PYTHONPYCACHEPREFIX"

git cat-file -e "${EXPECTED_BASE_SHA}^{commit}"
git fetch --no-tags origin "+refs/heads/${FEATURE_BRANCH}:refs/remotes/origin/${FEATURE_BRANCH}"
test "$(git rev-parse refs/remotes/origin/${FEATURE_BRANCH})" = "$EXPECTED_BASE_SHA"
git merge-base --is-ancestor "$EXPECTED_BASE_SHA" HEAD

test -f "$MANIFEST_PATH"
mapfile -t PAYLOAD_PARTS < <(compgen -G '.evavo-release/persistent-artist-workspace-files.tar.gz.b64.part-*' | sort)
test "${#PAYLOAD_PARTS[@]}" = '7'
PAYLOAD_PATH="${RUNNER_TEMP}/persistent-artist-workspace-files.tar.gz"
cat "${PAYLOAD_PARTS[@]}" | base64 --decode > "$PAYLOAD_PATH"
test -s "$PAYLOAD_PATH"
test "$(sha256sum "$PAYLOAD_PATH" | awk '{print $1}')" = "$EXPECTED_PAYLOAD_SHA256"
if tar -tzf "$PAYLOAD_PATH" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo 'Unsafe archive path detected.' >&2
  exit 1
fi

python -m pip install --disable-pip-version-check -r requirements-image-pipeline.txt
python -m pip install --disable-pip-version-check -r requirements/pixel-font-studio-v2.txt
python - <<'PY'
import PIL
import fontTools
assert PIL.__version__ == '12.2.0', PIL.__version__
assert fontTools.__version__ == '4.63.0', fontTools.__version__
PY

FEATURE_ROOT="${RUNNER_TEMP}/persistent-artist-workspace-feature"
git worktree add --detach "$FEATURE_ROOT" "refs/remotes/origin/${FEATURE_BRANCH}"
test "$(git -C "$FEATURE_ROOT" rev-parse HEAD)" = "$EXPECTED_BASE_SHA"
test -z "$(git -C "$FEATURE_ROOT" status --porcelain=v1 --untracked-files=all)"
tar -xzf "$PAYLOAD_PATH" -C "$FEATURE_ROOT"

CARRIER_ROOT="$CARRIER_ROOT" FEATURE_ROOT="$FEATURE_ROOT" node --input-type=module - <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const manifestPath = path.join(process.env.CARRIER_ROOT, '.evavo-release/persistent-artist-workspace-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'evavo.artist-workspace-release-payload.v1') throw new Error('Unexpected manifest schema.');
if (manifest.baseSha !== '8e77f81a6d38ad0ead5b56c084d8d097fe411b32') throw new Error('Unexpected base SHA.');
if (manifest.featureBranch !== 'agent/persistent-artist-workspace-20260811') throw new Error('Unexpected feature branch.');
if (manifest.archiveSha256 !== '16b34d24a10596a655bf9f7578fc265fbc102fcc0a60422d32378d3c2a084e59') throw new Error('Unexpected payload SHA.');
if (!Array.isArray(manifest.files) || manifest.files.length !== 17) throw new Error('Unexpected file count.');
const paths = manifest.files.map((entry) => entry.path);
if (new Set(paths).size !== paths.length) throw new Error('Duplicate release path.');
for (const entry of manifest.files) {
  if (typeof entry.path !== 'string' || entry.path.startsWith('/') || entry.path.includes('..')) throw new Error(`Unsafe path: ${entry.path}`);
  const absolute = path.join(process.env.FEATURE_ROOT, entry.path);
  const bytes = fs.readFileSync(absolute);
  if (bytes.length !== entry.bytes) throw new Error(`Byte count changed: ${entry.path}`);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha !== entry.sha256) throw new Error(`SHA-256 changed: ${entry.path}`);
}
const expected = [...paths].sort();
fs.writeFileSync(path.join(process.env.RUNNER_TEMP, 'persistent-artist-workspace-expected-paths.txt'), `${expected.join('\n')}\n`);
NODE

mapfile -t RELEASE_PATHS < "${RUNNER_TEMP}/persistent-artist-workspace-expected-paths.txt"
git -C "$FEATURE_ROOT" add -N -- "${RELEASE_PATHS[@]}"
git -C "$FEATURE_ROOT" diff --check
git -C "$FEATURE_ROOT" diff --name-only "$EXPECTED_BASE_SHA" | sort > "${RUNNER_TEMP}/persistent-artist-workspace-actual-paths.txt"
diff -u "${RUNNER_TEMP}/persistent-artist-workspace-expected-paths.txt" "${RUNNER_TEMP}/persistent-artist-workspace-actual-paths.txt"

cd "$FEATURE_ROOT"
bash scripts/bootstrap-ci-media-tools.sh
pnpm install --frozen-lockfile
pnpm run build:domain
PROJECT_ART_REQUIRE_PILLOW=1 PROJECT_ART_REQUIRE_PROVIDER_VALIDATION=1 node scripts/check-project-art-workbench.mjs
PROJECT_ART_REQUIRE_PILLOW=1 PROJECT_ART_REQUIRE_PROVIDER_VALIDATION=1 node scripts/test-project-art-workbench.mjs
PROJECT_ART_REQUIRE_PILLOW=1 PROJECT_ART_REQUIRE_PROVIDER_VALIDATION=1 node scripts/test-project-art-workspace-mcp.mjs
PROJECT_ART_REQUIRE_PILLOW=1 PROJECT_ART_REQUIRE_PROVIDER_VALIDATION=1 node scripts/test-project-art-loop-closure.mjs
pnpm check

git diff --check
git diff --exit-code -- pnpm-lock.yaml
test -z "$(find tools scripts -type d -name '__pycache__' -print -quit)"
test -z "$(find tools scripts -type f -name '*.pyc' -print -quit)"
git diff --name-only "$EXPECTED_BASE_SHA" | sort > "${RUNNER_TEMP}/persistent-artist-workspace-actual-paths.txt"
diff -u "${RUNNER_TEMP}/persistent-artist-workspace-expected-paths.txt" "${RUNNER_TEMP}/persistent-artist-workspace-actual-paths.txt"
test -n "$(git status --porcelain=v1 --untracked-files=all)"

git config user.name 'EVAVO-STUDIO'
git config user.email 'evavo.studio@gmail.com'
git add -- "${RELEASE_PATHS[@]}"
git diff --cached --check
git diff --cached --name-only | sort > "${RUNNER_TEMP}/persistent-artist-workspace-staged-paths.txt"
diff -u "${RUNNER_TEMP}/persistent-artist-workspace-expected-paths.txt" "${RUNNER_TEMP}/persistent-artist-workspace-staged-paths.txt"
git commit -m 'feat(project-art): add persistent artist workspace'
FEATURE_SHA="$(git rev-parse HEAD)"
test "$(git rev-parse HEAD^)" = "$EXPECTED_BASE_SHA"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
REMOTE_URL="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
git push "$REMOTE_URL" "HEAD:refs/heads/${FEATURE_BRANCH}"
printf '%s\n' "$FEATURE_SHA" > "${RUNNER_TEMP}/persistent-artist-workspace-feature-sha.txt"
