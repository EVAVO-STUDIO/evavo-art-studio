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

test("CLI compiles revision-bound ranking through the real dispatcher", async () => {
  const protocol = run(["repair-revision-ranking-protocol"]);
  assert.equal(protocol.status, 0, protocol.stderr);
  const protocolBody = JSON.parse(protocol.stdout);
  assert.equal(protocolBody.protocolVersion, "2026-07-30.1");
  assert.equal(protocolBody.kind, "art.repair.rank-revisions");
  assert.equal(
    protocolBody.outputArtifactRole,
    "revision-bound-candidate-selection-evidence",
  );

  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-ranking-cli-"));
  const input = path.join(root, "ranking.json");
  const bridge = `artifact_${"a".repeat(64)}`;
  await writeFile(
    input,
    JSON.stringify({
      schemaVersion: "1.0",
      rankingId: "cli-revision-ranking",
      bridgeEvidenceArtifactId: bridge,
    }),
  );
  const result = run([
    "repair-revision-ranking-compile",
    "--input",
    input,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.executionMode, "durable-worker-or-deliberate-local-run");
  assert.equal(body.runtimeJob.kind, "art.repair.rank-revisions");
  assert.equal(body.runtimeJob.queue, "selection");
  assert.deepEqual(body.runtimeJob.inputArtifacts, [bridge]);
  assert.deepEqual(body.runtimeJob.requiredCapabilities, [
    "repair.revision-ranking",
    "selection.compare",
    "artifacts.store",
    "evidence.bundle",
  ]);
});
