import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () =>
  readFile(new URL("../openapi.sprite-supervisor.yaml", import.meta.url), "utf8");

test("sprite supervisor OpenAPI documents bounded closed-loop control", async () => {
  const openapi = await source();
  for (const token of [
    "openapi: 3.1.0",
    "/v1/sprite-supervisor-protocol:",
    "/v1/sprite-supervisors/validate:",
    "/v1/sprite-supervisors/compile:",
    "art.sprite-production.supervise",
    "sprite.supervisor.run",
    "output-artifact-labels",
    "runtime-result-json",
    "failure-details",
    "maxRedrives",
    "maxRepairCycles",
    "requireFinalHumanApproval",
    "requiredReleaseArtifactRoles",
    "spritePlanRequest",
    "resolutionId",
    "expectedStateTick",
    'protocolVersion: { const: "2026-08-01.2" }',
    "reviewRules",
  ]) {
    assert.ok(openapi.includes(token), `missing OpenAPI invariant: ${token}`);
  }
  for (const forbidden of [
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "shell: true",
    "executeProviderCandidateRequest",
    "promoteSelectedCandidate",
  ]) {
    assert.ok(
      !openapi.includes(forbidden),
      `OpenAPI contains execution shortcut: ${forbidden}`,
    );
  }
  assert.match(openapi, /do not submit runtime jobs/i);
  assert.match(openapi, /quality-bypass fields are rejected/i);
  assert.match(openapi, /exact immutable supervisor-state tick/i);
});
