import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("reference colour restoration bridge stays deterministic and fail closed", async () => {
  const source = await read("./lib/reference_colour_restoration_bridge.mjs");
  for (const token of [
    '"evavo.reference-colour-restoration-bridge.v1"',
    '"evavo-image-enhancement-studio:reference-colourization-v1"',
    '"reference-colorize-plan"',
    '"reference-colorize-variants"',
    '"reference-colorize-qa"',
    '"conservative"',
    '"balanced"',
    '"rich"',
    "confirmRealReference=true is required",
    "subjectMatchConfirmedByHuman=true is required",
    "outputDir must not already exist",
    "sourceMutationAllowed: false",
    "generativeFallbackAllowed: false",
    "learnedRepaintAllowed: false",
    "inventedColourAllowed: false",
    "automaticWinnerSelected: false",
    "humanFinalSelectionRequired: true",
    'contract: "evavo.enhancement-art-review.v1"',
    'art_studio_review_profile: "photo"',
    'learned_candidate: false',
    'approval_state: "unapproved"',
    "publication_allowed: false",
    "cloud_overwrite_allowed: false",
  ]) assert.ok(source.includes(token), `missing preservation token: ${token}`);
});

test("MCP exposes plan, readiness and explicit create-only execution", async () => {
  const source = await read("./reference_colour_restoration_bridge_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    "evavo_reference_colour_restoration_bridge_capabilities",
    "evavo_reference_colour_restoration_readiness",
    "evavo_plan_reference_colour_restoration_review_set",
    "evavo_run_reference_colour_restoration_review_set",
    "confirmLocalWrite",
    "confirmRealReference",
    "subjectMatchConfirmedByHuman",
    "referenceProvenance",
  ]) assert.ok(source.includes(token), `missing MCP surface token: ${token}`);
});

test("standalone existing-image suite registers enhancer execution bridge", async () => {
  const source = await read("../.mcp.existing-image-polish-v1.json");
  for (const token of [
    '"evavo-reference-colour-restoration-bridge-v1"',
    '"tools/reference_colour_restoration_bridge_mcp.mjs"',
    '"EVAVO_REFERENCE_COLOUR_RESTORATION_ALLOW_EXECUTION": "true"',
    '"EVAVO_REFERENCE_COLOUR_RESTORATION_ENHANCER_ROOT": "C:\\\\GitRepos\\\\evavo-image-enhancement-studio"',
    '"EVAVO_REFERENCE_COLOUR_RESTORATION_PROVIDER": "evavo-image-enhancement-studio:reference-colourization-v1"',
  ]) assert.ok(source.includes(token), `missing MCP config token: ${token}`);
});
