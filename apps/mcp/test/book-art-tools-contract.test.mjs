import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes the shared Book Art shadow runtime without provider or promotion shortcuts", async () => {
  const [tools, index, packageSource, tsconfigSource, sharedRuntime] =
    await Promise.all([
      read("src/book-art-tools.ts"),
      read("src/index.ts"),
      read("package.json"),
      read("tsconfig.json"),
      read("../../packages/book-art-runtime/src/index.ts"),
    ]);
  const packageJson = JSON.parse(packageSource);
  const tsconfig = JSON.parse(tsconfigSource);

  for (const token of [
    "book_art_provider_runtime_protocol",
    "compile_book_art_provider_shadow_job",
    "submit_book_art_provider_shadow_job",
    "compileBookArtProviderShadowJob",
    "submitBookArtProviderShadowJob",
    "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
    "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
    "EVAVO_BOOK_ART_PROVIDER_MODEL",
    "EVAVO_ART_ALLOW_WRITES",
    "LocalRuntimeRepository",
    "maximumRuntimeAttempts: 1",
    "providerFallbackAllowed: false",
    "compilePerformsProviderCall: false",
    "submitPerformsProviderCall: false",
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
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !tools.includes(forbidden),
      `Book Art MCP contains an execution shortcut: ${forbidden}`,
    );
  }
});
