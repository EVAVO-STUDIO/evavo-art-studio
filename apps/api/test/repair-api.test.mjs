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

test("repair protocol and compiler expose planning-only durable governance", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(`${base}/v1/repair-protocol`);
    assert.equal(protocol.status, 200);
    const protocolBody = await protocol.json();
    assert.ok(protocolBody.strategies.includes("masked-provider-inpaint"));
    assert.ok(
      protocolBody.rules.some((entry) => entry.includes("never approves")),
    );

    const compiled = await fetch(`${base}/v1/repairs/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: "1.0",
        repairId: "api-pivot-repair",
        familyEvidenceArtifactId: artifact("a"),
        target: { frameId: "idle-000", gateIds: ["frame-pivot"] },
        intent: "Correct pivot metadata without changing pixels.",
        provider: { enabled: false },
      }),
    });
    assert.equal(compiled.status, 200);
    const body = await compiled.json();
    assert.equal(body.executionMode, "durable-worker-only");
    assert.equal(body.runtimeJob.kind, "art.repair.plan");
    assert.deepEqual(body.runtimeJob.requiredCapabilities, [
      "repair.plan",
      "artifacts.store",
      "evidence.bundle",
    ]);
    assert.deepEqual(body.runtimeJob.inputArtifacts, [artifact("a")]);
    assert.equal(body.runtimeJob.payload.provider.enabled, false);
  });
});

test("repair revision REST controls validate and compile without artifact access", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(`${base}/v1/repair-revision-protocol`);
    assert.equal(protocol.status, 200);
    const protocolBody = await protocol.json();
    assert.equal(protocolBody.kind, "art.repair.revise-family");
    assert.ok(
      protocolBody.requiredCapabilities.includes("quality.sprite-frame"),
    );

    const request = {
      schemaVersion: "1.0",
      revisionId: "api-family-revision-01",
      repairPacketArtifactId: artifact("a"),
      repairExecutionEvidenceArtifactId: artifact("b"),
      restoredCandidateArtifactId: artifact("c"),
    };
    const validated = await fetch(`${base}/v1/repair-revisions/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(validated.status, 200);
    const normalized = await validated.json();
    assert.equal(normalized.revisionId, request.revisionId);
    assert.equal(normalized.quality.transparency, "alpha-required");

    const compiled = await fetch(`${base}/v1/repair-revisions/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(compiled.status, 200);
    const body = await compiled.json();
    assert.equal(body.executionMode, "durable-worker-or-deliberate-local-run");
    assert.equal(body.runtimeJob.kind, "art.repair.revise-family");
    assert.equal(body.runtimeJob.queue, "selection");
    assert.deepEqual(body.runtimeJob.inputArtifacts, [
      artifact("a"),
      artifact("b"),
      artifact("c"),
    ]);
    assert.ok(body.runtimeJob.requiredCapabilities.includes("sprite.family.verify"));
  });
});

test("repair REST validation rejects invalid artifact ids without write access", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/repairs/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: "1.0",
        repairId: "invalid-repair",
        familyEvidenceArtifactId: "not-an-artifact",
        target: { frameId: "idle-000" },
        intent: "repair",
      }),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error.code, "TARGETED_REPAIR_REQUEST_INVALID");
    assert.match(body.error.message, /artifact_<sha256>/);
  });
});
