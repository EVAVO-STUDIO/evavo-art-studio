import assert from "node:assert/strict";
import test from "node:test";

import {
  compileGameArtProductionProject,
  compileGameArtProductionWorkOrder,
} from "./index.mjs";

test("a platformer project compiles different sprite, tile and background contracts through the same engine", async () => {
  const project = await compileGameArtProductionProject("reference-pixel-platformer");
  const character = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "hero-cel",
    unitId: "hero-run-003",
    subjectId: "hero",
    productionGroup: "run",
    tokens: { frameIndex: 3 },
    creativeIntent: "Forward run contact cel with a stable hero silhouette and clear planted foot.",
  });
  const tile = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "world-tile",
    unitId: "forest-ground-edge-a",
    subjectId: "forest",
    productionGroup: "ground",
    creativeIntent: "Single grass-to-soil edge tile for the governed adjacency set.",
  });
  const background = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "background-layer",
    unitId: "forest-far-canopy",
    subjectId: "forest",
    productionGroup: "far",
    creativeIntent: "Far canopy parallax layer with quiet values behind the player character.",
  });

  assert.equal(project.gameType, "platformer");
  assert.deepEqual(character.assetContract.nativeDimensions, { width: 32, height: 32 });
  assert.equal(character.output.working, "working/actors/hero/run/frame-003.png");
  assert.deepEqual(tile.assetContract.nativeDimensions, { width: 16, height: 16 });
  assert.equal(tile.assetContract.alpha, "opaque");
  assert.equal(tile.output.working, "working/worlds/forest/tiles/ground/forest-ground-edge-a.png");
  assert.deepEqual(background.assetContract.nativeDimensions, { width: 320, height: 180 });
  assert.equal(background.output.master, "masters/worlds/forest/backgrounds/far/forest-far-canopy.png");
});
