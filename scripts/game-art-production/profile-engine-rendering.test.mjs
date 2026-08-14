import assert from "node:assert/strict";
import test from "node:test";

import {
  compileGameArtProductionProject,
  compileGameArtProductionWorkOrder,
  verifyGameArtProductionProfiles,
} from "./index.mjs";

test("rendering, filtering, format and authoring-scale policy are supplied by profiles rather than the generic engine", async () => {
  const verification = await verifyGameArtProductionProfiles();
  assert.equal(verification.status, "passed");
  assert.ok(verification.profileCount >= 3);
  assert.ok(verification.projectCount >= 3);
  assert.ok(verification.profiles.some((profile) => (
    profile.gameType === "3d-action"
      && profile.renderingModel === "high-definition-raster"
      && profile.textureFiltering === "linear"
      && profile.authoringScalePolicy === "uniform"
  )));
  assert.ok(verification.checks.every((entry) => entry.passed));
});

test("a high-definition 3D-action project compiles concepts, PBR texture maps and key art through the same engine", async () => {
  const project = await compileGameArtProductionProject("reference-3d-action");
  const character = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "hero-concept",
    unitId: "sentinel-base-concept",
    subjectId: "sentinel",
    productionGroup: "base",
    creativeIntent: "Front-facing production concept for the Sentinel with a readable combat role, coherent industrial armour construction and controlled material breakup.",
  });
  const texture = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "base-color-texture",
    unitId: "power-cell-painted-metal-base-color",
    subjectId: "power-cell",
    productionGroup: "painted-metal",
    creativeIntent: "Seamless painted-metal base-color texture for the governed power-cell prop with no baked lighting or normal information.",
  });
  const environment = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "environment-key-art",
    unitId: "refinery-combat-yard-key-art",
    subjectId: "refinery",
    productionGroup: "combat-yard",
    creativeIntent: "Widescreen refinery combat-yard key art with clear traversal, cover, encounter scale and practical industrial lighting.",
  });

  assert.equal(project.gameType, "3d-action");
  assert.equal(project.defaults.renderingModel, "high-definition-raster");
  assert.equal(project.defaults.textureFiltering, "linear");
  assert.equal(project.defaults.authoringScalePolicy, "uniform");

  assert.deepEqual(character.assetContract.nativeDimensions, { width: 2048, height: 2048 });
  assert.deepEqual(character.assetContract.authoringCanvas, { width: 4096, height: 4096 });
  assert.equal(character.assetContract.authoringScale.policy, "uniform");
  assert.equal(character.assetContract.authoringScale.x, 2);
  assert.equal(character.renderingContract.model, "high-definition-raster");
  assert.equal(character.renderingContract.textureFiltering, "linear");
  assert.match(character.providerPrompt, /rendering model high-definition-raster/i);
  assert.match(character.providerPrompt, /linear texture filtering/i);
  assert.doesNotMatch(character.providerPrompt, /nearest-neighbour|integer authoring scale/i);

  assert.equal(texture.assetContract.kind, "texture-map");
  assert.equal(texture.assetContract.alpha, "opaque");
  assert.equal(texture.assetContract.authoringScale.x, 1);
  assert.equal(texture.output.master, "masters/materials/power-cell/painted-metal/power-cell-painted-metal-base-color.png");

  assert.deepEqual(environment.assetContract.nativeDimensions, { width: 3840, height: 2160 });
  assert.equal(environment.output.working, "working/environments/refinery/key-art/combat-yard/refinery-combat-yard-key-art.png");
  assert.equal(environment.authority.targetRepositoryMutation, false);
});
