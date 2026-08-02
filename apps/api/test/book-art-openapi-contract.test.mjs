import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Book Art provider OpenAPI remains host-policy, shadow-only and durable-submit-only", async () => {
  const source = await readFile(
    new URL("../openapi.book-art-provider.yaml", import.meta.url),
    "utf8",
  );
  for (const token of [
    "openapi: 3.1.0",
    "/v1/book-art/provider-runtime:",
    "/v1/book-art/provider-jobs/compile:",
    "/v1/book-art/provider-jobs/submit:",
    "evavo_book_art_provider_shadow_runtime_v1",
    "oneCandidate: { const: true }",
    "maximumRuntimeAttempts: { const: 1 }",
    "providerFallbackAllowed: { const: false }",
    "compilePerformsProviderCall: { const: false }",
    "submitPerformsProviderCall: { const: false }",
    "candidateApprovalState: { const: unapproved }",
    "candidateStorageClass: { const: intermediate }",
    "selectionPerformed: { const: false }",
    "promotionPerformed: { const: false }",
    "bookUseBindingCreated: { const: false }",
    "runtimeCutoverApproved: { const: false }",
    "publicationPerformed: { const: false }",
    "ArtStudioControlToken",
  ]) {
    assert.ok(source.includes(token), `missing Book Art OpenAPI invariant: ${token}`);
  }
  const requestSchema = source.slice(
    source.indexOf("BookArtProviderShadowRequest:"),
    source.indexOf("BookArtProviderRuntimeProtocol:"),
  );
  assert.ok(requestSchema.includes("additionalProperties: false"));
  assert.ok(!requestSchema.includes("adapterPolicy:"));

  const compilationSchema = source.slice(
    source.indexOf("BookArtProviderCompilationResult:"),
    source.indexOf("BookArtProviderSubmissionResult:"),
  );
  const submissionSchema = source.slice(
    source.indexOf("BookArtProviderSubmissionResult:"),
    source.indexOf("    Error:"),
  );
  assert.ok(compilationSchema.includes("status: { enum: [blocked, ready] }"));
  assert.ok(submissionSchema.includes("status: { enum: [blocked, submitted] }"));
  assert.ok(!submissionSchema.includes("BookArtProviderCompilationResult"));
  assert.ok(!submissionSchema.includes("allOf:"));

  for (const forbidden of [
    "OPENAI_API_KEY",
    "providerCredential",
    "providerApiKey",
    "executeProviderCandidateRequest",
    "promoteSelectedCandidate",
    "updateReference",
    "providerCallPerformed: { const: true }",
    "candidateArtifactsWritten: { const: true }",
    "selectionPerformed: { const: true }",
    "promotionPerformed: { const: true }",
    "runtimeCutoverApproved: { const: true }",
    "publicationPerformed: { const: true }",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `Book Art OpenAPI contains a forbidden authority shortcut: ${forbidden}`,
    );
  }
});
