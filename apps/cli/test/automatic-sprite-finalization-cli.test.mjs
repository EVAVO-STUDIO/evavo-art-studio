import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cwd = new URL("..", import.meta.url);

function run(args) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
}

async function wrapper(root) {
  const workflow = JSON.parse(
    await readFile(
      new URL("../../../examples/automatic-sprite-workflow.json", import.meta.url),
      "utf8",
    ),
  );
  const filePath = path.join(root, "finalization.json");
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        schemaVersion: "1.0",
        workflow,
        background: {
          mode: "auto",
          nativeAlphaAdapterIds: [],
          requireFakeTransparencyRejection: true,
          requireMeaningfulAlpha: true,
        },
        finalization: {
          deliveryProfileId: "godot-sprite-lossless",
          requireFamilyVerification: true,
          requireHostileMatteProof: true,
          requireNoRejectedArtifacts: true,
          requireExactDimensions: true,
          maximumDeterministicRepairPasses: 2,
          transparentBleedRadius: 2,
          matteSearchRadius: 6,
          matteDistanceThreshold: 72,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return filePath;
}

test("CLI exposes automatic sprite finalization protocol", () => {
  const result = run(["automatic-sprite-finalization-protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.protocolVersion, "2026-08-01.1");
  assert.ok(body.backgroundModes.includes("black-additive"));
  assert.ok(body.backgroundRules.some((entry) => entry.includes("checkerboards")));
  assert.ok(body.adaptiveRepairRules.some((entry) => entry.includes("bounded")));
  assert.ok(body.proofRules.some((entry) => entry.includes("proof artifact")));
});

test("CLI compiles background-aware adaptive finalization without executing work", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-finalization-cli-"));
  try {
    const input = await wrapper(root);
    const result = run([
      "automatic-sprite-finalization-compile",
      "--input",
      input,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(
      body.workflow.supervisorWorkflow.rootJob.kind,
      "art.sprite-production.supervise",
    );
    assert.ok(
      body.workflow.supervisorRequest.policy.requiredReleaseArtifactRoles.includes(
        "automatic.family-finalization-evidence",
      ),
    );
    assert.ok(
      body.workflow.supervisorRequest.policy.requiredReleaseArtifactRoles.includes(
        "automatic.family-adaptive-proof-evidence",
      ),
    );
    assert.ok(
      body.workflow.supervisorRequest.tasks.some(
        (task) => task.kind === "art.candidate.finalize-adaptive",
      ),
    );
    assert.match(body.executionBoundary, /does not call providers/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
