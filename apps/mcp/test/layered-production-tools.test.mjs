import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes receipt-bound layered source planning without provider or promotion authority", async () => {
  const tools = await read("src/art-direction-tools.ts");
  for (const token of [
    "layered_production_protocol",
    "validate_layered_production_request",
    "compile_layered_style_proof_approval",
    "compile_layered_production_plan",
    "get_layered_production_unit",
    "compile_layered_production_provider_request",
    "compileLayeredProductionPlan(request)",
    "compileLayeredProductionStyleProofApprovalReceipt",
    "applyLayeredProductionStyleProofApproval",
    "getLayeredProductionUnit(plan, unitId)",
    "compileLayeredProviderCandidateRequest",
    "compileProviderCandidateRuntimeContract",
    "one exact one-image provider job",
    "content-addressed style-proof approval evidence",
    "No image inspection, creative approval",
    "Candidate count remains one",
  ]) {
    assert.ok(
      tools.includes(token),
      `missing layered-production MCP invariant: ${token}`,
    );
  }
  for (const forbidden of [
    "executeProviderCandidateRequest",
    "promoteSelectedCandidate",
    "EVAVO_ART_WRITE_TOKEN",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !tools.includes(forbidden),
      `layered-production MCP contains execution shortcut: ${forbidden}`,
    );
  }
});
