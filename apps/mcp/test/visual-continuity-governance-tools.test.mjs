import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes atomic continuity review and explicit approval governance", async () => {
  const [tools, index] = await Promise.all([
    read("src/visual-continuity-governance-tools.ts"),
    read("src/index.ts"),
  ]);
  const source = `${tools}\n${index}`;
  for (const token of [
    "registerVisualContinuityGovernanceTools(server)",
    "visual_continuity_hardening_protocol",
    "evaluate_visual_continuity_packet_batch",
    "compile_visual_continuity_approval_receipt",
    "verify_visual_continuity_approval_receipt",
    "compile_approved_visual_continuity_handoff",
    "verify_approved_visual_continuity_handoff",
    "evaluateVisualContinuityWorkPacketBatch",
    "compileVisualContinuityApprovalReceipt",
    "compileApprovedVisualContinuityStudioHandoff",
    "named-human",
    "atomically",
    "receiver-verified",
  ]) {
    assert.ok(source.includes(token), `missing continuity governance invariant ${token}`);
  }
  for (const forbidden of [
    "executeProviderCandidateRequest",
    "OPENAI_API_KEY",
    "child_process",
    "shell: true",
    "automaticCreativeApproval: true",
    "canonMutation: true",
    "targetRepositoryMutation: true",
  ]) {
    assert.equal(
      tools.includes(forbidden),
      false,
      `continuity governance contains unsafe shortcut ${forbidden}`,
    );
  }
  assert.match(tools, /no provider call/i);
  assert.match(tools, /never makes it/i);
  assert.match(tools, /no automatic creative approval/i);
  assert.match(tools, /no receiver or target action is executed/i);
});
