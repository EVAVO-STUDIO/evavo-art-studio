import assert from "node:assert/strict";
import test from "node:test";

import { createProductionPlan } from "../dist/index.js";

const brief = {
  schemaVersion: "1.0",
  project: {
    projectName: "Godot Sprite Test",
    targets: [{ kind: "godot-4.6.2", maximumTextureSize: 4096, textureFiltering: "nearest" }]
  },
  artDirection: {
    styleName: "Authentic 1990s engraved pixel art",
    intent: "Deliberate human-authored sprites with stable silhouettes",
    mustHave: ["consistent baseline", "limited palette"],
    mustAvoid: ["fake checkerboard transparency", "generic AI gloss"]
  },
  assets: [{
    id: "hero-idle",
    name: "Hero idle",
    kind: "sprite-sheet",
    purpose: "Player idle animation",
    quantity: 1,
    dimensions: { width: 64, height: 96 },
    transparency: "alpha-required",
    animation: { name: "idle", frameCount: 8, framesPerSecond: 8, loop: true, pivot: { x: 32, y: 90 } },
    outputs: [{ format: "png", purpose: "runtime", lossless: true }, { format: "json", purpose: "manifest", lossless: true }]
  }],
  autonomy: {
    mode: "fully-automatic",
    candidateCount: 6,
    maximumIterations: 4,
    autoApproveThreshold: 0.94,
    allowProviderFallback: true,
    requireEvidenceBundle: true
  }
};

test("builds deterministic plans", () => {
  const first = createProductionPlan(brief);
  const second = createProductionPlan(structuredClone(brief));
  assert.deepEqual(first, second);
});

test("adds transparency, animation, atlas and Godot gates", () => {
  const plan = createProductionPlan(brief);
  const gates = plan.qualityGates["hero-idle-01"].map((entry) => entry.id);
  for (const expected of ["alpha-channel", "fake-transparency", "edge-halo", "loop-closure", "atlas-padding", "manifest-integrity"]) {
    assert.ok(gates.includes(expected), `missing ${expected}`);
  }
  assert.ok(plan.deliverables.some((entry) => entry.format === "tres"));
  assert.ok(plan.workItems.some((entry) => entry.stage === "godot-resource"));
});
