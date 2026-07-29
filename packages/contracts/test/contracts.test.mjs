import assert from "node:assert/strict";
import test from "node:test";

import { validateArtBrief } from "../dist/index.js";

const validBrief = {
  schemaVersion: "1.0",
  project: { projectName: "Test Game", targets: [{ kind: "godot-4.6.2" }] },
  artDirection: { styleName: "Engraved", intent: "Authentic", mustHave: ["clear silhouette"], mustAvoid: ["generic AI gloss"] },
  assets: [{
    id: "hero",
    name: "Hero",
    kind: "character",
    purpose: "Player sprite",
    quantity: 1,
    dimensions: { width: 128, height: 128 },
    transparency: "alpha-required",
    outputs: [{ format: "png", purpose: "runtime", lossless: true }]
  }],
  autonomy: {
    mode: "fully-automatic",
    candidateCount: 4,
    maximumIterations: 3,
    autoApproveThreshold: 0.92,
    allowProviderFallback: true,
    requireEvidenceBundle: true
  }
};

test("validates a complete brief", () => {
  assert.equal(validateArtBrief(validBrief).success, true);
});

test("rejects duplicate asset ids and invalid dimensions", () => {
  const invalid = structuredClone(validBrief);
  invalid.assets.push({ ...invalid.assets[0], dimensions: { width: 0, height: 128 } });
  const result = validateArtBrief(invalid);
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.issues.length >= 2);
});
