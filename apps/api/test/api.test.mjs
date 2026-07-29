import assert from "node:assert/strict";
import test from "node:test";

import { createArtStudioApiServer } from "../dist/index.js";

const brief = {
  schemaVersion: "1.0",
  project: { projectName: "API Test", targets: [{ kind: "godot-4.6.2" }] },
  artDirection: {
    styleName: "Editorial sprite",
    intent: "Deliberate and continuity locked",
    mustHave: ["clear hierarchy", "stable identity"],
    mustAvoid: ["generic AI look", "independently reinvented frames"],
  },
  assets: [{
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
  }],
  autonomy: {
    mode: "review-gated",
    candidateCount: 4,
    maximumIterations: 3,
    autoApproveThreshold: 0.94,
    allowProviderFallback: true,
    requireEvidenceBundle: true,
  },
};

test("serves health and continuity-aware production plans", async (t) => {
  const server = createArtStudioApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
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
  assert.ok(payload.workItems.some((entry) => entry.stage === "identity-master"));
});
