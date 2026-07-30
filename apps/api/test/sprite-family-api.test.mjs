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

const manifest = {
  schemaVersion: "1.0",
  familyId: "api-family",
  canvas: { width: 16, height: 16 },
  layerDefinitions: [
    {
      id: "body",
      role: "identity-core",
      sourcePolicy: "per-frame",
      required: true,
      contributesToComposite: true,
      contributesToIdentity: true,
      zIndex: 0,
    },
  ],
  frames: [
    {
      id: "idle-down-000",
      animation: "idle",
      direction: "down",
      frameIndex: 0,
      globalFrameIndex: 0,
      durationMs: 125,
      pivot: { x: 8, y: 12 },
      declaredCompositeArtifactId: artifact("2"),
      layers: [{ layerId: "body", artifactId: artifact("1") }],
    },
  ],
  policy: { identityReferenceFrameId: "idle-down-000" },
};

test("sprite family protocol and compiler remain worker-only", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(`${base}/v1/sprite-family-protocol`);
    assert.equal(protocol.status, 200);
    const protocolBody = await protocol.json();
    assert.ok(protocolBody.layerRoles.includes("identity-core"));
    assert.ok(protocolBody.sourcePolicies.includes("linked-cel"));

    const compiled = await fetch(`${base}/v1/sprite-families/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manifest),
    });
    assert.equal(compiled.status, 200);
    const body = await compiled.json();
    assert.equal(body.executionMode, "durable-worker-only");
    assert.equal(body.runtimeJob.queue, "selection");
    assert.equal(body.runtimeJob.kind, "sprite.family.verify");
    assert.deepEqual(body.runtimeJob.inputArtifacts, [artifact("1"), artifact("2")]);
    assert.deepEqual(body.runtimeJob.requiredCapabilities, [
      "sprite.family.verify",
      "media.layer-compose",
      "selection.compare",
      "evidence.bundle",
    ]);
    assert.equal(body.manifestSha256.length, 64);
  });
});

test("sprite family API rejects engine sidecar leakage", async () => {
  await withServer(async (base) => {
    const invalid = structuredClone(manifest);
    invalid.layerDefinitions[0].role = "normal";
    invalid.layerDefinitions[0].sourcePolicy = "engine-sidecar";
    const response = await fetch(`${base}/v1/sprite-families/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invalid),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error.code, "SPRITE_FAMILY_MANIFEST_INVALID");
    assert.match(body.error.message, /cannot contribute/);
  });
});

test("sprite family route source contains no execution shortcut", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../src/sprite-family-api.ts", import.meta.url), "utf8"),
  );
  for (const token of [
    "/v1/sprite-family-protocol",
    "/v1/sprite-families/validate",
    "/v1/sprite-families/compile",
    'kind: "sprite.family.verify"',
    'executionMode: "durable-worker-only"',
  ]) {
    assert.ok(source.includes(token), `missing sprite-family API invariant: ${token}`);
  }
  for (const forbidden of [
    "verifySpriteFamily(",
    "LocalArtifactStore",
    "EVAVO_ART_WRITE_TOKEN",
    "OPENAI_API_KEY",
  ]) {
    assert.ok(!source.includes(forbidden), `API execution shortcut: ${forbidden}`);
  }
});
