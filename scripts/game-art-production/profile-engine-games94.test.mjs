import assert from "node:assert/strict";
import test from "node:test";

import {
  compileGameArtProductionProject,
  compileGameArtProductionWorkOrder,
} from "./index.mjs";

test("Games '94 compiles Jax, atlas, environment and UI contracts through the generic engine", async () => {
  const project = await compileGameArtProductionProject("games94");
  const cel = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "athlete-cel",
    unitId: "jax-ready-000",
    subjectId: "jax-mercer",
    productionGroup: "ready",
    tokens: { frameIndex: 0 },
    creativeIntent: "Jax Mercer balanced ready stance on the approved double-kick skateboard with exact Games '94 model proportions and native-size silhouette.",
  });
  const atlas = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "athlete-atlas",
    unitId: "halfpipe-heat",
    subjectId: "jax-mercer",
    productionGroup: "halfpipe-heat",
    creativeIntent: "Assemble the exact reviewed Jax Halfpipe cels into the governed 8 by 8 runtime atlas while preserving reserved transparency and frame order.",
  });
  const environment = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "environment",
    unitId: "sunset-concrete-distance",
    subjectId: "halfpipe-heat",
    productionGroup: "distance",
    creativeIntent: "Separate distant palms, coastline and low-rise silhouettes for Sunset Concrete with no baked sky, crowd, athlete, board or gameplay surface.",
  });
  const ui = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "ui",
    unitId: "square-button",
    subjectId: "games94-ui",
    productionGroup: "controls",
    creativeIntent: "One restrained 1994 DOS sports-game square button frame with empty bitmap-text/icon space and no generated lettering.",
  });

  assert.equal(project.title, "GAMES '94");
  assert.equal(project.gameType, "multi-event-sports-arcade");
  assert.equal(project.era, "dos-vga-1994");
  assert.equal(project.targetRepository, "EVAVO-STUDIO/california-games");
  assert.deepEqual(project.metadata.logicalCanvas, { width: 640, height: 360 });
  assert.deepEqual(project.metadata.firstVerticalSlice.atlas.feetPivot, { x: 32, y: 58 });
  assert.deepEqual(project.metadata.firstVerticalSlice.atlas.reservedCells, [3,4,5,6,7]);

  assert.deepEqual(cel.assetContract.nativeDimensions, { width: 64, height: 64 });
  assert.deepEqual(cel.assetContract.pivot, { x: 32, y: 58 });
  assert.equal(cel.assetContract.groundLineY, 58);
  assert.equal(cel.output.working, "working/games94/athletes/jax-mercer/ready/frame-000.png");
  assert.match(cel.providerPrompt, /64 by 64 Games '94 athlete cel/u);
  assert.match(cel.providerPrompt, /binary transparency/u);

  assert.deepEqual(atlas.assetContract.nativeDimensions, { width: 512, height: 512 });
  assert.match(atlas.providerPrompt, /reserved cells as fully transparent/u);
  assert.equal(atlas.output.master, "masters/games94/atlases/jax-mercer/halfpipe-heat/halfpipe-heat.png");

  assert.deepEqual(environment.assetContract.nativeDimensions, { width: 640, height: 360 });
  assert.match(environment.providerPrompt, /separate 640 by 360 Games '94 environment depth layer/u);
  assert.equal(environment.output.working, "working/games94/events/halfpipe-heat/environment/distance/sunset-concrete-distance.png");

  assert.deepEqual(ui.assetContract.nativeDimensions, { width: 256, height: 256 });
  assert.match(ui.providerPrompt, /without rendered text/u);

  for (const order of [cel, atlas, environment, ui]) {
    assert.equal(order.candidatePolicy.candidateFanout, 1);
    assert.equal(order.candidatePolicy.providerFallbackAllowed, false);
    assert.equal(order.authority.automaticApproval, false);
    assert.equal(order.authority.targetRepositoryMutation, false);
    assert.equal(order.authority.gitMutation, false);
    assert.equal(order.authority.publication, false);
  }
});
