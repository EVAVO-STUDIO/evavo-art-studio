import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtDirectionError,
  compileArtDirectionContract,
  compileArtDirectionJob,
  listArtDirectionOutputProfiles,
  validateArtDirectionCompileRequest,
} from "../dist/index.js";

function request(overrides = {}) {
  return {
    schemaVersion: "1.0",
    contractId: "ashen-palace-hero-godot-4-7-1",
    presetId: "console-platformer-16bit",
    project: {
      projectId: "ashen-palace",
      title: "The Ashen Palace",
      engine: "Godot",
      engineVersion: "4.7.1",
      gameGenre: "cinematic platformer",
      targetPlatform: "desktop",
      viewport: { width: 320, height: 180 },
    },
    style: {
      references: [
        {
          id: "hero-identity",
          role: "identity",
          uri: "artifact:ashen-palace-hero-identity",
          rights: "project-owned",
        },
      ],
    },
    asset: {
      assetId: "ashen-palace-hero",
      family: "character",
      purpose: "Independently authored left and right hero animation.",
      dimensions: { width: 64, height: 64 },
      transparency: "required",
      animated: true,
      frameCount: 8,
      framesPerSecond: 10,
      loop: true,
      directionCount: 2,
      directionNames: ["left", "right"],
      asymmetric: true,
      hasHeldItems: true,
      needsCollision: false,
    },
    outputProfileIds: [
      "godot-4.7.1-character-sprite",
      "web-game-raster",
    ],
    ...overrides,
  };
}

test("lists and compiles the Godot 4.7.1 character SpriteFrames profile", () => {
  const profiles = listArtDirectionOutputProfiles();
  const profile = profiles.find(
    (entry) => entry.id === "godot-4.7.1-character-sprite",
  );
  assert.ok(profile);
  assert.equal(profile.target, "godot-4.7.1");
  assert.equal(profile.textureFiltering, "nearest");
  assert.equal(profile.atlas.rotation, "forbidden");
  assert.equal(profile.atlas.trim, "alpha-aware");
  assert.ok(profile.sourceRetention.includes("individual lossless frames"));
  assert.ok(profile.sourceRetention.includes("pivots and baselines"));

  const contract = compileArtDirectionContract(request());
  assert.equal(contract.outputs[0].id, "godot-4.7.1-character-sprite");
  assert.equal(contract.outputs[0].target, "godot-4.7.1");
  assert.equal(contract.delivery.godot?.engineVersion, "4.7.1");
  assert.ok(
    contract.delivery.godot?.projectSettings.includes(
      "nearest texture filtering",
    ),
  );
  assert.ok(
    contract.qualityGates.some(
      (gate) =>
        gate.id === "output-profile:godot-4.7.1-character-sprite",
    ),
  );
  assert.equal(contract.asset.directionNames.join(","), "left,right");

  const job = compileArtDirectionJob(request());
  assert.deepEqual(job.request.outputProfileIds, [
    "godot-4.7.1-character-sprite",
    "web-game-raster",
  ]);
  assert.equal(job.executionMode, "deterministic-compile-only");
});

test("rejects a Godot 4.7.1 profile bound to another project version", () => {
  const value = request();
  value.project.engineVersion = "4.6.2";
  assert.throws(
    () => validateArtDirectionCompileRequest(value),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "ART_DIRECTION_GODOT_VERSION_MISMATCH",
  );
});

test("rejects mixed Godot engine output targets in one contract", () => {
  const value = request({
    outputProfileIds: [
      "godot-4.6.2-character-sprite",
      "godot-4.7.1-character-sprite",
    ],
  });
  assert.throws(
    () => validateArtDirectionCompileRequest(value),
    (error) =>
      error instanceof ArtDirectionError &&
      error.code === "ART_DIRECTION_GODOT_TARGET_MIXED",
  );
});
