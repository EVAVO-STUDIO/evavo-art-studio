import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("OpenAPI contract covers governed production, provider compilation and durable operations", async () => {
  const source = await readFile(new URL("../openapi.yaml", import.meta.url), "utf8");
  for (const token of [
    "openapi: 3.1.0",
    "ArtStudioControlToken",
    "/v1/plans:",
    "/v1/repositories/inspect:",
    "/v1/provider-protocol:",
    "/v1/providers/validate:",
    "/v1/providers/compile:",
    "ProviderCandidateRequest",
    "ProviderCapability",
    "ProviderReferenceCapabilityMap",
    "ProviderCompiledContract",
    "capabilityVocabulary",
    "requiredReferenceCapabilities",
    "requiredAdapterCapabilities",
    "identity-reference",
    "pose-control",
    "edge-control",
    "depth-control",
    "canonical-identity",
    "previous-key-pose",
    "next-key-pose",
    "durable-worker-only",
    "/v1/quality/sprite-frame:",
    "/v1/quality/sprite-sequence:",
    "/v1/atlases/build:",
    "/v1/runtime/jobs:",
    "/v1/runtime/jobs/{jobId}:",
    "/v1/runtime/jobs/{jobId}/cancel:",
    "/v1/runtime/jobs/{jobId}/pause:",
    "/v1/runtime/jobs/{jobId}/resume:",
    "/v1/runtime/jobs/{jobId}/redrive:",
    "/v1/runtime/recover:",
    "/v1/runtime/events:",
    "/v1/artifacts/{artifactId}:",
    "/v1/artifacts/{artifactId}/verify:",
    "/v1/artifact-references:",
    "runtimeConfigured",
    "artifactStoreConfigured",
    "expectedGeneration",
  ]) {
    assert.ok(source.includes(token), `missing OpenAPI token: ${token}`);
  }
  for (const forbidden of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "REPLICATE_API_TOKEN",
    "providerCredentials:",
    "apiKey:",
    "executionMode: provider-direct",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `provider secret or execution shortcut leaked into OpenAPI: ${forbidden}`,
    );
  }
});
