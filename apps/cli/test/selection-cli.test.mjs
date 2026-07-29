import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = new URL("..", import.meta.url);
const artifact = (character) => `artifact_${character.repeat(64)}`;

function run(args) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

test("CLI prints the selection protocol", () => {
  const result = run(["selection-protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.ok(body.deterministicMetrics.includes("silhouette-iou"));
  assert.ok(body.externalEvidenceKinds.includes("identity-similarity"));
});

test("CLI compiles selection into a capability-scoped durable job", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-selection-cli-"));
  const input = path.join(root, "selection.json");
  await writeFile(
    input,
    JSON.stringify({
      schemaVersion: "1.0",
      selectionId: "cli-selection",
      candidateArtifactIds: [artifact("1"), artifact("2")],
      referenceArtifactId: artifact("3"),
      policy: {
        profile: "custom",
        metrics: [
          { id: "silhouette-iou", weight: 1, minimum: 0.2, blocking: true },
        ],
        externalEvidence: [],
      },
    }),
  );
  const result = run(["selection-compile", "--input", input]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.runtimeJob.queue, "selection");
  assert.equal(body.runtimeJob.kind, "art.candidate.select");
  assert.deepEqual(body.runtimeJob.requiredCapabilities, [
    "selection.compare",
    "evidence.bundle",
  ]);
  assert.equal(body.runtimeJob.inputArtifacts.length, 3);
});

test("CLI compiles promotion as a separate compare-and-swap job", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-promotion-cli-"));
  const input = path.join(root, "promotion.json");
  await writeFile(
    input,
    JSON.stringify({
      schemaVersion: "1.0",
      promotionId: "cli-promotion",
      selectionEvidenceArtifactId: artifact("4"),
      candidateArtifactId: artifact("5"),
      target: {
        namespace: "projects/demo",
        name: "approved-master",
        expectedGeneration: 0,
      },
      approval: { mode: "automatic" },
      actor: "cli-test",
    }),
  );
  const result = run(["promotion-compile", "--input", input]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.runtimeJob.kind, "art.candidate.promote");
  assert.deepEqual(body.runtimeJob.requiredCapabilities, [
    "selection.promote",
    "artifacts.store",
    "evidence.bundle",
  ]);
  assert.equal(body.request.target.expectedGeneration, 0);
});
