#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SOURCE_MIRROR="$REPO_ROOT/validation/docs-narrative-craft"
MIRROR="${RUNNER_TEMP:-/tmp}/docs-narrative-craft-combined"
RECEIPT="${VALIDATION_RECEIPT_TMP:-${RUNNER_TEMP:-/tmp}/docs-unattended-authorial-validation.json}"
DOCS_FEATURE_HEAD="8aeea45b1224683c12060e82f3d838522934a15a"
DOCS_BASE_HEAD="626bcd3af1bc1b1ffb92e28661e62069ed181951"
CARRIER_BRANCH="automation/validate-docs-book-unattended-production-20260804"
current_stage="initialise"
completed=()

write_receipt() {
  local exit_code="$1"
  local conclusion="failure"
  if [[ "$exit_code" -eq 0 ]]; then conclusion="success"; fi
  local completed_stages=""
  if [[ "${#completed[@]}" -gt 0 ]]; then
    completed_stages="$(printf '%s\n' "${completed[@]}")"
  fi
  mkdir -p "$(dirname "$RECEIPT")"
  CONCLUSION="$conclusion" \
  CURRENT_STAGE="$current_stage" \
  COMPLETED_STAGES="$completed_stages" \
  DOCS_FEATURE_HEAD="$DOCS_FEATURE_HEAD" \
  DOCS_BASE_HEAD="$DOCS_BASE_HEAD" \
  GITHUB_SHA_VALUE="${GITHUB_SHA:-unknown}" \
  GITHUB_RUN_ID_VALUE="${GITHUB_RUN_ID:-unknown}" \
  GITHUB_RUN_ATTEMPT_VALUE="${GITHUB_RUN_ATTEMPT:-unknown}" \
  node - "$RECEIPT" <<'NODE'
const fs = require("node:fs");
const output = process.argv[2];
const conclusion = process.env.CONCLUSION;
const completedStages = (process.env.COMPLETED_STAGES ?? "")
  .split("\n")
  .filter(Boolean);
const isolationPassed = completedStages.includes("art_production_source_isolation");
const receipt = {
  outputKind: "evavo_art_docs_unattended_authorial_validation_receipt",
  schemaVersion: 1,
  conclusion,
  failedStage: conclusion === "failure" ? process.env.CURRENT_STAGE : null,
  completedStages,
  workflowRunId: process.env.GITHUB_RUN_ID_VALUE,
  workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT_VALUE,
  testedValidationHead: process.env.GITHUB_SHA_VALUE,
  docsFeatureHead: process.env.DOCS_FEATURE_HEAD,
  docsBaseHead: process.env.DOCS_BASE_HEAD,
  exactRetainedPlannerPayload: completedStages.includes("retained_planner_reconstruction"),
  exactReviewedBlobProof: completedStages.includes("exact_blob_proof"),
  strictCoreTypeScript: completedStages.includes("strict_core_typescript"),
  coreBehaviouralAttacks: completedStages.includes("core_behavioural_attacks"),
  cliAndDualEraMcpAttacks: completedStages.includes("cli_and_dual_era_mcp_attacks"),
  strictProtectedWebTypeScript: completedStages.includes("strict_protected_web_typescript"),
  permanentAuthorityChecker: completedStages.includes("permanent_authority_checker"),
  artStudioProductionSourceChanged: isolationPassed ? false : null,
  providerCallPerformed: false,
  canonicalManuscriptMutationPerformed: false,
  automaticCanonicalAdmissionAllowed: false,
  publicationPerformed: false,
};
fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
NODE
}

finish() {
  local exit_code="$?"
  trap - EXIT
  write_receipt "$exit_code"
  exit "$exit_code"
}
trap finish EXIT
set -e

check_blob() {
  local relative="$1"
  local expected="$2"
  local actual
  actual="$(git -C "$REPO_ROOT" hash-object "$MIRROR/$relative")"
  printf '%s=%s\n' "$relative" "$actual"
  [[ "$actual" == "$expected" ]]
}

current_stage="retained_planner_reconstruction"
rm -rf "$MIRROR"
cp -R "$SOURCE_MIRROR" "$MIRROR"
rm -rf "$MIRROR/node_modules"
git -C "$REPO_ROOT" fetch --no-tags origin \
  "+refs/heads/$CARRIER_BRANCH:refs/remotes/origin/$CARRIER_BRANCH"
carrier="refs/remotes/origin/$CARRIER_BRANCH"
git -C "$REPO_ROOT" show \
  "$carrier:validation/docs-book-universal-readiness/packages/core/src/book-studio-project-contracts.ts" \
  > "$MIRROR/src/book-studio-project-contracts.ts"
git -C "$REPO_ROOT" show \
  "$carrier:validation/docs-book-universal-readiness/packages/core/src/book-studio-universal-readiness.ts" \
  > "$MIRROR/src/book-studio-universal-readiness.ts"
git -C "$REPO_ROOT" show \
  "$carrier:validation/docs-book-universal-readiness/packages/core/src/book-studio-universal-readiness-governance.ts" \
  > "$MIRROR/src/book-studio-universal-readiness-governance.ts"
encoded="${RUNNER_TEMP:-/tmp}/docs-book-unattended-production.b64"
archive="${RUNNER_TEMP:-/tmp}/docs-book-unattended-production.tar.gz"
overlay="${RUNNER_TEMP:-/tmp}/docs-book-unattended-overlay"
rm -rf "$encoded" "$archive" "$overlay"
for part in {00..05}; do
  git -C "$REPO_ROOT" show \
    "$carrier:validation/docs-book-unattended-production-payload/part-$part.b64" \
    >> "$encoded"
done
[[ "$(wc -c < "$encoded")" == "31376" ]]
[[ "$(sha256sum "$encoded" | cut -d' ' -f1)" == "a2559ebe10e04debf667f26a41117b967c19ac842b97d89164fd62d3cb8336f7" ]]
base64 --decode "$encoded" > "$archive"
[[ "$(wc -c < "$archive")" == "23532" ]]
[[ "$(sha256sum "$archive" | cut -d' ' -f1)" == "575bc289dc84444259bb3e86b1d96174fa3c07f26251004b718d1418b699e592" ]]
mkdir -p "$overlay"
tar -xzf "$archive" -C "$overlay"
cp "$overlay/packages/core/src/book-studio-unattended-production.ts" \
  "$MIRROR/src/book-studio-unattended-production.ts"
completed+=("$current_stage")

current_stage="exact_blob_proof"
check_blob "src/book-studio-project-contracts.ts" "fa5fd3bf4ceb314cb4926add4231d22cb82863d6"
check_blob "src/book-studio-universal-readiness.ts" "3c348b4969d94f2e81a7a4e8e0f9c2399850e640"
check_blob "src/book-studio-universal-readiness-governance.ts" "aac0ff806dbfc41259b4925918a96103a5615489"
check_blob "src/book-studio-unattended-production.ts" "a680376b58addae4ffb6b8a9cdfcab361a2711e4"
check_blob "src/book-studio-authorial-writing-bridge-types.ts" "83401cf318fc78905af74920894ba22e353fa595"
check_blob "src/book-studio-authorial-writing-bridge.ts" "b5c1b3716ac0db256722b0ad16c366d15b2ae05f"
check_blob "src/book-studio-narrative-craft.ts" "65b1d1e1610d36320a9331a52c1cb641c6408b84"
check_blob "src/book-studio-unattended-authorial-writing.ts" "80d831f95233af9ce252e35ddee43a2a1d7e015e"
check_blob "test/unattended-authorial-writing.test.mjs" "2ce70202a693dbb46aeda5f051f88eee0a3fa93b"
check_blob "apps/web/scripts/docs-suite-api-client.mjs" "7d9570fb7e41d089a639cd2b6784c6a0ca3ca876"
check_blob "apps/web/scripts/evavo-docs-book-unattended-authorial-writing-cli.mjs" "3ac7e5dd8deb8e08636328d68448a1805e29db98"
check_blob "apps/web/scripts/evavo-docs-book-unattended-authorial-writing-mcp.mjs" "5f2e379ac39cbb2d7d2f316bba1a6fb27801bfe0"
check_blob "apps/web/scripts/test-book-studio-unattended-authorial-writing-adapters.mjs" "759eb6b8b8274d9d71d86a2d89ff8a1668647c7b"
check_blob "evidence/apps/web/src/lib/book-studio-unattended-authorial-writing-service.ts" "4046bf7a9f5bc25bdf565d8392b1154c03200e3c"
check_blob "evidence/apps/web/src/app/api/v1/book-studio/unattended-production/authorial-writing/route.ts" "78b55cf0946ffa5c02a7f2578b5a3a337f85eb72"
check_blob "evidence/packages/core/src/index.ts" "ef029b952b70325bc42224fa79e7d147b45e11fe"
check_blob "evidence/scripts/check-book-studio-unattended-authorial-writing.mjs" "719c6b3d9ecd227366a93f66230dbda05a15b3f1"
check_blob "evidence/.github/workflows/book-studio-unattended-authorial-writing.yml" "74563be88b93f6f84ba35551160fd7997f5b427c"
check_blob "evidence/docs/migrations/book-studio/BOOK_STUDIO_UNATTENDED_AUTHORIAL_WRITING.md" "d046669fe6a8ac4d891ce31070edece97a580482"
completed+=("$current_stage")

current_stage="tool_install"
npm install --prefix "$MIRROR" --no-save --package-lock=false --ignore-scripts \
  typescript@5.9.3 @types/node@22 tsx@4.20.3
completed+=("$current_stage")

current_stage="strict_core_typescript"
"$MIRROR/node_modules/.bin/tsc" -p "$MIRROR/tsconfig.json"
completed+=("$current_stage")

current_stage="core_behavioural_attacks"
"$MIRROR/node_modules/.bin/tsx" --test \
  "$MIRROR/test/narrative-craft.test.mjs" \
  "$MIRROR/test/authorial-runtime.test.mjs" \
  "$MIRROR/test/authorial-writing-bridge.test.mjs" \
  "$MIRROR/test/unattended-authorial-writing.test.mjs"
completed+=("$current_stage")

current_stage="cli_and_dual_era_mcp_attacks"
node --test "$MIRROR/apps/web/scripts/test-book-studio-unattended-authorial-writing-adapters.mjs"
completed+=("$current_stage")

current_stage="strict_protected_web_typescript"
webroot="${RUNNER_TEMP:-/tmp}/docs-authorial-webcheck"
rm -rf "$webroot"
mkdir -p \
  "$webroot/packages/core/src" \
  "$webroot/apps/web/src/lib" \
  "$webroot/apps/web/src/app/api/v1/book-studio/unattended-production/authorial-writing" \
  "$webroot/stubs"
cp "$MIRROR"/src/*.ts "$webroot/packages/core/src/"
cat > "$webroot/packages/core/src/index.ts" <<'TS'
export * from "./book-studio-project-contracts";
export * from "./book-studio-writing-candidate-types";
export * from "./book-studio-unattended-authorial-writing";
TS
cp "$MIRROR/evidence/apps/web/src/lib/book-studio-unattended-authorial-writing-service.ts" "$webroot/apps/web/src/lib/"
cp "$MIRROR/evidence/apps/web/src/app/api/v1/book-studio/unattended-production/authorial-writing/route.ts" \
  "$webroot/apps/web/src/app/api/v1/book-studio/unattended-production/authorial-writing/route.ts"
cat > "$webroot/apps/web/src/lib/book-studio-writing-candidate-client.ts" <<'TS'
export interface BookWritingCandidateClientConfigV1 {
  timeoutMilliseconds: number;
}
TS
cat > "$webroot/apps/web/src/lib/book-studio-writing-candidate-service.ts" <<'TS'
import type { BookWritingCandidateCoordinationResultV1 } from "../../../../packages/core/src/index";
import type { BookWritingCandidateClientConfigV1 } from "./book-studio-writing-candidate-client";
export async function coordinateBookWritingCandidate(
  _input: unknown,
  _options: Readonly<{
    config?: BookWritingCandidateClientConfigV1;
    fetchImpl?: typeof fetch;
    expectedRuntimeRequestFingerprint?: string;
  }> = {},
): Promise<BookWritingCandidateCoordinationResultV1> {
  throw new Error("typecheck stub");
}
TS
cat > "$webroot/apps/web/src/lib/docs-suite-request-context.ts" <<'TS'
export interface DocsSuiteRequestContext {
  scopes: string[];
  workspaceId: string;
  actorType: string;
}
export async function readDocsSuiteRequestContext(): Promise<DocsSuiteRequestContext | null> {
  return null;
}
TS
cat > "$webroot/stubs/next-server.ts" <<'TS'
export class NextRequest extends Request {}
export class NextResponse {
  static json(value: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(value), init);
  }
}
TS
printf 'export {};\n' > "$webroot/stubs/server-only.ts"
ln -s "$MIRROR/node_modules" "$webroot/node_modules"
cat > "$webroot/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noEmit": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["apps/web/src/*"],
      "next/server": ["stubs/next-server.ts"],
      "server-only": ["stubs/server-only.ts"]
    },
    "types": ["node"]
  },
  "include": [
    "packages/core/src/**/*.ts",
    "apps/web/src/**/*.ts",
    "stubs/**/*.ts"
  ]
}
JSON
"$MIRROR/node_modules/.bin/tsc" -p "$webroot/tsconfig.json"
completed+=("$current_stage")

current_stage="permanent_authority_checker"
checkroot="${RUNNER_TEMP:-/tmp}/docs-book-production-check"
rm -rf "$checkroot"
mkdir -p \
  "$checkroot/packages/core/src" \
  "$checkroot/packages/core/test" \
  "$checkroot/apps/web/src/lib" \
  "$checkroot/apps/web/src/app/api/v1/book-studio/unattended-production/authorial-writing" \
  "$checkroot/apps/web/scripts" \
  "$checkroot/scripts" \
  "$checkroot/.github/workflows" \
  "$checkroot/docs/migrations/book-studio"
cp "$MIRROR"/src/*.ts "$checkroot/packages/core/src/"
cp "$MIRROR/evidence/packages/core/src/index.ts" "$checkroot/packages/core/src/index.ts"
cp "$MIRROR/test/unattended-authorial-writing.test.mjs" \
  "$checkroot/packages/core/test/book-studio-unattended-authorial-writing.test.mjs"
cp "$MIRROR/evidence/apps/web/src/lib/book-studio-unattended-authorial-writing-service.ts" \
  "$checkroot/apps/web/src/lib/"
cp "$MIRROR/evidence/apps/web/src/app/api/v1/book-studio/unattended-production/authorial-writing/route.ts" \
  "$checkroot/apps/web/src/app/api/v1/book-studio/unattended-production/authorial-writing/route.ts"
cp "$MIRROR/apps/web/scripts/docs-suite-api-client.mjs" "$checkroot/apps/web/scripts/"
cp "$MIRROR/apps/web/scripts/evavo-docs-book-unattended-authorial-writing-cli.mjs" "$checkroot/apps/web/scripts/"
cp "$MIRROR/apps/web/scripts/evavo-docs-book-unattended-authorial-writing-mcp.mjs" "$checkroot/apps/web/scripts/"
cp "$MIRROR/apps/web/scripts/test-book-studio-unattended-authorial-writing-adapters.mjs" "$checkroot/apps/web/scripts/"
cp "$MIRROR/evidence/scripts/check-book-studio-unattended-authorial-writing.mjs" "$checkroot/scripts/"
cp "$MIRROR/evidence/.github/workflows/book-studio-unattended-authorial-writing.yml" "$checkroot/.github/workflows/"
cp "$MIRROR/evidence/docs/migrations/book-studio/BOOK_STUDIO_UNATTENDED_AUTHORIAL_WRITING.md" \
  "$checkroot/docs/migrations/book-studio/"
node "$checkroot/scripts/check-book-studio-unattended-authorial-writing.mjs"
completed+=("$current_stage")

current_stage="art_production_source_isolation"
git -C "$REPO_ROOT" fetch --no-tags origin main
merge_base="$(git -C "$REPO_ROOT" merge-base HEAD origin/main)"
[[ -n "$merge_base" ]]
unexpected="$(
  git -C "$REPO_ROOT" diff --name-only "$merge_base" HEAD \
    | grep -Ev '^(\.github/workflows/(validate-docs-authorial-mirror|validate-docs-narrative-craft|diagnose-docs-unattended-authorial-checker|surface-docs-unattended-authorial-diagnostic)\.yml|validation/docs-narrative-craft/|validation-results/docs-unattended-authorial-validation\.json)' \
    || true
)"
[[ -z "$unexpected" ]] || {
  printf '%s\n' "$unexpected"
  exit 1
}
completed+=("$current_stage")

current_stage="clean_tracked_checkout"
git -C "$REPO_ROOT" diff --exit-code
test -z "$(git -C "$REPO_ROOT" status --porcelain=v1 --untracked-files=no)"
completed+=("$current_stage")

current_stage="complete"
