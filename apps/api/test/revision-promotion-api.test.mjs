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

test("revision promotion REST controls remain compile-only", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(`${base}/v1/repair-revision-promotion-protocol`);
    assert.equal(protocol.status, 200);
    const protocolBody = await protocol.json();
    assert.equal(protocolBody.kind, "art.repair.promote-revision");
    assert.ok(protocolBody.requiredCapabilities.includes("selection.promote"));

    const request = {
      schemaVersion: "1.0",
      promotionId: "api-revision-promotion",
      rankingEvidenceArtifactId: artifact("a"),
      target: {
        namespace: "projects/hero",
        name: "approved-body",
        expectedGeneration: 3,
        expectedArtifactId: artifact("b"),
      },
      approval: {
        mode: "human",
        approver: "Greg Parker",
        reason: "Approved after evidence review.",
      },
      actor: "greg",
    };
    const validated = await fetch(
      `${base}/v1/repair-revision-promotions/validate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      },
    );
    assert.equal(validated.status, 200);
    const normalized = await validated.json();
    assert.equal(normalized.promotionId, request.promotionId);
    assert.equal(
      normalized.target.expectedArtifactId,
      request.target.expectedArtifactId,
    );

    const compiled = await fetch(
      `${base}/v1/repair-revision-promotions/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      },
    );
    assert.equal(compiled.status, 200);
    const body = await compiled.json();
    assert.equal(body.executionMode, "durable-worker-or-deliberate-local-run");
    assert.equal(body.runtimeJob.kind, "art.repair.promote-revision");
    assert.equal(body.runtimeJob.queue, "selection");
    assert.deepEqual(body.runtimeJob.inputArtifacts, [artifact("a")]);
    assert.deepEqual(body.runtimeJob.requiredCapabilities, [
      "repair.revision-promote",
      "selection.promote",
      "artifacts.store",
      "evidence.bundle",
    ]);
  });
});
