import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes shared Book Art submission and read-only inspection without authority shortcuts", async () => {
  const [tools, index, packageSource, tsconfigSource, sharedRuntime, inspection] =
    await Promise.all([
      read("src/book-art-tools.ts"),
      read("src/index.ts"),
      read("package.json"),
      read("tsconfig.json"),
      read("../../packages/book-art-runtime/src/index.ts"),
      read("../../packages/book-art-runtime/src/inspection.ts"),
    ]);
  const packageJson = JSON.parse(packageSource);
  const tsconfig = JSON.parse(tsconfigSource);

  for (const token of [
    "book_art_provider_runtime_protocol",
    "compile_book_art_provider_shadow_job",
    "submit_book_art_provider_shadow_job",
    "inspect_book_art_provider_shadow_job",
    "compileBookArtProviderShadowJob",
    "submitBookArtProviderShadowJob",
    "inspectBookArtProviderShadowJob",
    "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
    "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
    "EVAVO_BOOK_ART_PROVIDER_MODEL",
    "EVAVO_ART_ALLOW_WRITES",
    "EVAVO_ART_RUNTIME_ROOT",
    "EVAVO_ART_ARTIFACT_ROOT",
    "LocalRuntimeRepository",
    "LocalArtifactStore",
    "maximumRuntimeAttempts: 1",
    "providerFallbackAllowed: false",
    "compilePerformsProviderCall: false",
    "submitPerformsProviderCall: false",
    "inspectPerformsProviderCall: false",
    "inspectionWritesArtifacts: false",
    'candidateApprovalState: "unapproved"',
    "selectionPerformed: false",
    "promotionPerformed: false",
    "bookUseBindingCreated: false",
    "runtimeCutoverApproved: false",
    "publicationPerformed: false",
  ]) {
    assert.ok(tools.includes(token), `missing Book Art MCP invariant: ${token}`);
  }
  assert.ok(index.includes("registerBookArtTools(server)"));
  assert.equal(
    packageJson.dependencies["@evavo/art-book-runtime"],
    "workspace:*",
  );
  assert.ok(
    tsconfig.references.some(
      (entry) => entry.path === "../../packages/book-art-runtime",
    ),
  );

  for (const token of [
    'queue: "provider"',
    'kind: "art.candidate.generate"',
    "maximumAttempts: 1",
    "allowFallback: false",
    "candidateArtifactsWritten: false",
    "providerCallPerformed: false",
    "selectionPerformed: false",
    "promotionPerformed: false",
    "bookUseBindingCreated: false",
    "runtimeCutoverApproved: false",
    "publicationPerformed: false",
  ]) {
    assert.ok(
      sharedRuntime.includes(token),
      `shared Book Art runtime is missing ${token}`,
    );
  }
  for (const token of [
    "inspectionReadOnly: true",
    "providerCallPerformedByInspection: false",
    "candidateArtifactsWrittenByInspection: false",
    'artifactRole !== "provider-candidate"',
    'artifactRole !== "provider-candidate-evidence"',
    "FORBIDDEN_ARTIFACT_ROLES",
    "artifacts.verify",
    "artifacts.read",
  ]) {
    assert.ok(
      inspection.includes(token),
      `shared Book Art inspection is missing ${token}`,
    );
  }

  for (const forbidden of [
    "ProviderRegistry",
    "createProviderHandlers",
    "executeProviderCandidateRequest",
    "FixtureImageProviderAdapter",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "promoteSelectedCandidate",
    "updateReference(",
    ".put(",
    "bookUseBindingCreated: true",
    "runtimeCutoverApproved: true",
    "publicationPerformed: true",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !tools.includes(forbidden),
      `Book Art MCP contains an execution shortcut: ${forbidden}`,
    );
  }
});
