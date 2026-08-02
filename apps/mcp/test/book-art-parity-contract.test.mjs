import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes structural Website parity without provider, promotion or cutover authority", async () => {
  const [tools, parity, packageSource] = await Promise.all([
    read("src/book-art-tools.ts"),
    read("../../packages/book-art-runtime/src/parity.ts"),
    read("package.json"),
  ]);
  const packageJson = JSON.parse(packageSource);

  for (const token of [
    "compare_book_art_provider_shadow_parity",
    "compareBookArtProviderShadowParity",
    "websiteObservation",
    "EVAVO_ART_ALLOW_WRITES",
    "EVAVO_ART_RUNTIME_ROOT",
    "EVAVO_ART_ARTIFACT_ROOT",
    "LocalRuntimeRepository",
    "LocalArtifactStore",
    "parityPerformsProviderCall: false",
    "parityWritesArtifacts: false",
    "visualSimilarityEvaluated: false",
    "cutoverEligible: false",
  ]) {
    assert.ok(tools.includes(token), `missing Book Art parity MCP invariant: ${token}`);
  }
  assert.equal(
    packageJson.dependencies["@evavo/art-book-runtime"],
    "workspace:*",
  );

  for (const token of [
    "evavo_website_book_art_provider_shadow_observation",
    "evavo_book_art_provider_shadow_parity_result",
    "validateWebsiteBookArtProviderShadowObservation",
    "inspectBookArtProviderShadowJob",
    "parityReadOnly: true",
    "providerCallPerformedByParity: false",
    "artifactWritesPerformedByParity: false",
    "visualSimilarityEvaluated: false",
    "candidateBytesExpectedEqual: false",
    "observationPeriodSatisfied: false",
    "cutoverEligible: false",
    "websiteRuntimeStillActive: true",
    "websiteSourceDeletionAllowed: false",
    "runtimeCutoverApproved: false",
    "publicationPerformed: false",
  ]) {
    assert.ok(parity.includes(token), `shared Book Art parity is missing ${token}`);
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
    ".submit(",
    "visualSimilarityEvaluated: true",
    "cutoverEligible: true",
    "runtimeCutoverApproved: true",
    "publicationPerformed: true",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !tools.includes(forbidden),
      `Book Art parity MCP contains an authority shortcut: ${forbidden}`,
    );
    assert.ok(
      !parity.includes(forbidden),
      `Shared Book Art parity contains an authority shortcut: ${forbidden}`,
    );
  }
});
