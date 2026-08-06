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

# Source the previously reviewed exact-mirror assembler. Because this script is
# sourced, its EXIT cleanup remains deferred until this outer validation exits.
# The original consensus and deep-integrity suites execute before the new layer.
# shellcheck source=../docs-editorial-consensus/run-core-validation-exact.sh
source "${ROOT}/validation/docs-editorial-consensus/run-core-validation-exact.sh"

verify_blob \
  "validation/docs-narrative-craft/src/book-studio-unattended-editorial-consensus-runtime-evidence.ts" \
  "f45a9ea2f12d7b17f96c77264578bade56f507e7"
verify_blob \
  "validation/docs-narrative-craft/src/book-studio-unattended-editorial-consensus-runtime-boundary.ts" \
  "f7f3f982b66c3c9062c5070b0f58aac6d2e6c02f"
verify_blob \
  "validation/docs-narrative-craft/src/book-studio-writing-candidate-contracts.ts" \
  "1c6e28d9007cba88a90f9d125000bf084f48a3d8"
verify_blob \
  "validation/docs-narrative-craft/src/book-studio-writing-handoff-response.ts" \
  "1939f3b593507431878daa37476c5c7bef9c0faa"
verify_blob \
  "validation/docs-narrative-craft/test/book-studio-narrative-craft-fixtures.mjs" \
  "ab7e38e1df4f292ecb0fc4be14459b5976bea43f"
verify_blob \
  "validation/docs-narrative-craft/test/book-studio-unattended-editorial-consensus-runtime-evidence.test.mjs" \
  "7f3346e15eb26b89d99431147b7e3b9dd65b1395"
verify_blob \
  "validation/docs-narrative-craft/test/book-studio-unattended-editorial-consensus-runtime-boundary.test.mjs" \
  "a6f2d940577e114cd5221668f5c09165c9e1ec6b"

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

const requiredBoundaryTokens = [
  "MAX_REVIEWERS = 8",
  "evaluateBookUnattendedEditorialConsensusIntegrity",
  "validateRuntimeChronology",
  "reports unresolved runtime blockers",
  "reports unresolved handoff risks",
  "could not be validated safely",
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
const runtimeOffset = boundary.indexOf("evaluateRuntimeEvidenceUnchecked(input)");
if (semanticOffset < 0 || runtimeOffset < 0 || semanticOffset >= runtimeOffset) {
  throw new Error("semantic validation must precede runtime-evidence traversal");
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

npm exec --yes --package=typescript@5.9.3 -- \
  tsc -p "${WORKSPACE}/tsconfig.json"

npm exec --yes --package=tsx@4.20.3 -- \
  tsx --test \
  "${WORKSPACE}/test/book-studio-unattended-editorial-consensus-runtime-evidence.test.mjs" \
  "${WORKSPACE}/test/book-studio-unattended-editorial-consensus-runtime-boundary.test.mjs"

printf '%s\n' \
  'exact_runtime_evidence_source=true' \
  'exact_runtime_boundary_source=true' \
  'exact_writing_candidate_validator=true' \
  'exact_handoff_response_validator=true' \
  'semantic_validation_precedes_runtime_traversal=true' \
  'malformed_input_fails_closed=true' \
  'runtime_chronology_required=true' \
  'duplicate_assignment_executions_allowed=false' \
  'immutable_reviewer_payload_binding_required=true' \
  'provider_authentication_claimed=false' \
  'provider_call_performed=false' \
  'canonical_manuscript_mutation_performed=false' \
  'automatic_canonical_admission_allowed=false' \
  'art_studio_production_source_changed=false' \
  'publication_performed=false'
