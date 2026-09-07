import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("reference colour restoration evidence gate is byte and authority bound", async () => {
  const source = await read("./lib/reference_colour_restoration_evidence_gate.mjs");
  for (const token of [
    '"evavo.reference-colour-restoration-evidence-gate.v1"',
    '"evavo.reference-colourization-authorization.v1"',
    '"reference_colourization_variant_set_v1"',
    '"reference_colourization_qa_v1"',
    '"evavo.enhancement-art-review.v1"',
    '"conservative"', '"balanced"', '"rich"',
    "sourceLuminanceIsMaster",
    "backgroundColourized",
    "clothingColourized",
    "automaticWinnerSelected",
    "automaticCreativeApprovalGranted",
    "publication_allowed",
    "cloud_overwrite_allowed",
    "candidate IDs must be conservative, balanced and rich",
    "receipt SHA does not match candidate bytes",
  ]) assert.ok(source.includes(token), `missing evidence gate token: ${token}`);
});

test("guarded MCP validates both plan and execution results", async () => {
  const source = await read("./reference_colour_restoration_guarded_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.1.0"',
    "assertReferenceColourRestorationPlanResult",
    "assertReferenceColourRestorationExecutionResult",
    "evavo_plan_reference_colour_restoration_review_set",
    "evavo_run_reference_colour_restoration_review_set",
    "confirmLocalWrite",
    "Never selects a winner automatically",
  ]) assert.ok(source.includes(token), `missing guarded MCP token: ${token}`);
});
