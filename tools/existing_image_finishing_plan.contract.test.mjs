import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("defect detection receipt binds exact source mask and overlay bytes", async () => {
  const source = await read("./existing_image_defect_detection_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.3.0"',
    'schemaVersion: "1.3"',
    "sourceBinding",
    "maskBinding",
    "overlayBinding",
    "sourceSha256AndLengthBound: true",
    "maskSha256AndLengthBound: true",
    "overlaySha256AndLengthBound: true",
    "writeCreateOnlyBundle",
  ]) assert.ok(source.includes(token), `missing source-bound defect token: ${token}`);
});

test("finishing plan refuses to execute repair and reverifies defect lineage", async () => {
  const source = await read("./existing_image_finishing_plan_mcp.mjs");
  for (const token of [
    'contract: "evavo.existing-image-finishing-plan-receipt.v1"',
    "verifyBinding",
    "defectReceiptSha256",
    "exactSourceMaskOverlayBindingRequired: true",
    "staleDefectEvidenceRejected: true",
    "smallestPreservationFirstOperationPreferred: true",
    "visualConfirmationRequiredBeforeRepair: true",
    "automaticRepairAllowed: false",
    "sourceMutationAllowed: false",
    "publicationAllowed: false",
    "evavo_verify_existing_image_finishing_plan",
  ]) assert.ok(source.includes(token), `missing finishing-plan safety token: ${token}`);
});

test("finishing plan MCP is registered", async () => {
  const config = await read("../.mcp.json");
  assert.ok(config.includes('"evavo-existing-image-finishing-plan-v1"'));
  assert.ok(config.includes('"tools/existing_image_finishing_plan_mcp.mjs"'));
});
