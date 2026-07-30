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

test("CLI exposes targeted repair protocol through the real dispatcher", () => {
  const result = run(["repair-protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.protocolVersion, "2026-07-30.1");
  assert.ok(body.strategies.includes("masked-provider-inpaint"));
  assert.ok(body.rules.some((rule) => rule.includes("may not be regenerated")));
});

test("CLI compiles targeted repair into a planning-only durable job", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-repair-cli-"));
  const input = path.join(root, "repair.json");
  await writeFile(
    input,
    JSON.stringify({
      schemaVersion: "1.0",
      repairId: "cli-pivot-repair",
      familyEvidenceArtifactId: `artifact_${"a".repeat(64)}`,
      target: { frameId: "idle-000", gateIds: ["frame-pivot"] },
      intent: "Correct pivot metadata without changing pixels.",
      provider: { enabled: false },
    }),
  );
  const result = run(["repair-compile", "--input", input]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.executionMode, "durable-worker-or-deliberate-local-planning");
  assert.equal(body.runtimeJob.kind, "art.repair.plan");
  assert.equal(body.runtimeJob.queue, "selection");
  assert.deepEqual(body.runtimeJob.requiredCapabilities, [
    "repair.plan",
    "artifacts.store",
    "evidence.bundle",
  ]);
  assert.deepEqual(body.runtimeJob.inputArtifacts, [
    `artifact_${"a".repeat(64)}`,
  ]);
});
