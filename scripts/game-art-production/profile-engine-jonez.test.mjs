import assert from "node:assert/strict";
import test from "node:test";

import {
  compileGameArtProductionProject,
  compileGameArtProductionWorkOrder,
} from "./index.mjs";

test("the reusable isometric life-sim profile resolves JONEZ without project conditionals", async () => {
  const project = await compileGameArtProductionProject("jonez");
  assert.equal(project.profileId, "isometric-life-sim-1990s");
  assert.equal(project.gameType, "isometric-life-sim");
  assert.equal(project.targetRepository, "EVAVO-STUDIO/GodotGameFoundationKit");
  assert.equal(project.metadata.cameraFamily, "isometric-life-sim-90s");
  assert.equal(project.metadata.projection, "dimetric");
  assert.equal(project.metadata.yawDegrees, 45);
  assert.equal(project.metadata.pitchDegrees, 30);
  assert.deepEqual(project.metadata.facingDirections, ["se", "sw", "nw", "ne"]);

  const ground = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "ground-base",
    unitId: "jonez.market.ground-base",
    subjectId: "market",
    productionGroup: "district-base",
    creativeIntent: "Isolated market district ground base with paving, road, grass and canal surfaces only.",
  });
  assert.equal(ground.assetTypeId, "district-ground-layer");
  assert.deepEqual(ground.assetContract.nativeDimensions, { width: 320, height: 200 });
  assert.equal(
    ground.output.working,
    "working/jonez/districts/market/layers/district-base/jonez.market.ground-base.png",
  );
  assert.match(ground.providerPrompt, /fixed dimetric camera/i);
  assert.match(ground.providerPrompt, /exactly one separate asset/i);

  const player = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "player-animation-frame",
    unitId: "jonez.player.walk-se.f001",
    subjectId: "player",
    productionGroup: "walk-se",
    creativeIntent: "South-east walk contact frame with the approved player identity, pivot and ground contact preserved.",
    referenceBindings: {
      identityMaster: "working/jonez/characters/player/identity/idle-se-f001.png",
      previousFrame: "working/jonez/characters/player/walk-se/jonez.player.walk-se.f000.png",
    },
  });
  assert.equal(player.assetTypeId, "player-frame");
  assert.deepEqual(player.assetContract.nativeDimensions, { width: 24, height: 36 });
  assert.deepEqual(player.assetContract.pivot, { x: 12, y: 33 });
  assert.equal(player.assetContract.groundLineY, 33);
  assert.match(player.providerPrompt, /stable identity and clothing masses/i);
  assert.equal(player.candidatePolicy.maximumRepairAttempts, 4);
  assert.equal(player.authority.providerExecution, false);
  assert.equal(player.authority.automaticApproval, false);
  assert.equal(player.authority.targetRepositoryMutation, false);
});
