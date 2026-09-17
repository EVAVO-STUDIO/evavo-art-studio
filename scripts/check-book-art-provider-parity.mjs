import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));

const parity = read("packages/book-art-runtime/src/parity.ts");
const sharedPackage = json("packages/book-art-runtime/package.json");
const sharedTests = read("packages/book-art-runtime/test/parity.test.mjs");
const workerTests = read("apps/worker/test/book-art-provider-parity.test.mjs");
const api = read("apps/api/src/book-art-api.ts");
const apiTests = read("apps/api/test/book-art-api-parity.test.mjs");
const openapi = read("apps/api/openapi.book-art-provider-parity.yaml");
const openapiTests = read("apps/api/test/book-art-parity-openapi-contract.test.mjs");
const cli = read("apps/cli/src/book-art-commands.ts");
const cliIndex = read("apps/cli/src/index.ts");
const cliTests = read("apps/cli/test/book-art-cli-parity.test.mjs");
const mcp = read("apps/mcp/src/book-art-tools.ts");
const mcpTests = read("apps/mcp/test/book-art-parity-contract.test.mjs");
const docs = read("docs/book-art-provider-runtime.md");
const workflow = read(".github/workflows/book-art-provider-runtime.yml");
const problems = [];

function assert(condition, message) {
  if (!condition) problems.push(message);
}

assert(
  sharedPackage.exports?.["./parity"]?.import === "./dist/parity.js" &&
    sharedPackage.exports?.["./parity"]?.types === "./dist/parity.d.ts",
  "Shared Book Art package must export its typed parity module",
);

for (const token of [
  "WebsiteBookArtProviderShadowObservationV1",
  "validateWebsiteBookArtProviderShadowObservation",
  "fingerprintWebsiteBookArtProviderShadowObservation",
  "compareBookArtProviderShadowParity",
  "evavo_website_book_art_provider_shadow_observation",
  "evavo_book_art_provider_shadow_parity_result",
  '"blocked"',
  '"incomplete"',
  '"matched"',
  '"mismatched"',
  "inspectBookArtProviderShadowJob",
  "sourceCommitSha",
  "sourceBriefFingerprint",
  "workOrderFingerprintSha256",
  "normalizedProviderRequestSha256",
  "requestedCandidateCount: 1",
  "providerFallbackUsed: false",
  "attemptBoundaryMatched",
  "providerPolicyMatched",
  "adapterMatched",
  "modelMatched",
  "candidateBoundaryMatched",
  "failureClassificationMatched",
  "parityFingerprintSha256",
  "parityReadOnly: true",
  "parityScope: \"request-execution-and-authority\"",
  "providerCallPerformedByParity: false",
  "artifactWritesPerformedByParity: false",
  "visualSimilarityEvaluated: false",
  "candidateBytesExpectedEqual: false",
  "observationPeriodSatisfied: false",
  "cutoverEligible: false",
  "websiteRuntimeStillActive: true",
  "websiteSourceDeletionAllowed: false",
  "authoritativeBookWritesPerformed: false",
  "selectionPerformed: false",
  "promotionPerformed: false",
  "bookUseBindingCreated: false",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]) {
  assert(parity.includes(token), `Book Art provider parity is missing ${token}`);
}

for (const forbidden of [
  "ProviderRegistry",
  "createProviderHandlers",
  "executeProviderCandidateRequest",
  "FixtureImageProviderAdapter",
  ".submit(",
  ".put(",
  "updateReference(",
  "promoteSelectedCandidate",
  "providerCallPerformedByParity: true",
  "artifactWritesPerformedByParity: true",
  "visualSimilarityEvaluated: true",
  "candidateBytesExpectedEqual: true",
  "observationPeriodSatisfied: true",
  "cutoverEligible: true",
  "websiteRuntimeStillActive: false",
  "websiteSourceDeletionAllowed: true",
  "selectionPerformed: true",
  "promotionPerformed: true",
  "bookUseBindingCreated: true",
  "runtimeCutoverApproved: true",
  "publicationPerformed: true",
]) {
  assert(
    !parity.includes(forbidden),
    `Book Art provider parity contains forbidden authority ${forbidden}`,
  );
}

for (const token of [
  "/v1/book-art/provider-jobs/parity",
  "configuredParityInput",
  "compareBookArtProviderShadowParity",
  "websiteObservation",
  "parityPerformsProviderCall: false",
  "parityWritesArtifacts: false",
  "visualSimilarityEvaluated: false",
  "cutoverEligible: false",
  "ART_STUDIO_RUNTIME_NOT_CONFIGURED",
  "ART_STUDIO_ARTIFACT_STORE_NOT_CONFIGURED",
]) {
  assert(api.includes(token), `Book Art parity REST surface is missing ${token}`);
}

for (const token of [
  "book-art-provider-parity",
  "configuredParityInput",
  "compareBookArtProviderShadowParity",
  "websiteObservation",
  "LocalRuntimeRepository",
  "LocalArtifactStore",
  "EVAVO_ART_RUNTIME_ROOT",
  "EVAVO_ART_ARTIFACT_ROOT",
  "parityPerformsProviderCall: false",
  "parityWritesArtifacts: false",
  "visualSimilarityEvaluated: false",
  "cutoverEligible: false",
]) {
  assert(cli.includes(token), `Book Art parity CLI surface is missing ${token}`);
}
assert(
  cliIndex.includes("book-art-provider-parity"),
  "CLI help must document Book Art provider parity",
);

for (const token of [
  "compare_book_art_provider_shadow_parity",
  "compareBookArtProviderShadowParity",
  "websiteObservation",
  "requireOperationalAccess",
  "LocalRuntimeRepository",
  "LocalArtifactStore",
  "EVAVO_ART_RUNTIME_ROOT",
  "EVAVO_ART_ARTIFACT_ROOT",
  "parityPerformsProviderCall: false",
  "parityWritesArtifacts: false",
  "visualSimilarityEvaluated: false",
  "cutoverEligible: false",
]) {
  assert(mcp.includes(token), `Book Art parity MCP surface is missing ${token}`);
}
for (const source of [api, cli, mcp]) {
  for (const forbidden of [
    "ProviderRegistry",
    "executeProviderCandidateRequest",
    "createProviderHandlers",
    "FixtureImageProviderAdapter",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "promoteSelectedCandidate",
    "updateReference(",
    "visualSimilarityEvaluated: true",
    "cutoverEligible: true",
    "runtimeCutoverApproved: true",
    "publicationPerformed: true",
  ]) {
    assert(
      !source.includes(forbidden),
      `Book Art parity public surface contains forbidden shortcut ${forbidden}`,
    );
  }
}

for (const token of [
  "/v1/book-art/provider-jobs/parity:",
  "BookArtProviderShadowParityRequest:",
  "WebsiteBookArtProviderShadowObservation:",
  "BookArtProviderShadowParityResult:",
  "evavo_website_book_art_provider_shadow_observation",
  "evavo_book_art_provider_shadow_parity_result",
  "status: { enum: [blocked, incomplete, matched, mismatched] }",
  "requestedCandidateCount: { const: 1 }",
  "providerFallbackUsed: { const: false }",
  "parityReadOnly: { const: true }",
  "providerCallPerformedByParity: { const: false }",
  "artifactWritesPerformedByParity: { const: false }",
  "visualSimilarityEvaluated: { const: false }",
  "candidateBytesExpectedEqual: { const: false }",
  "observationPeriodSatisfied: { const: false }",
  "cutoverEligible: { const: false }",
  "websiteRuntimeStillActive: { const: true }",
  "websiteSourceDeletionAllowed: { const: false }",
  "runtimeCutoverApproved: { const: false }",
  "publicationPerformed: { const: false }",
  "ArtStudioControlToken",
]) {
  assert(openapi.includes(token), `Book Art parity OpenAPI is missing ${token}`);
}

for (const token of [
  "shared parity reports matching not-submitted observations as incomplete and read-only",
  "Website parity observation fingerprint fails closed after request tampering",
]) {
  assert(sharedTests.includes(token), `Shared parity tests are missing ${token}`);
}
for (const token of [
  "Book Art parity matches independently observed one-attempt unapproved candidates",
  "different provider models",
]) {
  assert(workerTests.includes(token), `Worker parity tests are missing ${token}`);
}
assert(
  apiTests.includes(
    "Book Art REST parity is protected, read-only and reports matching incomplete state",
  ),
  "REST parity regression is missing",
);
assert(
  cliTests.includes(
    "CLI parity reports matching incomplete state without submitting or writing artifacts",
  ),
  "CLI parity regression is missing",
);
assert(
  mcpTests.includes(
    "MCP exposes structural Website parity without provider, promotion or cutover authority",
  ),
  "MCP parity contract regression is missing",
);
assert(
  openapiTests.includes(
    "Book Art parity OpenAPI remains structural, protected and cutover-ineligible",
  ),
  "Book Art parity OpenAPI regression is missing",
);

for (const token of [
  "### Compare structural Website parity",
  "evavo_website_book_art_provider_shadow_observation",
  "parityFingerprintSha256",
  "POST /v1/book-art/provider-jobs/parity",
  "book-art-provider-parity",
  "compare_book_art_provider_shadow_parity",
  "Structural shadow parity does not compare candidate pixels",
  "observationPeriodSatisfied: false",
  "cutoverEligible: false",
  "websiteRuntimeStillActive: true",
  "websiteSourceDeletionAllowed: false",
  "No production cutover is approved",
]) {
  assert(docs.includes(token), `Book Art parity documentation is missing ${token}`);
}

for (const token of [
  "packages/book-art-runtime/src/parity.ts",
  "packages/book-art-runtime/test/parity.test.mjs",
  "apps/worker/test/book-art-provider-parity.test.mjs",
  "apps/api/openapi.book-art-provider-parity.yaml",
  "apps/api/test/book-art-api-parity.test.mjs",
  "apps/api/test/book-art-parity-openapi-contract.test.mjs",
  "apps/cli/test/book-art-cli-parity.test.mjs",
  "apps/mcp/test/book-art-parity-contract.test.mjs",
  "scripts/check-book-art-provider-parity.mjs",
  "node scripts/check-book-art-provider-parity.mjs",
  "pnpm check",
]) {
  assert(workflow.includes(token), `Book Art parity workflow is missing ${token}`);
}

if (problems.length) {
  console.error("Book Art provider shadow parity boundary check failed.");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      contract: "evavo_book_art_provider_shadow_runtime_v1",
      websiteObservation:
        "evavo_website_book_art_provider_shadow_observation",
      parityResult: "evavo_book_art_provider_shadow_parity_result",
      requestIdentityAndFingerprintParity: true,
      oneAttemptNoFallbackParity: true,
      providerAdapterAndModelParity: true,
      candidateAuthorityParity: true,
      visualSimilarityEvaluated: false,
      candidateBytesExpectedEqual: false,
      parityReadOnly: true,
      providerCallPerformedByParity: false,
      artifactWritesPerformedByParity: false,
      observationPeriodSatisfied: false,
      cutoverEligible: false,
      websiteRuntimeStillActive: true,
      websiteSourceDeletionAllowed: false,
      selectionPerformed: false,
      promotionPerformed: false,
      bookUseBindingCreated: false,
      runtimeCutoverApproved: false,
      publicationPerformed: false,
    },
    null,
    2,
  ),
);
