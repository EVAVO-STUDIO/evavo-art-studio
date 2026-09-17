import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));
const inspection = read("packages/book-art-runtime/src/inspection.ts");
const sharedPackage = json("packages/book-art-runtime/package.json");
const api = read("apps/api/src/book-art-api.ts");
const apiIndex = read("apps/api/src/index.ts");
const apiTests = read("apps/api/test/book-art-api-inspection.test.mjs");
const openapi = read("apps/api/openapi.book-art-provider.yaml");
const cli = read("apps/cli/src/book-art-commands.ts");
const cliIndex = read("apps/cli/src/index.ts");
const cliTests = read("apps/cli/test/book-art-cli-inspection.test.mjs");
const mcp = read("apps/mcp/src/book-art-tools.ts");
const mcpTests = read("apps/mcp/test/book-art-tools-contract.test.mjs");
const workerTests = read("apps/worker/test/book-art-provider-inspection.test.mjs");
const docs = read("docs/book-art-provider-runtime.md");
const workflow = read(".github/workflows/book-art-provider-runtime.yml");
const problems = [];

function assert(condition, message) {
  if (!condition) problems.push(message);
}

assert(
  sharedPackage.exports?.["./inspection"]?.import === "./dist/inspection.js" &&
    sharedPackage.exports?.["./inspection"]?.types === "./dist/inspection.d.ts",
  "Shared Book Art package must export its typed inspection module",
);
for (const token of [
  "inspectBookArtProviderShadowJob",
  "evavo_book_art_provider_shadow_job_inspection_result",
  '"not-submitted"',
  '"pending"',
  '"failed"',
  '"succeeded"',
  "runtime.get(plan.runtimeJobId)",
  "job.specHash !== plan.runtimeSpecHash",
  "job.attempts.length > 1",
  "artifacts.verify",
  "artifacts.read",
  'artifactRole !== "provider-candidate"',
  'artifactRole !== "provider-candidate-evidence"',
  'storageClass !== "intermediate"',
  'approvalState !== "unapproved"',
  "providerRequestSha256",
  "validateProviderCandidateRequest",
  "FORBIDDEN_ARTIFACT_ROLES",
  '"selected-art-master"',
  '"candidate-promotion-authorization"',
  '"book-art-use-binding"',
  '"publication-package"',
  "inspectionFingerprintSha256",
  "inspectionReadOnly: true",
  "providerCallPerformedByInspection: false",
  "candidateArtifactsWrittenByInspection: false",
  "authoritativeBookWritesPerformed: false",
  "selectionPerformed: false",
  "promotionPerformed: false",
  "bookUseBindingCreated: false",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]) {
  assert(inspection.includes(token), `Book Art inspection is missing ${token}`);
}
for (const forbidden of [
  "ProviderRegistry",
  "executeProviderCandidateRequest",
  "createProviderHandlers",
  ".submit(",
  ".put(",
  "updateReference(",
  "providerCallPerformedByInspection: true",
  "candidateArtifactsWrittenByInspection: true",
  "selectionPerformed: true",
  "promotionPerformed: true",
  "bookUseBindingCreated: true",
  "runtimeCutoverApproved: true",
  "publicationPerformed: true",
]) {
  assert(
    !inspection.includes(forbidden),
    `Book Art inspection contains forbidden authority ${forbidden}`,
  );
}

for (const token of [
  "/v1/book-art/provider-jobs/inspect",
  "inspectBookArtProviderShadowJob",
  "ART_STUDIO_ARTIFACT_STORE_NOT_CONFIGURED",
  "artifacts: context.artifacts!",
  "inspectPerformsProviderCall: false",
  "inspectionWritesArtifacts: false",
]) {
  assert(api.includes(token), `Book Art REST inspection is missing ${token}`);
}
assert(
  /handleBookArtApiRequest\(\{[\s\S]*?runtime,\s*artifacts,\s*adapterPolicy:/.test(
    apiIndex,
  ),
  "API server must inject its configured immutable artifact store into Book Art inspection",
);

for (const token of [
  "book-art-provider-inspect",
  "inspectBookArtProviderShadowJob",
  "LocalRuntimeRepository",
  "LocalArtifactStore",
  "EVAVO_ART_RUNTIME_ROOT",
  "EVAVO_ART_ARTIFACT_ROOT",
  "inspectPerformsProviderCall: false",
  "inspectionWritesArtifacts: false",
]) {
  assert(cli.includes(token), `Book Art CLI inspection is missing ${token}`);
}
assert(
  cliIndex.includes("book-art-provider-inspect"),
  "CLI help must document Book Art provider inspection",
);

for (const token of [
  "inspect_book_art_provider_shadow_job",
  "inspectBookArtProviderShadowJob",
  "LocalRuntimeRepository",
  "LocalArtifactStore",
  "EVAVO_ART_RUNTIME_ROOT",
  "EVAVO_ART_ARTIFACT_ROOT",
  "requireOperationalAccess",
  "inspectPerformsProviderCall: false",
  "inspectionWritesArtifacts: false",
]) {
  assert(mcp.includes(token), `Book Art MCP inspection is missing ${token}`);
}
for (const forbidden of [
  "ProviderRegistry",
  "executeProviderCandidateRequest",
  "createProviderHandlers",
  ".put(",
  "updateReference(",
  "promoteSelectedCandidate",
]) {
  assert(
    !mcp.includes(forbidden),
    `Book Art MCP inspection contains forbidden shortcut ${forbidden}`,
  );
}

for (const token of [
  "/v1/book-art/provider-jobs/inspect:",
  "BookArtProviderInspectionResult:",
  "evavo_book_art_provider_shadow_job_inspection_result",
  "inspectionReadOnly: { const: true }",
  "providerCallPerformedByInspection: { const: false }",
  "candidateArtifactsWrittenByInspection: { const: false }",
  "status: { enum: [blocked, not-submitted, pending, failed, succeeded] }",
  "ArtStudioControlToken",
]) {
  assert(openapi.includes(token), `Book Art inspection OpenAPI is missing ${token}`);
}

for (const token of [
  "Book Art inspection proves absent, queued and successful immutable shadow states",
  "Book Art inspection blocks a descriptor that falsely claims candidate approval",
]) {
  assert(workerTests.includes(token), `Worker inspection tests are missing ${token}`);
}
assert(
  apiTests.includes(
    "Book Art REST inspection is protected, read-only and reports exact pending state",
  ),
  "REST inspection regression is missing",
);
assert(
  cliTests.includes(
    "CLI inspection reports read-only not-submitted and pending Book Art states",
  ),
  "CLI inspection regression is missing",
);
assert(
  mcpTests.includes("inspect_book_art_provider_shadow_job"),
  "MCP inspection contract regression is missing",
);

for (const token of [
  "### Inspect",
  "inspectionFingerprintSha256",
  "Descriptor claims are never trusted by themselves",
  "POST /v1/book-art/provider-jobs/inspect",
  "book-art-provider-inspect",
  "inspect_book_art_provider_shadow_job",
  "providerCallPerformedByInspection: false",
  "candidateArtifactsWrittenByInspection: false",
  "Website remains the active compatibility runtime",
  "No production cutover is approved",
]) {
  assert(docs.includes(token), `Book Art inspection documentation is missing ${token}`);
}

for (const token of [
  "packages/book-art-runtime/src/inspection.ts",
  "apps/worker/test/book-art-provider-inspection.test.mjs",
  "apps/api/test/book-art-api-inspection.test.mjs",
  "apps/cli/test/book-art-cli-inspection.test.mjs",
  "scripts/check-book-art-provider-inspection.mjs",
  "node scripts/check-book-art-provider-inspection.mjs",
  "pnpm check",
]) {
  assert(workflow.includes(token), `Book Art inspection workflow is missing ${token}`);
}

if (problems.length) {
  console.error("Book Art provider inspection boundary check failed.");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      contract: "evavo_book_art_provider_shadow_runtime_v1",
      inspectionResult:
        "evavo_book_art_provider_shadow_job_inspection_result",
      runtimeAndArtifactReadsOnly: true,
      immutableDescriptorAndContentVerification: true,
      exactCandidateCount: 1,
      exactProviderEvidenceCount: 1,
      candidateApprovalState: "unapproved",
      candidateStorageClass: "intermediate",
      providerCallPerformedByInspection: false,
      candidateArtifactsWrittenByInspection: false,
      authoritativeBookWritesPerformed: false,
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
