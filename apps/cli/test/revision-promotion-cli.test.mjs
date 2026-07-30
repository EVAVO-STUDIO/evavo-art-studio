import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = new URL("..", import.meta.url);

function run(args) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

test("CLI compiles revision-bound promotion through the real dispatcher", async () => {
  const protocol = run(["repair-revision-promotion-protocol"]);
  assert.equal(protocol.status, 0, protocol.stderr);
  const protocolBody = JSON.parse(protocol.stdout);
  assert.equal(protocolBody.protocolVersion, "2026-07-30.1");
  assert.equal(protocolBody.kind, "art.repair.promote-revision");
  assert.ok(
    protocolBody.rules.some((rule) => rule.includes("compare-and-swap")),
  );

  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-promotion-cli-"));
  const input = path.join(root, "promotion.json");
  const ranking = `artifact_${"a".repeat(64)}`;
  const expected = `artifact_${"b".repeat(64)}`;
  await writeFile(
    input,
    JSON.stringify({
      schemaVersion: "1.0",
      promotionId: "cli-revision-promotion",
      rankingEvidenceArtifactId: ranking,
      target: {
        namespace: "projects/hero",
        name: "approved-body",
        expectedGeneration: 4,
        expectedArtifactId: expected,
      },
      approval: {
        mode: "human",
        approver: "Greg Parker",
        reason: "Approved after evidence review.",
      },
      actor: "greg",
    }),
  );
  const result = run([
    "repair-revision-promotion-compile",
    "--input",
    input,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.executionMode, "durable-worker-or-deliberate-local-run");
  assert.equal(body.runtimeJob.kind, "art.repair.promote-revision");
  assert.equal(body.runtimeJob.queue, "selection");
  assert.deepEqual(body.runtimeJob.inputArtifacts, [ranking]);
  assert.deepEqual(body.runtimeJob.requiredCapabilities, [
    "repair.revision-promote",
    "selection.promote",
    "artifacts.store",
    "evidence.bundle",
  ]);
  assert.equal(body.runtimeJob.payload.target.expectedArtifactId, expected);
});
