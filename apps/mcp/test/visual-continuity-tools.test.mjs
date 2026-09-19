import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes resumable cross-studio visual continuity without unsafe shortcuts", async () => {
  const [tools, index] = await Promise.all([
    read("src/visual-continuity-tools.ts"),
    read("src/index.ts"),
  ]);
  const source = `${tools}\n${index}`;
  for (const token of [
    "registerVisualContinuityTools(server)",
    "visual_continuity_protocol",
    "compile_visual_continuity_bible",
    "verify_visual_continuity_bible",
    "compile_visual_continuity_session",
    "verify_visual_continuity_session",
    "compile_next_visual_continuity_packet",
    "verify_visual_continuity_packet",
    "evaluate_visual_continuity_candidate",
    "compile_visual_continuity_handoff",
    "compileVisualContinuityBible",
    "compileVisualContinuitySession",
    "compileNextVisualContinuityWorkPacket",
    "evaluateVisualContinuityWorkPacket",
    "compileVisualContinuityStudioHandoff",
    "ChatGPT, Claude or Codex",
    "maps, sprite animation, storyboards, video, 3D, textures",
  ]) {
    assert.ok(source.includes(token), `missing visual-continuity MCP invariant ${token}`);
  }
  for (const forbidden of [
    "executeProviderCandidateRequest",
    "OPENAI_API_KEY",
    "child_process",
    "shell: true",
    "promoteSelectedCandidate",
    "automaticCreativeApproval: true",
    "canonMutation: true",
  ]) {
    assert.equal(
      tools.includes(forbidden),
      false,
      `visual-continuity MCP contains unsafe shortcut ${forbidden}`,
    );
  }
  assert.match(tools, /no provider call/i);
  assert.match(tools, /no image or repository is changed/i);
  assert.match(tools, /gates are never weakened/i);
  assert.match(tools, /Metadata handoff only/i);
});
