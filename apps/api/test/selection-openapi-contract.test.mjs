import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("selection OpenAPI extension covers ranking and separate promotion", async () => {
  const source = await readFile(
    new URL("../openapi.selection.yaml", import.meta.url),
    "utf8",
  );
  for (const token of [
    "openapi: 3.1.0",
    "/v1/selection-protocol:",
    "/v1/selections/validate:",
    "/v1/selections/compile:",
    "/v1/promotions/validate:",
    "/v1/promotions/compile:",
    "CandidateSelectionRequest",
    "CandidatePromotionRequest",
    "NormalizedCandidateSelectionRequest",
    "NormalizedCandidatePromotionRequest",
    "silhouette-iou",
    "edge-similarity",
    "identity-similarity",
    "review-required",
    "art.candidate.select",
    "art.candidate.promote",
    "durable-worker-only",
    "expectedGeneration",
    "expectedArtifactId",
    "selection.compare",
    "selection.promote",
  ]) {
    assert.ok(source.includes(token), `missing selection OpenAPI token: ${token}`);
  }
  for (const forbidden of [
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "executeCandidateSelection",
    "promoteSelectedCandidate",
    "provider-direct",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `selection OpenAPI exposes an execution or secret shortcut: ${forbidden}`,
    );
  }
});
