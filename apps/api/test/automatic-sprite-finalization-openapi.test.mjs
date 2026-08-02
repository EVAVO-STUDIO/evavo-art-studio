import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () =>
  readFile(
    new URL("../openapi.automatic-sprite-finalization.yaml", import.meta.url),
    "utf8",
  );

test("automatic sprite finalization OpenAPI remains adaptive, compile-only, and fail-closed", async () => {
  const openapi = await source();
  for (const token of [
    "openapi: 3.1.0",
    "/v1/automatic-sprite-finalization-protocol:",
    "/v1/automatic-sprite-finalizations/validate:",
    "/v1/automatic-sprite-finalizations/compile:",
    "native-alpha",
    "green-matte",
    "magenta-matte",
    "black-additive",
    "opaque-preserve",
    "EVAVO-STUDIO/evavo-3d-studio",
    "renderRigArtifactId",
    "cameraManifestArtifactId",
    "directionReferenceArtifactIds",
    "requireFakeTransparencyRejection",
    "requireFamilyVerification",
    "maximumDeterministicRepairPasses",
    "transparentBleedRadius",
    "matteSearchRadius",
    "matteDistanceThreshold",
    "adaptively repaired sprite production",
  ]) {
    assert.ok(openapi.includes(token), `missing OpenAPI invariant: ${token}`);
  }
  for (const forbidden of [
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "runtime.submit(",
    "executeProviderCandidateRequest",
    "promoteSelectedCandidate",
    "shell: true",
    "git push",
    "relaxThresholds",
    "acceptFailed",
  ]) {
    assert.ok(
      !openapi.includes(forbidden),
      `OpenAPI contains an execution shortcut: ${forbidden}`,
    );
  }
  assert.match(openapi, /never call an image\s+provider/i);
  assert.match(openapi, /never.*deploy/is);
});
