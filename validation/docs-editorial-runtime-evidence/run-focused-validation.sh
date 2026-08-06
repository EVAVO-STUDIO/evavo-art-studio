#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly WORKSPACE="${ROOT}/validation/docs-narrative-craft"

verify_blob() {
  local relative_path="$1"
  local expected_sha="$2"
  local actual_sha
  actual_sha="$(git -C "${ROOT}" hash-object "${ROOT}/${relative_path}")"
  if [[ "${actual_sha}" != "${expected_sha}" ]]; then
    printf 'exact_blob_mismatch path=%s expected=%s actual=%s\n' \
      "${relative_path}" "${expected_sha}" "${actual_sha}" >&2
    exit 1
  fi
}

verify_blob \
  "validation/docs-narrative-craft/src/book-studio-unattended-editorial-consensus-runtime-evidence.ts" \
  "f45a9ea2f12d7b17f96c77264578bade56f507e7"
verify_blob \
  "validation/docs-narrative-craft/src/book-studio-unattended-editorial-consensus-runtime-boundary.ts" \
  "78d0f5e8c71c4bcb350cc259eda9ae5e160d03a8"
verify_blob \
  "validation/docs-narrative-craft/src/book-studio-writing-candidate-contracts.ts" \
  "1c6e28d9007cba88a90f9d125000bf084f48a3d8"
verify_blob \
  "validation/docs-narrative-craft/src/book-studio-writing-handoff-response.ts" \
  "1939f3b593507431878daa37476c5c7bef9c0faa"
verify_blob \
  "validation/docs-narrative-craft/src/index.ts" \
  "0aacdd08b1b141a7d169c3075aa5b91c9b03a01f"
verify_blob \
  "validation/docs-narrative-craft/test/book-studio-narrative-craft-fixtures.mjs" \
  "ab7e38e1df4f292ecb0fc4be14459b5976bea43f"
verify_blob \
  "validation/docs-narrative-craft/test/book-studio-unattended-editorial-consensus-runtime-evidence.test.mjs" \
  "7f3346e15eb26b89d99431147b7e3b9dd65b1395"
verify_blob \
  "validation/docs-narrative-craft/test/book-studio-unattended-editorial-consensus-runtime-boundary.test.mjs" \
  "600c1bdfc75a5ad2b2eb028095dcad2e450143c5"
verify_blob \
  "validation/docs-narrative-craft/tsconfig.json" \
  "814af0d09c49d2a9a4cfab2f03d5d2e962f221c3"

cd "${ROOT}"
node --input-type=module <<'NODE'
import fs from "node:fs";

const boundary = fs.readFileSync(
  "validation/docs-narrative-craft/src/book-studio-unattended-editorial-consensus-runtime-boundary.ts",
  "utf8",
);
const runtimeEvidence = fs.readFileSync(
  "validation/docs-narrative-craft/src/book-studio-unattended-editorial-consensus-runtime-evidence.ts",
  "utf8",
);
const mirrorIndex = fs.readFileSync(
  "validation/docs-narrative-craft/src/index.ts",
  "utf8",
);
const boundaryTest = fs.readFileSync(
  "validation/docs-narrative-craft/test/book-studio-unattended-editorial-consensus-runtime-boundary.test.mjs",
  "utf8",
);

const requiredBoundaryTokens = [
  "MAX_REVIEWERS = 8",
  "evaluateBookUnattendedEditorialConsensusIntegrity",
  "validateRuntimeChronology",
  "Editorial runtime chronology could not be validated safely.",
  "reports unresolved runtime blockers",
  "reports unresolved handoff risks",
  "evaluateRuntimeEvidenceUnchecked(input)",
  "providerCallsPerformed: 0",
  "automaticCanonicalAdmissionAllowed: false",
  "publicationPerformed: false",
];
const requiredRuntimeTokens = [
  "validateBookWritingCandidateRuntimeResult",
  "payload does not match the exact immutable runtime candidate bytes",
  "must cover every reviewer assignment exactly once",
  "payloadAndReviewReceiptIdsRequiredInRuntimeHandoff: true",
  "providerAuthenticationClaimed: false",
  "providerFallbackAllowed: false",
  "automaticCanonicalAdmissionAllowed: false",
  "publicationPerformed: false",
];
for (const token of requiredBoundaryTokens) {
  if (!boundary.includes(token)) throw new Error(`missing boundary token: ${token}`);
}
for (const token of requiredRuntimeTokens) {
  if (!runtimeEvidence.includes(token)) throw new Error(`missing runtime token: ${token}`);
}
const semanticOffset = boundary.indexOf(
  "evaluateBookUnattendedEditorialConsensusIntegrity",
);
const chronologyOffset = boundary.indexOf(
  "temporalBlockers = validateRuntimeChronology(input);",
);
const chronologyFailureOffset = boundary.indexOf(
  "Editorial runtime chronology could not be validated safely.",
);
const runtimeOffset = boundary.indexOf("evaluateRuntimeEvidenceUnchecked(input)");
if (
  semanticOffset < 0
  || chronologyOffset <= semanticOffset
  || chronologyFailureOffset <= chronologyOffset
  || runtimeOffset <= chronologyFailureOffset
) {
  throw new Error(
    "semantic validation, guarded chronology and deep runtime validation must remain ordered",
  );
}
if (!boundaryTest.includes(
  "keeps malformed nested runtime chronology behind a fail-closed guard",
)) {
  throw new Error("chronology fail-closed regression test is missing");
}
if (!mirrorIndex.includes(
  'from "./book-studio-unattended-editorial-consensus-runtime-boundary"',
)) {
  throw new Error("mirror index must expose only the bounded public evaluator");
}
if (mirrorIndex.includes("evaluateBookUnattendedEditorialConsensusIntegrity,")) {
  throw new Error("legacy integrity evaluator must not be exposed from the mirror index");
}
NODE

rm -rf "${WORKSPACE}/node_modules"
npm install --prefix "${WORKSPACE}" --no-save --package-lock=false --ignore-scripts \
  typescript@5.9.3 @types/node@22 tsx@4.20.3

"${WORKSPACE}/node_modules/.bin/tsc" -p "${WORKSPACE}/tsconfig.json"

mapfile -t test_files < <(
  find "${WORKSPACE}/test" -maxdepth 1 -type f -name '*.test.mjs' -print | sort
)
if (( ${#test_files[@]} < 8 )); then
  printf 'expected at least 8 committed mirror test files, found %s\n' \
    "${#test_files[@]}" >&2
  exit 1
fi
"${WORKSPACE}/node_modules/.bin/tsx" --test "${test_files[@]}"

git -C "${ROOT}" fetch --no-tags origin main
merge_base="$(git -C "${ROOT}" merge-base HEAD origin/main)"
changed_paths="$(git -C "${ROOT}" diff --name-only "${merge_base}" HEAD)"
unexpected="$(
  printf '%s\n' "${changed_paths}" \
    | grep -Ev '^(\.github/workflows/(diagnose-docs-|surface-docs-|validate-docs-)[^/]+\.ya?ml|validation-results/|validation/)' \
    || true
)"
test -z "${unexpected}" || {
  printf 'non_validation_path_changed=true\n%s\n' "${unexpected}" >&2
  exit 1
}
changed_path_count="$(printf '%s\n' "${changed_paths}" | sed '/^$/d' | wc -l | tr -d ' ')"
printf 'validation_only_changed_path_count=%s\n' "${changed_path_count}"
git -C "${ROOT}" diff --exit-code
test -z "$(git -C "${ROOT}" status --porcelain=v1 --untracked-files=no)"

printf '%s\n' \
  'validation=byte-exact-source-equivalent-complete-editorial-runtime-mirror' \
  'exact_runtime_evidence_source=true' \
  'exact_runtime_boundary_source=true' \
  'exact_writing_candidate_validator=true' \
  'exact_handoff_response_validator=true' \
  'strict_complete_mirror_typescript=true' \
  'all_committed_mirror_tests_executed=true' \
  'semantic_validation_precedes_runtime_traversal=true' \
  'malformed_input_fails_closed=true' \
  'malformed_runtime_chronology_fails_closed=true' \
  'runtime_chronology_required=true' \
  'duplicate_assignment_executions_allowed=false' \
  'immutable_reviewer_payload_binding_required=true' \
  'provider_authentication_claimed=false' \
  'provider_call_performed=false' \
  'canonical_manuscript_mutation_performed=false' \
  'automatic_canonical_admission_allowed=false' \
  'art_studio_production_source_changed=false' \
  'publication_performed=false'
