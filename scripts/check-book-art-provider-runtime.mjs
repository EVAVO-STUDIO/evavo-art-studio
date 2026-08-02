import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));

const sharedRuntime = read("packages/book-art-runtime/src/index.ts");
const sharedPackage = json("packages/book-art-runtime/package.json");
const sharedTsconfig = json("packages/book-art-runtime/tsconfig.json");
const sharedTests = read("packages/book-art-runtime/test/runtime.test.mjs");
const workerBridge = read("apps/worker/src/book-art-provider-jobs.ts");
const workerIndex = read("apps/worker/src/index.ts");
const workerPackage = json("apps/worker/package.json");
const workerTsconfig = json("apps/worker/tsconfig.json");
const workerTests = read("apps/worker/test/book-art-provider-jobs.test.mjs");
const api = read("apps/api/src/book-art-api.ts");
const apiIndex = read("apps/api/src/index.ts");
const apiPackage = json("apps/api/package.json");
const apiTsconfig = json("apps/api/tsconfig.json");
const apiTests = read("apps/api/test/book-art-api.test.mjs");
const openapi = read("apps/api/openapi.book-art-provider.yaml");
const cli = read("apps/cli/src/book-art-commands.ts");
const cliIndex = read("apps/cli/src/index.ts");
const cliPackage = json("apps/cli/package.json");
const cliTsconfig = json("apps/cli/tsconfig.json");
const cliTests = read("apps/cli/test/book-art-cli.test.mjs");
const mcp = read("apps/mcp/src/book-art-tools.ts");
const mcpIndex = read("apps/mcp/src/index.ts");
const mcpPackage = json("apps/mcp/package.json");
const mcpTsconfig = json("apps/mcp/tsconfig.json");
const mcpTests = read("apps/mcp/test/book-art-tools-contract.test.mjs");
const rootPackage = json("package.json");
const providerOrchestrator = read("packages/providers/src/orchestrator.ts");
const runtimeRepository = read("packages/runtime/src/local-repository.ts");
const workflow = read(".github/workflows/book-art-provider-runtime.yml");
const docs = read("docs/book-art-provider-runtime.md");
const handoffDocs = read("docs/book-studio-production-handoff.md");
const authority = json("docs/BOOK_STUDIO_AND_ART_MIGRATION_AUTHORITY.v2.json");
const problems = [];

function assert(condition, message) {
  if (!condition) problems.push(message);
}

for (const token of [
  "evavo_book_art_provider_shadow_runtime_v1",
  "validateBookArtProductionWorkOrder",
  "validateProviderCandidateRequest",
  "providerRequestSha256",
  "normalizeRuntimeJobSubmission",
  'queue: "provider"',
  'kind: "art.candidate.generate"',
  'migrationMode: "book-art-shadow-candidate"',
  "maximumAttempts: 1",
  "allowFallback: false",
  "request.candidateCount !== 1",
  "request.references.length !== 0",
  '"provider.candidate-store"',
  '"provider.generate"',
  '"evidence.bundle"',
  "workOrderFingerprintSha256",
  "normalizedProviderRequestSha256",
  "runtimeSpecHash",
  "providerCallPerformed: false",
  "candidateArtifactsWritten: false",
  "authoritativeBookWritesPerformed: false",
  "selectionPerformed: false",
  "promotionPerformed: false",
  "bookUseBindingCreated: false",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]) {
  assert(
    sharedRuntime.includes(token),
    `Shared Book Art provider runtime is missing ${token}`,
  );
}

for (const forbidden of [
  "executeProviderCandidateRequest",
  "ProviderRegistry",
  "ArtifactStore",
  "providerCallPerformed: true",
  "candidateArtifactsWritten: true",
  "authoritativeBookWritesPerformed: true",
  "selectionPerformed: true",
  "promotionPerformed: true",
  "bookUseBindingCreated: true",
  "runtimeCutoverApproved: true",
  "publicationPerformed: true",
]) {
  assert(
    !sharedRuntime.includes(forbidden),
    `Book Art compilation/submission boundary must not contain ${forbidden}`,
  );
}
assert(
  (sharedRuntime.match(/options\.runtime\.submit\(/g) ?? []).length === 1,
  "Shared Book Art provider submission must have exactly one durable-runtime write boundary",
);
assert(
  workerBridge.trim() === 'export * from "@evavo/art-book-runtime";',
  "Worker Book Art module must be a compatibility re-export of the shared package",
);
assert(
  sharedPackage.name === "@evavo/art-book-runtime",
  "Shared Book Art package name is incorrect",
);
for (const dependency of [
  "@evavo/art-artifacts",
  "@evavo/art-contracts",
  "@evavo/art-providers",
  "@evavo/art-runtime",
]) {
  assert(
    sharedPackage.dependencies?.[dependency] === "workspace:*",
    `Shared Book Art package is missing ${dependency}`,
  );
}
for (const reference of [
  "../artifacts",
  "../contracts",
  "../providers",
  "../runtime",
]) {
  assert(
    sharedTsconfig.references?.some((entry) => entry.path === reference),
    `Shared Book Art TypeScript project is missing ${reference}`,
  );
}
assert(
  rootPackage.scripts?.["build:domain"]?.includes(
    "@evavo/art-book-runtime build",
  ),
  "Domain build must include the shared Book Art runtime package",
);

for (const [label, packageJson, tsconfig, reference] of [
  ["worker", workerPackage, workerTsconfig, "../../packages/book-art-runtime"],
  ["API", apiPackage, apiTsconfig, "../../packages/book-art-runtime"],
  ["CLI", cliPackage, cliTsconfig, "../../packages/book-art-runtime"],
  ["MCP", mcpPackage, mcpTsconfig, "../../packages/book-art-runtime"],
]) {
  assert(
    packageJson.dependencies?.["@evavo/art-book-runtime"] === "workspace:*",
    `${label} must depend on the shared Book Art runtime package`,
  );
  assert(
    tsconfig.references?.some((entry) => entry.path === reference),
    `${label} must reference the shared Book Art runtime TypeScript project`,
  );
}
for (const token of [
  "compileBookArtProviderShadowJob",
  "submitBookArtProviderShadowJob",
  "BOOK_ART_PROVIDER_RUNTIME_CONTRACT",
]) {
  assert(workerIndex.includes(token), `Worker package entry point must export ${token}`);
}

for (const token of [
  'storageClass: "intermediate"',
  'artifactRole: "provider-candidate"',
  'approvalState: "unapproved"',
  "finalDeliverable: false",
  "requiresMastering: true",
  "requiresBlockingQa: true",
]) {
  assert(providerOrchestrator.includes(token), `Provider candidate storage is missing ${token}`);
}
for (const token of [
  "idempotencyIndexKey",
  "existing.specHash !== entry.specHash",
  "resultIds.push(existing.id)",
  'draft("job.submitted"',
]) {
  assert(runtimeRepository.includes(token), `Durable idempotency implementation is missing ${token}`);
}

for (const token of [
  "/v1/book-art/provider-runtime",
  "/v1/book-art/provider-jobs/compile",
  "/v1/book-art/provider-jobs/submit",
  "BOOK_ART_PROVIDER_POLICY_NOT_CONFIGURED",
  "BOOK_ART_RUNTIME_UNAUTHORIZED",
  "Object.hasOwn(body, \"adapterPolicy\")",
  "compileBookArtProviderShadowJob",
  "submitBookArtProviderShadowJob",
  "providerPolicyConfigured",
  "maximumRuntimeAttempts: 1",
  "providerFallbackAllowed: false",
  "candidateApprovalState: \"unapproved\"",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]) {
  assert(api.includes(token), `Book Art REST surface is missing ${token}`);
}
for (const token of [
  "handleBookArtApiRequest",
  "bookArtProviderAdapterPolicy",
  "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
  "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
  "EVAVO_BOOK_ART_PROVIDER_MODEL",
  "bookArtProviderPolicyConfigured",
]) {
  assert(apiIndex.includes(token), `API server is missing Book Art wiring: ${token}`);
}

for (const token of [
  "book-art-provider-protocol",
  "book-art-provider-compile",
  "book-art-provider-submit",
  "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
  "Object.hasOwn(input, \"adapterPolicy\")",
  "compileBookArtProviderShadowJob",
  "submitBookArtProviderShadowJob",
  "LocalRuntimeRepository",
  "maximumRuntimeAttempts: 1",
  "providerFallbackAllowed: false",
]) {
  assert(cli.includes(token), `Book Art CLI surface is missing ${token}`);
}
assert(
  cliIndex.includes("handleBookArtCommand("),
  "CLI dispatcher must route Book Art commands",
);

for (const token of [
  "book_art_provider_runtime_protocol",
  "compile_book_art_provider_shadow_job",
  "submit_book_art_provider_shadow_job",
  "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
  "EVAVO_ART_ALLOW_WRITES",
  "Object.hasOwn(input, \"adapterPolicy\")",
  "compileBookArtProviderShadowJob",
  "submitBookArtProviderShadowJob",
  "LocalRuntimeRepository",
  "maximumRuntimeAttempts: 1",
  "providerFallbackAllowed: false",
]) {
  assert(mcp.includes(token), `Book Art MCP surface is missing ${token}`);
}
assert(
  mcpIndex.includes("registerBookArtTools(server)"),
  "MCP server must register Book Art tools",
);

for (const [label, source] of [
  ["REST", api],
  ["CLI", cli],
  ["MCP", mcp],
]) {
  for (const forbidden of [
    "ProviderRegistry",
    "createProviderHandlers",
    "executeProviderCandidateRequest",
    "FixtureImageProviderAdapter",
    "LocalArtifactStore",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "promoteSelectedCandidate",
    "updateReference(",
    "bookUseBindingCreated: true",
    "runtimeCutoverApproved: true",
    "publicationPerformed: true",
  ]) {
    assert(
      !source.includes(forbidden),
      `${label} Book Art surface contains forbidden shortcut ${forbidden}`,
    );
  }
}

for (const title of [
  "shared Book Art runtime compiles the exact no-fallback one-attempt contract",
  "shared Book Art runtime submission remains durable and idempotent",
]) {
  assert(sharedTests.includes(title), `Shared Book Art tests are missing: ${title}`);
}
for (const title of [
  "compiles one deterministic no-fallback Book Art provider job without side effects",
  "blocks malformed policies, invalid timestamps and tampered work orders fail closed",
  "reuses one durable job for duplicate Book Art submissions",
  "executes one fixture candidate once and leaves it unapproved and intermediate",
]) {
  assert(workerTests.includes(title), `Worker Book Art tests are missing: ${title}`);
}
for (const token of [
  "Book Art REST compilation injects host policy and performs no runtime write",
  "Book Art REST submission is authenticated and duplicate-safe without provider execution",
  "BOOK_ART_RUNTIME_UNAUTHORIZED",
  "BOOK_ART_PROVIDER_REQUEST_INVALID",
]) {
  assert(apiTests.includes(token), `Book Art REST tests are missing ${token}`);
}
for (const token of [
  "CLI compiles with host policy and writes no runtime job",
  "CLI submits one duplicate-safe durable Book Art job without a provider call",
  "CLI rejects caller-supplied provider policy",
]) {
  assert(cliTests.includes(token), `Book Art CLI tests are missing ${token}`);
}
for (const token of [
  "compile_book_art_provider_shadow_job",
  "submit_book_art_provider_shadow_job",
  "execution shortcut",
]) {
  assert(mcpTests.includes(token), `Book Art MCP tests are missing ${token}`);
}
for (const token of [
  "/v1/book-art/provider-runtime:",
  "/v1/book-art/provider-jobs/compile:",
  "/v1/book-art/provider-jobs/submit:",
  "additionalProperties: false",
  "ArtStudioControlToken",
  "maximumRuntimeAttempts: { const: 1 }",
  "providerFallbackAllowed: { const: false }",
]) {
  assert(openapi.includes(token), `Book Art OpenAPI is missing ${token}`);
}

for (const token of [
  "packages/book-art-runtime/src/index.ts",
  "packages/book-art-runtime/test/runtime.test.mjs",
  "apps/worker/test/book-art-provider-jobs.test.mjs",
  "apps/api/test/book-art-api.test.mjs",
  "apps/cli/test/book-art-cli.test.mjs",
  "apps/mcp/test/book-art-tools-contract.test.mjs",
  "scripts/check-book-art-provider-runtime.mjs",
  "pnpm run build:domain",
  "@evavo/art-book-runtime test",
  "@evavo/art-studio-worker test",
  "@evavo/art-studio-api test",
  "@evavo/art-studio-cli test",
  "@evavo/art-studio-mcp test",
  "git diff --exit-code",
]) {
  assert(workflow.includes(token), `Book Art provider runtime workflow is missing ${token}`);
}

for (const token of [
  "Shared runtime ownership",
  "REST, CLI and MCP parity",
  "exactly one provider candidate",
  "one runtime attempt",
  "no provider fallback",
  "unapproved intermediate",
  "Website remains the active compatibility runtime",
  "No production cutover",
  "Docs Suite remains authoritative",
]) {
  assert(docs.includes(token), `Book Art provider runtime documentation is missing ${token}`);
}
assert(
  handoffDocs.includes("durable Book Art provider shadow runtime"),
  "Book Studio handoff documentation must record the durable shadow runtime",
);

assert(authority.gates?.noDualAuthoritativeWrites === true, "Book Art migration must prohibit dual authoritative writes");
assert(authority.gates?.runtimeCutoverApproved === false, "Book Art runtime cutover must remain blocked");
assert(authority.gates?.websiteSourceDeletionAllowed === false, "Website source deletion must remain blocked");
assert(authority.currentFlags?.websiteRuntimeStillActive === true, "Website compatibility runtime must remain active");
assert(authority.currentFlags?.artStudioBookProfileAuthoritative === false, "Art Studio Book profile cannot yet be called authoritative");
assert(authority.currentFlags?.publicationPerformed === false, "Book Art provider runtime cannot claim publication");

if (problems.length) {
  console.error("Book Art provider runtime boundary check failed.");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      contract: "evavo_book_art_provider_shadow_runtime_v1",
      sharedRuntimePackage: "@evavo/art-book-runtime",
      workerCompatibilityReexport: true,
      restParity: true,
      cliParity: true,
      mcpParity: true,
      hostOwnedProviderPolicy: true,
      oneCandidate: true,
      oneRuntimeAttempt: true,
      providerFallbackAllowed: false,
      duplicateSubmissionReusesJob: true,
      providerExecutionDuringCompilation: false,
      providerExecutionDuringSubmission: false,
      candidateApprovalState: "unapproved",
      candidateStorageClass: "intermediate",
      selectionPerformed: false,
      promotionPerformed: false,
      bookUseBindingCreated: false,
      authoritativeBookWritesPerformed: false,
      websiteRuntimeStillActive: true,
      runtimeCutoverApproved: false,
      publicationPerformed: false,
    },
    null,
    2,
  ),
);
