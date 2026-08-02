import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Book Art parity OpenAPI remains structural, protected and cutover-ineligible", async () => {
  const source = await readFile(
    new URL("../openapi.book-art-provider-parity.yaml", import.meta.url),
    "utf8",
  );
  for (const token of [
    "openapi: 3.1.0",
    "/v1/book-art/provider-jobs/parity:",
    "compareBookArtProviderShadowParity",
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
    assert.ok(source.includes(token), `missing Book Art parity OpenAPI invariant: ${token}`);
  }

  for (const forbidden of [
    "adapterPolicy:",
    "OPENAI_API_KEY",
    "providerCredential",
    "providerApiKey",
    "executeProviderCandidateRequest",
    "promoteSelectedCandidate",
    "updateReference",
    "providerCallPerformedByParity: { const: true }",
    "artifactWritesPerformedByParity: { const: true }",
    "visualSimilarityEvaluated: { const: true }",
    "cutoverEligible: { const: true }",
    "runtimeCutoverApproved: { const: true }",
    "publicationPerformed: { const: true }",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `Book Art parity OpenAPI contains forbidden authority: ${forbidden}`,
    );
  }
});
