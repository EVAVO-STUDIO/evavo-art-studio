import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes iterative art planning without provider or approval shortcuts", async () => {
  const [tools, provider] = await Promise.all([
    read("src/art-production-tools.ts"),
    read("src/provider-tools.ts"),
  ]);
  for (const token of [
    "art_production_orchestrator_protocol",
    "compile_art_production_loop",
    "compile_next_art_production_batch",
    "compile_art_production_candidate_admission_receipt",
    "evaluate_art_production_attempt",
    "verify_art_production_loop",
    "compile_art_production_human_approval_receipt",
    "compile_art_production_packaging_plan",
    "registerArtProductionTools(server)",
    "compileArtProductionLoop",
    "compileNextArtProductionBatch",
    "compileArtProductionCandidateAdmissionReceipt",
    "verifyArtProductionCandidateAdmissionReceiptAgainstRequest",
    "evaluateArtProductionAttempt",
    "compileArtProductionHumanApprovalReceipt",
    "verifyArtProductionHumanApprovalReceiptAgainstRequest",
    "compileArtProductionPackagingPlan",
  ]) {
    assert.ok(
      `${tools}\n${provider}`.includes(token),
      `missing MCP invariant ${token}`,
    );
  }
  for (const forbidden of [
    "executeProviderCandidateRequest",
    "OPENAI_API_KEY",
    "EVAVO_ART_WRITE_TOKEN",
    "promoteSelectedCandidate",
    "LocalArtifactStore",
    "RuntimeWorker",
    "child_process",
    "shell: true",
  ]) {
    assert.equal(
      tools.includes(forbidden),
      false,
      `MCP contains forbidden shortcut ${forbidden}`,
    );
  }
  assert.match(tools, /no provider call/i);
  assert.match(
    tools,
    /does not call a provider or inspect image bytes/i,
  );
  assert.match(tools, /caller supplied; no provider call/i);
  assert.match(tools, /does not make it/i);
  assert.match(tools, /no sheet or atlas pixels are written/i);
});
