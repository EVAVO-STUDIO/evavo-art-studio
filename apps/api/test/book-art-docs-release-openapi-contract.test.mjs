import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Docs Book release OpenAPI is exact, host-policy owned and shadow-only", async () => {
  const source = await readFile(
    new URL("../openapi.book-art-docs-release.yaml", import.meta.url),
    "utf8",
  );
  for (const token of [
    "openapi: 3.1.0",
    "/v1/book-art/docs-release-runtime:",
    "/v1/book-art/docs-releases/compile:",
    "/v1/book-art/docs-releases/submit:",
    "evavo_art_studio_docs_book_release_v1",
    "evavo_docs_book_writing_art_release_receipt",
    "evavo_docs_book_art_release_shadow_runtime_v1",
    "d7e5cd0f79ebcb211c502d33a90f84e93763f23c",
    "requiresReadyForArtShadowRelease: { const: true }",
    "verifiesReleaseFingerprint: { const: true }",
    "verifiesExactFinalBrief: { const: true }",
    "verifiesRepositoryCompatibility: { const: true }",
    "verifiesCompleteReleaseEvidence: { const: true }",
    "oneCandidate: { const: true }",
    "maximumRuntimeAttempts: { const: 1 }",
    "providerFallbackAllowed: { const: false }",
    "compilePerformsProviderCall: { const: false }",
    "submitPerformsProviderCall: { const: false }",
    "candidateApprovalState: { const: unapproved }",
    "candidateStorageClass: { const: intermediate }",
    "authoritativeBookWritesPerformed: { const: false }",
    "selectionPerformed: { const: false }",
    "promotionPerformed: { const: false }",
    "bookUseBindingCreated: { const: false }",
    "runtimeCutoverApproved: { const: false }",
    "publicationPerformed: { const: false }",
    "ArtStudioControlToken",
  ]) {
    assert.ok(source.includes(token), `missing Docs release OpenAPI invariant: ${token}`);
  }

  const request = source.slice(
    source.indexOf("DocsBookReleaseShadowRequest:"),
    source.indexOf("DocsBookReleaseEnvelope:"),
  );
  const envelope = source.slice(
    source.indexOf("DocsBookReleaseEnvelope:"),
    source.indexOf("DocsBookReleaseRuntimeProtocol:"),
  );
  assert.ok(request.includes("additionalProperties: false"));
  assert.ok(envelope.includes("additionalProperties: false"));
  assert.ok(!request.includes("adapterPolicy:"));
  assert.ok(envelope.includes("writingStudioMayCallArtStudioDirectly: { const: false }"));
  assert.ok(envelope.includes("authoritativeBookWritesAllowed: { const: false }"));

  for (const forbidden of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "providerCredential",
    "providerApiKey",
    "executeProviderCandidateRequest",
    "promoteSelectedCandidate",
    "updateReference",
    "providerCallPerformed: { const: true }",
    "candidateArtifactsWritten: { const: true }",
    "authoritativeBookWritesPerformed: { const: true }",
    "selectionPerformed: { const: true }",
    "promotionPerformed: { const: true }",
    "bookUseBindingCreated: { const: true }",
    "runtimeCutoverApproved: { const: true }",
    "publicationPerformed: { const: true }",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `Docs release OpenAPI contains forbidden authority: ${forbidden}`,
    );
  }
});
