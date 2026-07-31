import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtDirectionError,
  compileArtDirectionContract,
  compileArtDirectionJob,
  validateArtDirectionCompileRequest,
} from "../dist/index.js";

function request() {
  return {
    schemaVersion: "1.0",
    contractId: "strict-input",
    presetId: "console-platformer-16bit",
    project: {
      projectId: "strict-demo",
      title: "Strict Demo",
      engine: "Godot",
      engineVersion: "4.6.2",
    },
    asset: {
      assetId: "hero-idle",
      family: "character",
      purpose: "Two-direction idle animation.",
      dimensions: { width: 48, height: 48 },
      transparency: "required",
      animated: true,
      frameCount: 4,
      directionCount: 2,
      directionNames: ["left", "right"],
    },
    outputProfileIds: ["godot-4.6.2-character-sprite"],
  };
}

function invalid(mutator) {
  const value = request();
  mutator(value);
  return value;
}

for (const [name, value] of [
  ["rendering mode", invalid((entry) => { entry.style = { renderingMode: "ai-magic" }; })],
  ["palette mode", invalid((entry) => { entry.style = { palette: { mode: "auto" } }; })],
  ["antialias policy", invalid((entry) => { entry.style = { pixelGrid: { antialias: "maybe" } }; })],
  ["camera mirroring", invalid((entry) => { entry.style = { camera: { mirroring: "sometimes" } }; })],
  ["lighting variation", invalid((entry) => { entry.style = { lighting: { frameVariation: "random" } }; })],
  ["asset transparency", invalid((entry) => { entry.asset.transparency = "fake-grid"; })],
  ["boolean field", invalid((entry) => { entry.asset.animated = "yes"; })],
]) {
  test(`rejects malformed ${name} before normalization`, () => {
    for (const operation of [
      () => validateArtDirectionCompileRequest(value),
      () => compileArtDirectionContract(value),
      () => compileArtDirectionJob(value),
    ]) {
      assert.throws(
        operation,
        (error) =>
          error instanceof ArtDirectionError &&
          error.code === "ART_DIRECTION_REQUEST_INVALID",
      );
    }
  });
}

test("strict preflight preserves a valid preset request", () => {
  const normalized = validateArtDirectionCompileRequest(request());
  const contract = compileArtDirectionContract(request());
  const job = compileArtDirectionJob(request());
  assert.equal(normalized.style.renderingMode, "pixel-art");
  assert.equal(contract.style.pixelGrid.enabled, true);
  assert.equal(job.runtimeJob.kind, "art.direction.compile");
});
