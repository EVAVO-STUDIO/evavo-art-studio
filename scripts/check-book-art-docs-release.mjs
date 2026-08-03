import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const files = {
  contract: "packages/contracts/src/book-production-docs-release.ts",
  contractsIndex: "packages/contracts/src/index.ts",
  contractTest: "packages/contracts/test/book-production-docs-release.test.mjs",
  runtime: "packages/book-art-runtime/src/docs-release.ts",
  runtimePackage: "packages/book-art-runtime/package.json",
  runtimeTest: "packages/book-art-runtime/test/docs-release.test.mjs",
  api: "apps/api/src/book-art-api.ts",
  apiTest: "apps/api/test/book-art-docs-release-api.test.mjs",
  openapi: "apps/api/openapi.book-art-docs-release.yaml",
  openapiTest: "apps/api/test/book-art-docs-release-openapi-contract.test.mjs",
  cli: "apps/cli/src/book-art-commands.ts",
  cliTest: "apps/cli/test/book-art-docs-release-cli.test.mjs",
  mcp: "apps/mcp/src/book-art-tools.ts",
  mcpTest: "apps/mcp/test/book-art-tools-contract.test.mjs",
  docs: "docs/book-art-docs-release.md",
  workflow: ".github/workflows/book-art-docs-release.yml",
};
const source = {};
const problems = [];
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) problems.push(`missing ${label}: ${relative}`);
  source[label] = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}
const requireTokens = (label, tokens) => {
  for (const token of tokens) {
    if (!source[label].includes(token)) problems.push(`${label} missing ${token}`);
  }
};
const forbidTokens = (label, tokens) => {
  for (const token of tokens) {
    if (source[label].includes(token)) problems.push(`${label} contains forbidden ${token}`);
  }
};

requireTokens("contract", [
  "evavo_art_studio_docs_book_release_v1",
  "evavo_docs_book_writing_art_release_v1",
  "compileDocsBookArtReleaseEnvelope",
  "fingerprintDocsBookWritingArtReleaseReceipt",
  "d7e5cd0f79ebcb211c502d33a90f84e93763f23c",
  "c776a9e7f856815dbb92ffec08426cd12f176bea",
  "e9e96fd54a9e9d9c16bbd8faa2231caebb840c45",
  "Docs Book Art release fingerprint differs from its exact canonical contents",
  "Final Art brief is missing Docs release evidence",
  "writingStudioMayCallArtStudioDirectly !== false",
  "authoritativeBookWritesAllowed !== false",
  "artStudioCandidateMayBeFinal !== false",
  "selectionRequired !== true",
  "promotionRequired !== true",
  "bookUseBindingRequired !== true",
  "runtimeCutoverApproved !== false",
  "publicationPerformed !== false",
]);
forbidTokens("contract", [
  "fetch(",
  "node:http",
  "node:https",
  "node:child_process",
  "process.env",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "writingStudioMayCallArtStudioDirectly: true",
  "authoritativeBookWritesAllowed: true",
  "artStudioCandidateMayBeFinal: true",
  "runtimeCutoverApproved: true",
  "publicationPerformed: true",
]);
requireTokens("contractsIndex", [
  'export * from "./book-production-docs-release.js";',
]);
requireTokens("runtime", [
  "evavo_docs_book_art_release_shadow_runtime_v1",
  "compileDocsBookArtReleaseShadowJob",
  "submitDocsBookArtReleaseShadowJob",
  "compileDocsBookArtReleaseEnvelope",
  "compileBookArtProviderShadowJob",
  "submitBookArtProviderShadowJob",
  "providerCallPerformed: false",
  "candidateArtifactsWritten: false",
  "authoritativeBookWritesPerformed: false",
  "selectionPerformed: false",
  "promotionPerformed: false",
  "bookUseBindingCreated: false",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]);
forbidTokens("runtime", [
  "provider.generate(",
  "fetch(",
  "process.env",
  "maximumAttempts: 2",
  "allowFallback: true",
]);
requireTokens("runtimePackage", [
  '"./docs-release"',
  '"./dist/docs-release.js"',
]);
for (const title of [
  "verifies one exact Docs Suite writing-to-art release and compiles its final brief",
  "rejects release receipt, final brief and manuscript drift",
  "rejects missing release evidence and incompatible repository commits",
  "rejects authority escalation, unknown fields and impossible chronology",
]) {
  if (!source.contractTest.includes(title)) problems.push(`contractTest missing ${title}`);
}
for (const title of [
  "compiles a verified Docs release into one no-fallback provider job",
  "submits duplicate Docs releases idempotently without calling a provider",
  "blocks a tampered Docs release before durable submission",
]) {
  if (!source.runtimeTest.includes(title)) problems.push(`runtimeTest missing ${title}`);
}

requireTokens("api", [
  "/v1/book-art/docs-release-runtime",
  "/v1/book-art/docs-releases/compile",
  "/v1/book-art/docs-releases/submit",
  "DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT",
  "compileDocsBookArtReleaseShadowJob",
  "submitDocsBookArtReleaseShadowJob",
  "BOOK_ART_DOCS_RELEASE_REQUEST_INVALID",
  "requiresReadyForArtShadowRelease: true",
  "verifiesReleaseFingerprint: true",
  "verifiesExactFinalBrief: true",
  "providerFallbackAllowed: false",
  "authoritativeBookWritesPerformed: false",
  "selectionPerformed: false",
  "promotionPerformed: false",
  "bookUseBindingCreated: false",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]);
forbidTokens("api", [
  "ProviderRegistry",
  "executeProviderCandidateRequest",
  "providerCallPerformed: true",
  "candidateArtifactsWritten: true",
  "authoritativeBookWritesPerformed: true",
  "selectionPerformed: true",
  "promotionPerformed: true",
  "bookUseBindingCreated: true",
]);
for (const title of [
  "Docs release REST protocol reports exact verification and non-authority",
  "Docs release REST compile verifies the full release and writes no runtime job",
  "Docs release REST submit is authenticated and duplicate-safe",
  "Docs release REST rejects caller provider policy and tampered receipt",
]) {
  if (!source.apiTest.includes(title)) problems.push(`apiTest missing ${title}`);
}

requireTokens("openapi", [
  "/v1/book-art/docs-release-runtime:",
  "/v1/book-art/docs-releases/compile:",
  "/v1/book-art/docs-releases/submit:",
  "evavo_art_studio_docs_book_release_v1",
  "evavo_docs_book_art_release_shadow_runtime_v1",
  "d7e5cd0f79ebcb211c502d33a90f84e93763f23c",
  "requiresReadyForArtShadowRelease: { const: true }",
  "verifiesReleaseFingerprint: { const: true }",
  "verifiesExactFinalBrief: { const: true }",
  "oneCandidate: { const: true }",
  "maximumRuntimeAttempts: { const: 1 }",
  "providerFallbackAllowed: { const: false }",
  "authoritativeBookWritesAllowed: { const: false }",
  "publicationPerformed: { const: false }",
]);
requireTokens("openapiTest", [
  "Docs Book release OpenAPI is exact, host-policy owned and shadow-only",
  "additionalProperties: false",
  "adapterPolicy:",
  "ArtStudioControlToken",
]);

requireTokens("cli", [
  "book-art-docs-release-protocol",
  "book-art-docs-release-compile",
  "book-art-docs-release-submit",
  "compileDocsBookArtReleaseShadowJob",
  "submitDocsBookArtReleaseShadowJob",
  "requiresReadyForArtShadowRelease: true",
  "providerFallbackAllowed: false",
  "authoritativeBookWritesPerformed: false",
  "selectionPerformed: false",
  "promotionPerformed: false",
  "bookUseBindingCreated: false",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]);
for (const title of [
  "CLI reports the verified Docs release protocol",
  "CLI compiles a verified Docs release without writing a runtime job",
  "CLI submits duplicate Docs releases idempotently without provider execution",
  "CLI rejects caller-owned adapter policy and tampered Docs releases",
]) {
  if (!source.cliTest.includes(title)) problems.push(`cliTest missing ${title}`);
}

requireTokens("mcp", [
  "book_art_docs_release_runtime_protocol",
  "compile_book_art_docs_release_shadow_job",
  "submit_book_art_docs_release_shadow_job",
  "compileDocsBookArtReleaseShadowJob",
  "submitDocsBookArtReleaseShadowJob",
  "requiresReadyForArtShadowRelease: true",
  "verifiesReleaseFingerprint: true",
  "verifiesExactFinalBrief: true",
  "providerFallbackAllowed: false",
  "authoritativeBookWritesPerformed: false",
  "selectionPerformed: false",
  "promotionPerformed: false",
  "bookUseBindingCreated: false",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]);
requireTokens("mcpTest", [
  "book_art_docs_release_runtime_protocol",
  "compile_book_art_docs_release_shadow_job",
  "submit_book_art_docs_release_shadow_job",
  "evavo_docs_book_art_release_shadow_runtime_v1",
]);
forbidTokens("mcp", [
  "ProviderRegistry",
  "executeProviderCandidateRequest",
  "providerCallPerformed: true",
  "candidateArtifactsWritten: true",
  "authoritativeBookWritesPerformed: true",
  "selectionPerformed: true",
  "promotionPerformed: true",
  "bookUseBindingCreated: true",
]);

requireTokens("docs", [
  "EVAVO-STUDIO/evavo-docs-suite",
  "EVAVO-STUDIO/evavo-writing-studio",
  "EVAVO-STUDIO/evavo-art-studio",
  "ready_for_art_shadow",
  "one candidate",
  "one runtime attempt",
  "no fallback",
  "Website remains the canonical manuscript writer",
]);
requireTokens("workflow", [
  "name: Book Art Docs Release Receiver",
  "node scripts/check-book-art-docs-release.mjs",
  "pnpm run build:domain",
  "pnpm --filter @evavo/art-contracts test",
  "pnpm --filter @evavo/art-book-runtime test",
  "pnpm --filter @evavo/art-studio-api test",
  "pnpm --filter @evavo/art-studio-cli test",
  "pnpm --filter @evavo/art-studio-mcp test",
  "pnpm check",
  "git diff --exit-code",
]);
forbidTokens("workflow", [
  "contents: write",
  "persist-credentials: true",
  "git push",
]);

if (problems.length) {
  console.error("Book Art Docs release receiver check failed.");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(JSON.stringify({
  status: "PASS",
  docsReleaseContract: "evavo_docs_book_writing_art_release_v1",
  artReceiverContract: "evavo_art_studio_docs_book_release_v1",
  runtimeContract: "evavo_docs_book_art_release_shadow_runtime_v1",
  docsSuiteCommit: "d7e5cd0f79ebcb211c502d33a90f84e93763f23c",
  writingStudioCommit: "c776a9e7f856815dbb92ffec08426cd12f176bea",
  artStudioReceiverCommit: "e9e96fd54a9e9d9c16bbd8faa2231caebb840c45",
  restApi: true,
  cli: true,
  mcp: true,
  openApi: true,
  releaseFingerprintRequired: true,
  exactFinalBriefRequired: true,
  oneCandidate: true,
  maximumRuntimeAttempts: 1,
  fallbackAllowed: false,
  providerCallPerformedByCompileOrSubmit: false,
  authoritativeBookWritesPerformed: false,
  selectionPerformed: false,
  promotionPerformed: false,
  bookUseBindingCreated: false,
  runtimeCutoverApproved: false,
  publicationPerformed: false,
}, null, 2));
