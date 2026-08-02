import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const json = (relative) => JSON.parse(read(relative));

const bridge = read("apps/worker/src/book-art-provider-jobs.ts");
const workerIndex = read("apps/worker/src/index.ts");
const workerPackage = json("apps/worker/package.json");
const workerTsconfig = json("apps/worker/tsconfig.json");
const tests = read("apps/worker/test/book-art-provider-jobs.test.mjs");
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
  'maximumAttempts: 1',
  'allowFallback: false',
  'request.candidateCount !== 1',
  'request.references.length !== 0',
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
  assert(bridge.includes(token), `Book Art provider runtime bridge is missing ${token}`);
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
  assert(!bridge.includes(forbidden), `Book Art compilation/submission boundary must not contain ${forbidden}`);
}

assert(
  (bridge.match(/options\.runtime\.submit\(/g) ?? []).length === 1,
  "Book Art provider submission must have exactly one durable-runtime write boundary",
);
assert(
  workerPackage.dependencies?.["@evavo/art-contracts"] === "workspace:*",
  "Worker must declare the Book Art contract package dependency",
);
assert(
  workerTsconfig.references?.some((entry) => entry.path === "../../packages/contracts"),
  "Worker TypeScript project must reference the Book Art contract project",
);
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

for (const title of [
  "compiles one deterministic no-fallback Book Art provider job without side effects",
  "blocks malformed policies, invalid timestamps and tampered work orders fail closed",
  "reuses one durable job for duplicate Book Art submissions",
  "executes one fixture candidate once and leaves it unapproved and intermediate",
]) {
  assert(tests.includes(title), `Book Art provider runtime tests are missing: ${title}`);
}
for (const token of [
  "adapter.calls, 1",
  "runtime.events()",
  'event.type === "job.submitted"',
  'candidates[0].labels.approvalState',
  'evidenceBody.request.selection.allowFallback',
  "forbiddenRoles",
]) {
  assert(tests.includes(token), `Book Art provider runtime regression evidence is missing ${token}`);
}

for (const token of [
  "apps/worker/src/book-art-provider-jobs.ts",
  "apps/worker/test/book-art-provider-jobs.test.mjs",
  "scripts/check-book-art-provider-runtime.mjs",
  "docs/book-art-provider-runtime.md",
  "pnpm run build:domain",
  "@evavo/art-studio-worker test",
  "git diff --exit-code",
]) {
  assert(workflow.includes(token), `Book Art provider runtime workflow is missing ${token}`);
}

for (const token of [
  "Compile, submit, execute",
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
