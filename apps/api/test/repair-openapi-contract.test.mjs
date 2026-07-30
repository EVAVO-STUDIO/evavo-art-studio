import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("targeted repair OpenAPI remains compile-only and bounded", async () => {
  const source = await readFile(
    new URL("../openapi.repair.yaml", import.meta.url),
    "utf8",
  );
  for (const token of [
    "openapi: 3.1.0",
    "/v1/repair-protocol:",
    "/v1/repairs/validate:",
    "/v1/repairs/compile:",
    "TargetedRepairRequest",
    "NormalizedTargetedRepairRequest",
    "CompiledTargetedRepairJob",
    "masked-provider-inpaint",
    "art.repair.plan",
    "repair.plan",
    "artifacts.store",
    "evidence.bundle",
    "durable-worker-only",
    "allowSharedLayerRepair",
    "allowWholeFramePixelRepair",
    "maximumImpactedFrames",
  ]) {
    assert.ok(source.includes(token), `missing repair OpenAPI token: ${token}`);
  }
  for (const forbidden of [
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "planTargetedRepair(",
    "executeProvider",
    "promoteSelectedCandidate",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `targeted repair OpenAPI exposes an execution shortcut: ${forbidden}`,
    );
  }
});
