import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP compiles revision-bound promotion without reference authority", async () => {
  const [repair, jobs] = await Promise.all([
    read("src/repair-tools.ts"),
    read("../../packages/repair/src/revision-promotion-jobs.ts"),
  ]);
  const combined = `${repair}\n${jobs}`;
  for (const token of [
    "repaired_family_revision_promotion_protocol",
    "validate_repaired_family_revision_promotion_request",
    "compile_repaired_family_revision_promotion_job",
    "compileRepairedFamilyPromotionJob(request)",
    'kind: "art.repair.promote-revision"',
    '"repair.revision-promote"',
    '"selection.promote"',
    '"artifacts.store"',
    '"evidence.bundle"',
  ]) {
    assert.ok(combined.includes(token), `missing promotion MCP invariant: ${token}`);
  }
  for (const forbidden of [
    "promoteRepairedFamilyCandidate(",
    "promoteSelectedCandidate(",
    "LocalArtifactStore",
    "updateReference(",
    "resolveReference(",
    "OPENAI_API_KEY",
  ]) {
    assert.ok(
      !repair.includes(forbidden),
      `promotion MCP contains forbidden authority: ${forbidden}`,
    );
  }
});
