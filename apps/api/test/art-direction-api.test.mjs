import assert from "node:assert/strict";
import test from "node:test";

import { createArtStudioApiServer } from "../dist/index.js";

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

function request() {
  return {
    schemaVersion: "1.0",
    contractId: "api-isometric-contract",
    presetId: "isometric-rpg-1997",
    project: {
      projectId: "api-game",
      title: "API Game",
      engine: "Godot",
      engineVersion: "4.6.2",
      gameGenre: "historical isometric role-playing game",
      worldScale: {
        tileWidthPixels: 64,
        tileHeightPixels: 32,
        characterHeightPixels: 96,
      },
    },
    style: {
      mustHave: ["project-specific silhouette"],
      references: [
        {
          id: "canonical",
          role: "identity",
          uri: "artifact:canonical",
          rights: "project-owned",
        },
      ],
    },
    asset: {
      assetId: "hero",
      family: "character",
      purpose: "Eight-direction hero walk cycle.",
      dimensions: { width: 128, height: 128 },
      transparency: "required",
      animated: true,
      frameCount: 8,
      framesPerSecond: 8,
      loop: true,
      directionCount: 8,
      asymmetric: true,
      hasHeldItems: true,
      runtimeEquipmentSwaps: true,
      independentShadow: true,
      needsCollision: true,
      tileFootprint: { width: 1, height: 1 },
    },
    outputProfileIds: ["godot-4.6.2-isometric-character"],
  };
}

test("art-direction REST protocol exposes governed presets and output profiles", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(`${base}/v1/art-direction-protocol`);
    assert.equal(protocol.status, 200);
    const body = await protocol.json();
    assert.equal(body.protocolVersion, "2026-07-31.1");
    assert.ok(body.presets.some((entry) => entry.id === "isometric-rpg-1997"));
    assert.ok(
      body.outputProfiles.some(
        (entry) => entry.id === "godot-4.6.2-isometric-character",
      ),
    );
  });
});

test("art-direction REST compilation returns one deterministic contract and control job", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/art-directions/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request()),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.compiledContract.style.projection, "isometric-2:1");
    assert.equal(body.compiledContract.production.directionNames.length, 8);
    assert.equal(body.compiledJob.runtimeJob.kind, "art.direction.compile");
    assert.deepEqual(body.compiledJob.runtimeJob.requiredCapabilities, [
      "art-direction.compile",
      "style.preset.resolve",
      "output-profile.compile",
      "evidence.bundle",
    ]);
    assert.match(body.executionBoundary, /does not call a provider/i);
  });
});

test("art-direction REST validation rejects non-2:1 isometric geometry", async () => {
  await withServer(async (base) => {
    const invalid = request();
    invalid.project.worldScale.tileWidthPixels = 60;
    const response = await fetch(`${base}/v1/art-directions/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invalid),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error.code, "ART_DIRECTION_ISOMETRIC_RATIO_INVALID");
  });
});
