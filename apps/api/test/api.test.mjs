import assert from "node:assert/strict";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createArtStudioApiServer } from "../dist/index.js";

const transparentFixture =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==";
const writeToken = "evavo-art-test-write-token-0123456789abcdef";

const brief = {
  schemaVersion: "1.0",
  project: { projectName: "API Test", targets: [{ kind: "godot-4.6.2" }] },
  artDirection: {
    styleName: "Editorial sprite",
    intent: "Deliberate and continuity locked",
    mustHave: ["clear hierarchy", "stable identity"],
    mustAvoid: ["generic AI look", "independently reinvented frames"],
  },
  assets: [
    {
      id: "hero",
      name: "Hero",
      kind: "sprite-sheet",
      purpose: "Player idle",
      quantity: 1,
      dimensions: { width: 96, height: 128 },
      transparency: "alpha-required",
      animation: {
        name: "idle",
        frameCount: 4,
        framesPerSecond: 8,
        loop: true,
        directions: 2,
        directionNames: ["left", "right"],
        keyPoseFrames: [0, 2],
        pivot: { x: 48, y: 120 },
        baseline: 120,
      },
      sprite: {
        productionMethod: "authored-cel",
        generation: { allowIndependentTextOnlyFrames: false },
      },
      outputs: [{ format: "png", purpose: "runtime", lossless: true }],
    },
  ],
  autonomy: {
    mode: "review-gated",
    candidateCount: 4,
    maximumIterations: 3,
    autoApproveThreshold: 0.94,
    allowProviderFallback: true,
    requireEvidenceBundle: true,
  },
};

async function withServer(run, options = {}) {
  const server = createArtStudioApiServer(options);
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

async function atlasFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-art-api-atlas-"));
  const imagePath = path.join(root, "frame.png");
  const manifestPath = path.join(root, "atlas.json");
  const outputDirectory = path.join(root, "generated");
  await writeFile(imagePath, Buffer.from(transparentFixture, "base64"));
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1.0",
      atlasId: "api-atlas",
      frames: [
        {
          id: "frame-001",
          path: "frame.png",
          pivot: { x: 4, y: 7 },
        },
      ],
      animations: [
        {
          name: "idle",
          loopMode: "linear",
          frames: [
            { frameId: "frame-001", durationMs: 125 },
            { frameId: "frame-001", durationMs: 250 },
          ],
        },
      ],
      settings: {
        maximumWidth: 64,
        maximumHeight: 64,
        padding: 1,
        extrusion: 1,
        powerOfTwo: "required",
      },
    }),
  );
  return { root, manifestPath, outputDirectory };
}

test("serves health and continuity-aware production plans", async () => {
  await withServer(async (base) => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const healthPayload = await health.json();
    assert.equal(healthPayload.writesEnabled, false);

    const plan = await fetch(`${base}/v1/plans`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(brief),
    });
    assert.equal(plan.status, 201);
    const payload = await plan.json();
    assert.equal(payload.projectName, "API Test");
    assert.equal(payload.spriteBlueprints.length, 1);
    assert.equal(payload.spriteBlueprints[0].totalFrames, 8);
    assert.ok(
      payload.workItems.some((entry) => entry.stage === "identity-master"),
    );
  });
});

test("inspects a real transparent sprite frame", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/quality/sprite-frame`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageBase64: transparentFixture,
        expectations: {
          frameId: "fixture",
          transparency: "alpha-required",
          expectedWidth: 8,
          expectedHeight: 8,
          safePadding: 1,
        },
      }),
    });
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.passed, true);
    assert.equal(report.source.hasAlpha, true);
  });
});

test("rejects malformed base64 as a validation error", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/quality/sprite-frame`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageBase64: "not-base64",
        expectations: { transparency: "alpha-required" },
      }),
    });
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.error.code, "SPRITE_FRAME_BASE64_INVALID");
  });
});

test("atlas writes fail closed by default", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/atlases/build`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manifestPath: "C:/art/atlas.json",
        outputDirectory: "C:/art/generated",
      }),
    });
    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error.code, "ART_STUDIO_WRITES_DISABLED");
  });
});

test("enabled atlas writes still require the separate write token", async () => {
  await withServer(
    async (base) => {
      const response = await fetch(`${base}/v1/atlases/build`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          manifestPath: "atlas.json",
          outputDirectory: "generated",
        }),
      });
      assert.equal(response.status, 401);
      const payload = await response.json();
      assert.equal(payload.error.code, "ART_STUDIO_WRITE_UNAUTHORIZED");
    },
    {
      allowWrites: true,
      writeToken,
    },
  );
});

test("builds an evidence-backed atlas only when writes are authenticated", async () => {
  const fixture = await atlasFixture();
  await withServer(
    async (base) => {
      const response = await fetch(`${base}/v1/atlases/build`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${writeToken}`,
        },
        body: JSON.stringify({
          manifestPath: fixture.manifestPath,
          outputDirectory: fixture.outputDirectory,
        }),
      });
      const responseBody = await response.text();
      assert.equal(response.status, 201, responseBody);
      const payload = JSON.parse(responseBody);
      assert.equal(payload.schemaVersion, "1.0");
      assert.equal(payload.atlas.packageData.atlasId, "api-atlas");
      assert.equal(payload.atlas.packageData.frames.length, 1);
      assert.equal(payload.atlas.packageData.animations[0].frames.length, 2);
      assert.equal(payload.executionAvailable, false);
      await access(payload.atlas.imagePath);
      await access(payload.atlas.dataPath);
      await access(payload.atlas.evidencePath);
    },
    {
      allowWrites: true,
      writeToken,
      allowedRepositoryRoots: [fixture.root],
    },
  );
});
