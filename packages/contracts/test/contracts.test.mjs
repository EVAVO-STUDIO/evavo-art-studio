import assert from "node:assert/strict";
import test from "node:test";

import { validateArtBrief } from "../dist/index.js";

function baseBrief() {
  return {
    schemaVersion: "1.0",
    project: {
      projectName: "Continuity Test",
      targets: [{ kind: "godot-4.6.2", textureFiltering: "nearest" }],
    },
    artDirection: {
      styleName: "Authored 1990s pixel art",
      intent: "Stable identity and deliberate motion",
      mustHave: ["clear silhouette", "consistent baseline"],
      mustAvoid: ["generic AI gloss", "cropped weapons"],
    },
    assets: [
      {
        id: "hero-idle",
        name: "Hero idle",
        kind: "sprite-sheet",
        purpose: "Canonical hero identity and idle",
        quantity: 2,
        dimensions: { width: 96, height: 128 },
        transparency: "alpha-required",
        animation: {
          name: "idle",
          frameCount: 8,
          framesPerSecond: 8,
          loop: true,
          directions: 4,
          directionNames: ["down", "left", "right", "up"],
          frameDurationsMs: [150, 100, 100, 100, 150, 100, 100, 100],
          keyPoseFrames: [0, 2, 4, 6],
          pivot: { x: 48, y: 120 },
          baseline: 120,
        },
        sprite: {
          productionMethod: "hybrid",
          layers: [
            {
              id: "body",
              role: "body",
              treatment: "baked-into-cel",
              zIndex: 10,
              reason: "Anatomy and coat folds need authored cel continuity without puppet seams.",
            },
            {
              id: "shadow",
              role: "shadow",
              treatment: "linked-cel",
              zIndex: 0,
              framePolicy: "linked-until-change",
              exportPolicy: "layer-frames",
              allowEmpty: true,
              reason: "The contact shadow is reusable and needs independent opacity control.",
            },
          ],
          shot: {
            safePadding: 6,
            backgroundPolicy: "transparent",
            allowCrop: false,
            shadowPolicy: "separate",
          },
          source: {
            editableSource: "aseprite",
            retainLayerFrames: true,
          },
        },
        outputs: [
          { format: "png", purpose: "runtime", lossless: true },
          { format: "json", purpose: "manifest", lossless: true },
        ],
      },
      {
        id: "hero-walk",
        name: "Hero walk",
        kind: "sprite-sheet",
        purpose: "Walk cycle inherited from hero idle identity",
        quantity: 2,
        dimensions: { width: 96, height: 128 },
        transparency: "alpha-required",
        animation: {
          name: "walk",
          frameCount: 8,
          framesPerSecond: 10,
          loop: true,
          directions: 4,
          directionNames: ["down", "left", "right", "up"],
          keyPoseFrames: [0, 2, 4, 6],
          pivot: { x: 48, y: 120 },
          baseline: 120,
        },
        sprite: {
          canonicalAssetId: "hero-idle",
          canonicalInstancePolicy: "index-matched",
          productionMethod: "authored-cel",
        },
        outputs: [{ format: "png", purpose: "runtime", lossless: true }],
      },
    ],
    autonomy: {
      mode: "fully-automatic",
      candidateCount: 6,
      maximumIterations: 4,
      autoApproveThreshold: 0.95,
      allowProviderFallback: true,
      requireEvidenceBundle: true,
    },
  };
}

test("validates canonical identity, exact timing and layer treatment", () => {
  const result = validateArtBrief(baseBrief());
  assert.equal(result.success, true);
});

test("rejects canonical cycles", () => {
  const brief = baseBrief();
  brief.assets[0].sprite.canonicalAssetId = "hero-walk";
  brief.assets[0].sprite.canonicalInstancePolicy = "index-matched";
  const result = validateArtBrief(brief);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.issues.some((entry) => entry.message.includes("Canonical identity cycle")));
  }
});

test("rejects ambiguous quantity mapping", () => {
  const brief = baseBrief();
  brief.assets[1].quantity = 3;
  delete brief.assets[1].sprite.canonicalInstancePolicy;
  const result = validateArtBrief(brief);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.issues.some((entry) => entry.message.includes("Quantity mapping is ambiguous")));
  }
});

test("rejects out-of-range key poses and inconsistent direction names", () => {
  const brief = baseBrief();
  brief.assets[0].animation.keyPoseFrames = [0, 8];
  brief.assets[0].animation.directionNames = ["down", "left"];
  const result = validateArtBrief(brief);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.issues.some((entry) => entry.path.endsWith("keyPoseFrames[1]")));
    assert.ok(result.issues.some((entry) => entry.path.endsWith("directionNames")));
  }
});

test("rejects invalid layer parenting and baked layer-frame exports", () => {
  const brief = baseBrief();
  brief.assets[0].sprite.layers[0].parentId = "missing";
  brief.assets[0].sprite.layers[0].exportPolicy = "layer-frames";
  const result = validateArtBrief(brief);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.issues.some((entry) => entry.message.includes("Layer parent does not exist")));
    assert.ok(result.issues.some((entry) => entry.message.includes("baked layer")));
  }
});

test("forbids independent text-only frame generation", () => {
  const brief = baseBrief();
  brief.assets[0].sprite.generation = { allowIndependentTextOnlyFrames: true };
  const result = validateArtBrief(brief);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.issues.some((entry) => entry.message.includes("text-only frame generation is forbidden")));
  }
});
