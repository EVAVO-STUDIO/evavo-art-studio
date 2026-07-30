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

test("revision ranking REST controls remain compile-only", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(`${base}/v1/repair-revision-ranking-protocol`);
    assert.equal(protocol.status, 200);
    const protocolBody = await protocol.json();
    assert.equal(protocolBody.kind, "art.repair.rank-revisions");
    assert.ok(protocolBody.requiredCapabilities.includes("selection.compare"));

    const request = {
      schemaVersion: "1.0",
      rankingId: "api-revision-ranking",
      bridgeEvidenceArtifactId: artifact("a"),
    };
    const validated = await fetch(
      `${base}/v1/repair-revision-rankings/validate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      },
    );
    assert.equal(validated.status, 200);
    const normalized = await validated.json();
    assert.equal(normalized.rankingId, request.rankingId);

    const compiled = await fetch(
      `${base}/v1/repair-revision-rankings/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      },
    );
    assert.equal(compiled.status, 200);
    const body = await compiled.json();
    assert.equal(body.executionMode, "durable-worker-or-deliberate-local-run");
    assert.equal(body.runtimeJob.kind, "art.repair.rank-revisions");
    assert.equal(body.runtimeJob.queue, "selection");
    assert.deepEqual(body.runtimeJob.inputArtifacts, [artifact("a")]);
    assert.deepEqual(body.runtimeJob.requiredCapabilities, [
      "repair.revision-ranking",
      "selection.compare",
      "artifacts.store",
      "evidence.bundle",
    ]);
  });
});
