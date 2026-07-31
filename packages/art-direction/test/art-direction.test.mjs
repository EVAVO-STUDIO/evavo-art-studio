import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtDirectionError,
  artDirectionProtocolSummary,
  compileArtDirectionContract,
  compileArtDirectionJob,
  listArtDirectionOutputProfiles,
  listArtDirectionPresets,
  validateArtDirectionCompileRequest,
} from "../dist/index.js";

function isometricRequest(overrides = {}) {
  return {
    schemaVersion: "1.0",
    contractId: "hero-isometric-style",
    presetId: "isometric-rpg-1997",
    project: {
      projectId: "demo-rpg",
      title: "Demo Isometric RPG",
      engine: "Godot",
      engineVersion: "4.6.2",
      gameGenre: "historical role-playing game",
      targetPlatform: "desktop",
      viewport: { width: 1280, height: 720 },
      worldScale: {
        tileWidthPixels: 64,
        tileHeightPixels: 32,
        characterHeightPixels: 96,
      },
    },
    style: {
      mustHave: ["weathered mariner coat", "project-specific brass equipment"],
      mustAvoid: ["generic fantasy armour"],
      references: [
        {
          id: "hero-canonical",
          role: "identity",
          uri: "artifact:hero-canonical",
          weight: 1,
          rights: "project-owned",
        },
        {
          id: "period-clothing",
          role: "historical",
          uri: "artifact:period-clothing",
          weight: 0.8,
          rights: "licensed reference",
        },
      ],
    },
    asset: {
      assetId: "hero-deck-captain",
      family: "character",
      purpose: "Eight-direction playable captain walk cycle.",
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
      runtimeCostumeVariants: true,
      independentEffects: true,
      independentShadow: true,
      needsCollision: true,
      needsNormalMap: true,
      secondaryMotion: ["hair", "cloak"],
      tileFootprint: { width: 1, height: 1 },
    },
    outputProfileIds: ["godot-4.6.2-isometric-character"],
    ...overrides,
  };
}

test("compiles a locked eight-direction isometric Godot style contract", () => {
  const contract = compileArtDirectionContract(isometricRequest());
  assert.equal(contract.style.projection, "isometric-2:1");
  assert.equal(contract.style.camera.pitchDegrees, 35.264);
  assert.equal(contract.production.directionNames.length, 8);
  assert.equal(contract.production.pivot.x, 64);
  assert.equal(contract.production.ySortOrigin.y, 123);
  assert.deepEqual(contract.production.tileFootprint, { width: 1, height: 1 });
  assert.equal(contract.outputs[0].id, "godot-4.6.2-isometric-character");
  assert.ok(contract.qualityGates.some((gate) => gate.id === "isometric-2-to-1-projection"));
  assert.ok(contract.qualityGates.some((gate) => gate.id === "pixel-cluster-coherence"));
  assert.ok(contract.delivery.godot?.projectSettings.some((entry) => entry.includes("Y-sort")));
});

test("separates reusable and engine-owned layers without over-segmenting identity", () => {
  const contract = compileArtDirectionContract(isometricRequest());
  const byRole = new Map(contract.production.layers.map((entry) => [entry.role, entry]));
  assert.equal(byRole.get("identity-core")?.treatment, "separate-per-frame");
  assert.equal(byRole.get("weapon")?.interchangeable, true);
  assert.equal(byRole.get("shadow")?.contributesToIdentity, false);
  assert.equal(byRole.get("normal")?.treatment, "engine-sidecar");
  assert.equal(byRole.get("collision")?.treatment, "engine-sidecar");
  assert.equal(byRole.get("guide")?.treatment, "guide-only");
  assert.ok(
    contract.production.shot.exclude.some((entry) => entry.includes("normal engine-sidecar")),
  );
});

test("rejects a non-2:1 isometric world scale", () => {
  const request = isometricRequest();
  request.project.worldScale.tileWidthPixels = 60;
  assert.throws(
    () => validateArtDirectionCompileRequest(request),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "ART_DIRECTION_ISOMETRIC_RATIO_INVALID",
  );
});

test("rejects preset lock drift", () => {
  const request = isometricRequest();
  request.style.projection = "side";
  assert.throws(
    () => validateArtDirectionCompileRequest(request),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "ART_DIRECTION_PRESET_LOCK_VIOLATION",
  );
});

test("rejects unsafe mirroring for asymmetric held equipment", () => {
  const request = isometricRequest();
  request.style.camera = { mirroring: "allowed" };
  assert.throws(
    () => validateArtDirectionCompileRequest(request),
    (error) => error instanceof ArtDirectionError,
  );
});

test("compiles pre-rendered 2.5D with a locked rig and sidecars", () => {
  const contract = compileArtDirectionContract({
    schemaVersion: "1.0",
    contractId: "monster-2.5d-style",
    presetId: "prerendered-2.5d-1996",
    project: {
      projectId: "monster-demo",
      title: "Monster Demo",
      engine: "Godot",
      engineVersion: "4.6.2",
    },
    style: {
      references: [
        {
          id: "monster-model",
          role: "identity",
          uri: "artifact:monster-model",
          rights: "project-owned",
        },
      ],
    },
    asset: {
      assetId: "monster-ogre",
      family: "creature",
      purpose: "Pre-rendered eight-direction combat animation.",
      dimensions: { width: 160, height: 160 },
      transparency: "required",
      animated: true,
      frameCount: 12,
      directionCount: 8,
      asymmetric: true,
      independentShadow: true,
      needsNormalMap: true,
      needsEmissionMap: true,
      largeDeformations: true,
    },
    outputProfileIds: ["godot-4.6.2-2.5d-billboard"],
  });
  assert.equal(contract.style.renderingMode, "pre-rendered-2.5d");
  assert.ok(contract.qualityGates.some((entry) => entry.id === "render-rig-lock"));
  assert.ok(contract.production.layers.some((entry) => entry.role === "depth"));
  assert.ok(contract.delivery.sourceOfTruth.includes("individual lossless frame sequence"));
});

test("compiles the monochrome 1871 preset without grayscale drift", () => {
  const contract = compileArtDirectionContract({
    schemaVersion: "1.0",
    contractId: "dock-worker-engraving",
    presetId: "engraved-monochrome-1871",
    project: {
      projectId: "brass-and-brine",
      title: "Brass and Brine",
      engine: "Godot",
      engineVersion: "4.6.2",
    },
    style: {
      references: [
        {
          id: "new-orleans-1871",
          role: "historical",
          uri: "artifact:new-orleans-1871",
          rights: "public-domain reference",
        },
      ],
    },
    asset: {
      assetId: "dock-worker",
      family: "character",
      purpose: "Four-direction dock worker idle animation.",
      dimensions: { width: 128, height: 128 },
      transparency: "required",
      animated: true,
      frameCount: 6,
      directionCount: 4,
      directionNames: ["left", "right", "toward", "away"],
      asymmetric: true,
      independentShadow: true,
      needsCollision: true,
    },
    outputProfileIds: ["godot-4.6.2-character-sprite"],
  });
  assert.equal(contract.style.palette.mode, "monochrome");
  assert.equal(contract.style.palette.maxColours, 2);
  assert.equal(contract.style.pixelGrid.outline, "inked");
  assert.ok(contract.qualityGates.some((entry) => entry.id === "historical-plausibility"));
});

test("does not invent a weapon layer from negative language", () => {
  const contract = compileArtDirectionContract({
    schemaVersion: "1.0",
    contractId: "unarmed-idle",
    presetId: "console-platformer-16bit",
    project: { projectId: "platformer", title: "Platformer", engine: "Godot" },
    style: { mustAvoid: ["cropped weapons", "modern firearms"] },
    asset: {
      assetId: "unarmed-hero",
      family: "character",
      purpose: "Unarmed idle animation.",
      dimensions: { width: 48, height: 48 },
      transparency: "required",
      animated: true,
      frameCount: 4,
      directionCount: 2,
      directionNames: ["left", "right"],
      hasHeldItems: false,
      runtimeEquipmentSwaps: false,
    },
    outputProfileIds: ["godot-4.6.2-character-sprite"],
  });
  assert.equal(contract.production.layers.some((entry) => entry.role === "weapon"), false);
});

test("rejects an incompatible output profile", () => {
  const request = isometricRequest({
    asset: {
      assetId: "hero",
      family: "character",
      purpose: "Hero",
      dimensions: { width: 128, height: 128 },
      animated: true,
      frameCount: 8,
      directionCount: 8,
      asymmetric: true,
      hasHeldItems: true,
      runtimeEquipmentSwaps: true,
    },
    outputProfileIds: ["godot-4.6.2-particle-flipbook"],
  });
  assert.throws(
    () => validateArtDirectionCompileRequest(request),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "ART_DIRECTION_OUTPUT_INCOMPATIBLE",
  );
});

test("compilation and job hashes are deterministic", () => {
  const first = compileArtDirectionContract(isometricRequest());
  const second = compileArtDirectionContract(isometricRequest());
  assert.equal(first.requestSha256, second.requestSha256);
  assert.equal(first.contractSha256, second.contractSha256);
  const job = compileArtDirectionJob(isometricRequest());
  assert.equal(job.runtimeJob.kind, "art.direction.compile");
  assert.equal(job.runtimeJob.queue, "control");
  assert.deepEqual(job.runtimeJob.requiredCapabilities, [
    "art-direction.compile",
    "style.preset.resolve",
    "output-profile.compile",
    "evidence.bundle",
  ]);
});

test("protocol lists governed presets and output profiles", () => {
  const protocol = artDirectionProtocolSummary();
  assert.equal(protocol.protocolVersion, "2026-07-31.1");
  assert.equal(protocol.presets.length, listArtDirectionPresets().length);
  assert.equal(protocol.outputProfiles.length, listArtDirectionOutputProfiles().length);
  assert.ok(protocol.layerDecisionRules.some((entry) => entry.includes("visible seams")));
  assert.ok(protocol.godotRules.some((entry) => entry.includes("Y-sort")));
});
