import assert from "node:assert/strict";
import test from "node:test";

import { createArtStudioApiServer } from "../dist/index.js";

const artifact = (character) => `artifact_${character.repeat(64)}`;

async function withServer(run) {
  const server = createArtStudioApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

const selectionRequest = {
  schemaVersion: "1.0",
  selectionId: "api-selection",
  candidateArtifactIds: [artifact("1"), artifact("2")],
  referenceArtifactId: artifact("3"),
  policy: {
    profile: "custom",
    metrics: [
      { id: "silhouette-iou", weight: 1, minimum: 0.2, blocking: true },
    ],
    externalEvidence: [],
  },
};

test("selection protocol and compiler expose worker-only governance", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(`${base}/v1/selection-protocol`);
    assert.equal(protocol.status, 200);
    const protocolBody = await protocol.json();
    assert.ok(protocolBody.deterministicMetrics.includes("silhouette-iou"));
    assert.ok(protocolBody.rules.some((entry) => entry.includes("compare-and-swap")));

    const compiled = await fetch(`${base}/v1/selections/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(selectionRequest),
    });
    assert.equal(compiled.status, 200);
    const body = await compiled.json();
    assert.equal(body.executionMode, "durable-worker-only");
    assert.equal(body.runtimeJob.kind, "art.candidate.select");
    assert.equal(body.runtimeJob.queue, "selection");
    assert.equal(body.runtimeJob.inputArtifacts.length, 3);
    assert.deepEqual(body.runtimeJob.requiredCapabilities, [
      "selection.compare",
      "evidence.bundle",
    ]);
  });
});

test("promotion compiler requires explicit compare-and-swap state", async () => {
  await withServer(async (base) => {
    const invalid = await fetch(`${base}/v1/promotions/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: "1.0",
        selectionEvidenceArtifactId: artifact("4"),
        candidateArtifactId: artifact("5"),
        target: {
          namespace: "projects/demo",
          name: "approved-master",
          expectedGeneration: 1,
        },
        approval: { mode: "automatic" },
        actor: "api-test",
      }),
    });
    assert.equal(invalid.status, 422);
    const invalidBody = await invalid.json();
    assert.match(invalidBody.error.message, /expectedArtifactId/);

    const compiled = await fetch(`${base}/v1/promotions/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: "1.0",
        promotionId: "api-promotion",
        selectionEvidenceArtifactId: artifact("4"),
        candidateArtifactId: artifact("5"),
        target: {
          namespace: "projects/demo",
          name: "approved-master",
          expectedGeneration: 0,
        },
        approval: { mode: "human", approver: "Greg Parker", reason: "Reviewed." },
        actor: "greg",
      }),
    });
    assert.equal(compiled.status, 200);
    const body = await compiled.json();
    assert.equal(body.runtimeJob.kind, "art.candidate.promote");
    assert.equal(body.runtimeJob.payload.approval.mode, "human");
    assert.deepEqual(body.runtimeJob.requiredCapabilities, [
      "selection.promote",
      "artifacts.store",
      "evidence.bundle",
    ]);
  });
});
