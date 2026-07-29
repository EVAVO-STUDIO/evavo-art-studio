import assert from "node:assert/strict";
import test from "node:test";

import { createProductionPlan } from "../dist/index.js";

function briefFixture() {
  return {
    schemaVersion: "1.0",
    project: {
      projectName: "Godot Sprite Continuity Test",
      targets: [
        {
          kind: "godot-4.6.2",
          maximumTextureSize: 4096,
          textureFiltering: "nearest",
          compressionPolicy: "lossless",
        },
      ],
    },
    artDirection: {
      styleName: "Authentic 1990s engraved pixel art",
      intent: "Deliberate human-authored sprites with stable identities and silhouettes",
      mustHave: ["consistent baseline", "limited palette", "stable equipment scale"],
      mustAvoid: ["fake checkerboard transparency", "generic AI gloss", "cropped weapons"],
    },
    assets: [
      {
        id: "hero-idle",
        name: "Hero idle",
        kind: "sprite-sheet",
        purpose: "Canonical hero identity and idle animation",
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
          keyPoseFrames: [0, 2, 4, 6],
          frameDurationsMs: [150, 100, 100, 100, 150, 100, 100, 100],
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
              reason: "Anatomy, coat folds and engraved clusters must remain authored as coherent cels.",
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
            {
              id: "weapon",
              role: "weapon",
              treatment: "separate-frame",
              parentId: "body",
              zIndex: 20,
              exportPolicy: "layer-frames",
              allowEmpty: true,
              interchangeable: true,
              reason: "Held equipment is swappable and must preserve handedness and attachment points.",
            },
          ],
          shot: {
            safePadding: 6,
            backgroundPolicy: "transparent",
            allowCrop: false,
            shadowPolicy: "separate",
          },
          continuityLocks: [
            "identity",
            "proportions",
            "silhouette-language",
            "palette",
            "line-treatment",
            "pivot",
            "baseline",
            "equipment",
            "handedness",
          ],
          source: {
            editableSource: "aseprite",
            retainLayerFrames: true,
            retainLinkedCels: true,
          },
          generation: {
            requestUnit: "single-frame",
            identityReferenceWeight: 0.94,
            structureReferenceWeight: 0.9,
            allowIndependentTextOnlyFrames: false,
          },
        },
        outputs: [
          { format: "png", purpose: "runtime", lossless: true },
          { format: "json", purpose: "manifest", lossless: true },
        ],
        tags: ["character", "four-direction", "pixel-art"],
      },
      {
        id: "hero-walk",
        name: "Hero walk",
        kind: "sprite-sheet",
        purpose: "Walk inherited from the approved hero identity",
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
          allowedChanges: ["walk pose", "coat secondary motion", "declared weapon visibility"],
        },
        outputs: [{ format: "png", purpose: "runtime", lossless: true }],
        tags: ["character", "four-direction", "pixel-art"],
      },
      {
        id: "mist",
        name: "Mist particle",
        kind: "particle",
        purpose: "Environmental mist without props or weapons",
        quantity: 1,
        dimensions: { width: 64, height: 64 },
        transparency: "alpha-required",
        animation: {
          name: "drift",
          frameCount: 6,
          framesPerSecond: 12,
          loop: true,
          keyPoseFrames: [0, 3],
        },
        outputs: [{ format: "png", purpose: "runtime", lossless: true }],
      },
    ],
    autonomy: {
      mode: "fully-automatic",
      candidateCount: 8,
      maximumIterations: 5,
      autoApproveThreshold: 0.95,
      allowProviderFallback: true,
      requireEvidenceBundle: true,
    },
  };
}

test("builds deterministic continuity-aware plans", () => {
  const brief = briefFixture();
  const first = createProductionPlan(brief);
  const second = createProductionPlan(structuredClone(brief));
  assert.deepEqual(first, second);
  assert.equal(first.spriteBlueprints.length, 5);
});

test("maps each inherited character instance to the matching canonical identity", () => {
  const plan = createProductionPlan(briefFixture());
  const walkOne = plan.spriteBlueprints.find((entry) => entry.assetInstanceId === "hero-walk-01");
  const walkTwo = plan.spriteBlueprints.find((entry) => entry.assetInstanceId === "hero-walk-02");
  assert.equal(walkOne?.canonicalInstanceId, "hero-idle-01");
  assert.equal(walkTwo?.canonicalInstanceId, "hero-idle-02");
  assert.notEqual(walkOne?.familyId, walkTwo?.familyId);
});

test("plans identity, direction masters, key poses and neighbour-conditioned in-betweens", () => {
  const plan = createProductionPlan(briefFixture());
  const idle = plan.spriteBlueprints.find((entry) => entry.assetInstanceId === "hero-idle-01");
  assert.ok(idle);
  assert.equal(idle.totalFrames, 32);
  assert.equal(idle.frames.filter((frame) => frame.role === "identity-master").length, 1);
  assert.equal(idle.frames.filter((frame) => frame.role === "direction-master").length, 3);
  assert.equal(idle.frames.filter((frame) => frame.role === "key-pose").length, 12);
  const inbetween = idle.frames.find((frame) => frame.role === "inbetween");
  assert.ok(inbetween?.identityReferenceId);
  assert.ok(inbetween?.previousKeyPoseId);
  assert.ok(inbetween?.nextKeyPoseId);
  assert.notEqual(inbetween?.frameSeed, idle.frames[0].frameSeed);
});

test("compiles explicit layer treatment without inventing components from negative text", () => {
  const plan = createProductionPlan(briefFixture());
  const idle = plan.spriteBlueprints.find((entry) => entry.assetInstanceId === "hero-idle-01");
  const mist = plan.spriteBlueprints.find((entry) => entry.assetInstanceId === "mist-01");
  assert.deepEqual(idle?.layers.map((layer) => layer.id), ["shadow", "body", "weapon"]);
  assert.equal(idle?.productionMethod, "hybrid");
  assert.deepEqual(mist?.layers.map((layer) => layer.id), ["effect"]);
  assert.equal(mist?.layers.some((layer) => layer.role === "weapon"), false);
});

test("creates a dependency-complete per-frame work graph", () => {
  const plan = createProductionPlan(briefFixture());
  const ids = new Set(plan.workItems.map((item) => item.id));
  for (const item of plan.workItems) {
    for (const dependency of item.dependsOn) {
      assert.ok(ids.has(dependency), `${item.id} has missing dependency ${dependency}`);
    }
  }
  assert.ok(plan.workItems.some((item) => item.stage === "identity-master"));
  assert.ok(plan.workItems.some((item) => item.stage === "direction-master"));
  assert.ok(plan.workItems.some((item) => item.stage === "key-pose"));
  assert.ok(plan.workItems.some((item) => item.stage === "inbetween-frame"));
  assert.ok(plan.workItems.some((item) => item.stage === "layer-registration"));
  assert.ok(plan.workItems.some((item) => item.stage === "source-package"));
});

test("adds blocking continuity, layer, source, transparency, atlas and Godot gates", () => {
  const plan = createProductionPlan(briefFixture());
  const gates = plan.qualityGates["hero-idle-01"].map((entry) => entry.id);
  for (const expected of [
    "alpha-channel",
    "fake-transparency",
    "edge-halo",
    "frame-crop",
    "frame-duration",
    "identity-consistency",
    "proportion-consistency",
    "equipment-consistency",
    "layer-registration",
    "layer-occlusion",
    "source-composite-parity",
    "editable-source",
    "loop-closure",
    "atlas-padding",
    "manifest-integrity",
  ]) {
    assert.ok(gates.includes(expected), `missing ${expected}`);
  }
});

test("retains editable source, individual frames, registered layers and packed derivatives", () => {
  const plan = createProductionPlan(briefFixture());
  const idle = plan.spriteBlueprints.find((entry) => entry.assetInstanceId === "hero-idle-01");
  assert.ok(idle);
  const deliverables = plan.deliverables.filter((entry) => entry.assetInstanceId === "hero-idle-01");
  assert.ok(deliverables.some((entry) => entry.format === "aseprite" && entry.purpose === "source"));
  assert.equal(
    deliverables.filter((entry) => entry.frameIndex !== undefined && entry.layerId === undefined && entry.format === "png").length,
    idle.totalFrames,
  );
  assert.ok(deliverables.some((entry) => entry.layerId === "shadow"));
  assert.ok(deliverables.some((entry) => entry.layerId === "weapon"));
  assert.ok(deliverables.some((entry) => entry.format === "tres"));
  assert.ok(deliverables.some((entry) => entry.relativePath.includes("continuity-contact-sheet")));
});

test("preserves exact Aseprite milliseconds and Godot relative duration units", () => {
  const plan = createProductionPlan(briefFixture());
  const idle = plan.spriteBlueprints.find((entry) => entry.assetInstanceId === "hero-idle-01");
  assert.ok(idle);
  assert.deepEqual(
    idle.frames.filter((frame) => frame.direction === "down").map((frame) => frame.durationMs),
    [150, 100, 100, 100, 150, 100, 100, 100],
  );
  assert.deepEqual(
    idle.frames.filter((frame) => frame.direction === "down").map((frame) => frame.godotRelativeDuration),
    [1.2, 0.8, 0.8, 0.8, 1.2, 0.8, 0.8, 0.8],
  );
});
