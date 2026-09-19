import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("continuity state uses the immutable artifact store and stale-write references", async () => {
  const [tools, index, configuration] = await Promise.all([
    read("src/visual-continuity-workspace-tools.ts"),
    read("src/index.ts"),
    read("../../../.mcp.json"),
  ]);
  const source = `${tools}\n${index}`;
  for (const token of [
    "registerVisualContinuityWorkspaceTools(server)",
    "persist_visual_continuity_bible",
    "persist_visual_continuity_session",
    "persist_visual_continuity_approval",
    "persist_approved_visual_continuity_handoff",
    "load_visual_continuity_workspace",
    "load_visual_continuity_artifact",
    "LocalArtifactStore",
    "expectedGeneration",
    "updateReference",
    "resolveReference",
    "sourceArtifacts",
    "verifyVisualContinuityBible",
    "verifyVisualContinuitySession",
    "verifyVisualContinuityApprovalReceipt",
    "verifyApprovedVisualContinuityStudioHandoff",
    "EVAVO_ART_ARTIFACT_ROOT",
    "EVAVO_ART_ALLOW_WRITES",
  ]) {
    assert.ok(source.includes(token), `missing continuity workspace invariant ${token}`);
  }
  assert.match(configuration, /EVAVO_ART_ARTIFACT_ROOT/u);
  assert.match(configuration, /EVAVO_ART_ALLOW_WRITES/u);
  for (const forbidden of [
    "child_process",
    "shell: true",
    "OPENAI_API_KEY",
    "writeFile(",
    "rename(",
    "automaticCreativeApproval: true",
    "canonMutation: true",
    "publication: true",
  ]) {
    assert.equal(
      tools.includes(forbidden),
      false,
      `continuity workspace bypasses its governed store with ${forbidden}`,
    );
  }
  assert.equal(
    tools.includes("root: z.string"),
    false,
    "caller may not replace the fixed server-side artifact root",
  );
});
