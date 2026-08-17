import assert from "node:assert/strict";
import test from "node:test";

import {
  compileGameArtProductionProject,
  compileGameArtProductionWorkOrder,
} from "./index.mjs";

test("a classic VGA adventure project compiles rooms, actors, interface and cursor contracts", async () => {
  const project = await compileGameArtProductionProject("reference-classic-adventure-vga");
  const room = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "room",
    unitId: "archive-hall-night",
    subjectId: "archive-hall",
    productionGroup: "night",
    creativeIntent: "Original archive interior with a clear actor lane, readable stone archway and persistent verb-panel reservation.",
  });
  const actor = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "actor-cel",
    unitId: "mara-walk-east-003",
    subjectId: "mara-vale",
    productionGroup: "walk-east",
    tokens: { frameIndex: 3 },
    creativeIntent: "East-facing contact pose with planted foot, stable costume palette and readable native-size silhouette.",
  });
  const panel = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "verb-panel",
    unitId: "main-panel",
    subjectId: "obsidian-verb-panel",
    productionGroup: "main",
    creativeIntent: "Persistent lower interface frame with empty bitmap-text and sentence-line reservations.",
  });
  const cursor = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "cursor",
    unitId: "look-cursor",
    subjectId: "obsidian-verb-panel",
    productionGroup: "look",
    creativeIntent: "High-contrast original look cursor with a stable hotspot and strict binary alpha.",
  });

  assert.equal(project.gameType, "point-and-click-adventure");
  assert.equal(project.era, "dos-vga-1990s");
  assert.deepEqual(project.metadata.nativeCanvas, { width: 320, height: 200 });
  assert.equal(project.metadata.testLabCommit, "85cf19244454b1a98c94765fd0806827f661579d");

  assert.deepEqual(room.assetContract.nativeDimensions, { width: 320, height: 160 });
  assert.equal(room.assetContract.alpha, "opaque");
  assert.equal(room.output.working, "working/adventure/rooms/archive-hall/night/archive-hall-night.png");
  assert.match(room.providerPrompt, /composed for the final native grid/u);
  assert.match(room.providerPrompt, /persistent 40 pixel interface panel/u);

  assert.deepEqual(actor.assetContract.nativeDimensions, { width: 32, height: 64 });
  assert.deepEqual(actor.assetContract.pivot, { x: 16, y: 58 });
  assert.equal(actor.assetContract.groundLineY, 58);
  assert.equal(actor.assetContract.alpha, "transparent");
  assert.equal(actor.output.master, "masters/adventure/actors/mara-vale/walk-east/frame-003.png");
  assert.match(actor.providerPrompt, /binary alpha/u);
  assert.match(actor.providerPrompt, /test the actor at native size/u);

  assert.deepEqual(panel.assetContract.nativeDimensions, { width: 320, height: 40 });
  assert.match(panel.providerPrompt, /without rendered words/u);
  assert.deepEqual(cursor.assetContract.nativeDimensions, { width: 16, height: 16 });
  assert.match(cursor.providerPrompt, /zero hidden matte colour/u);

  for (const order of [room, actor, panel, cursor]) {
    assert.equal(order.candidatePolicy.candidateFanout, 1);
    assert.equal(order.candidatePolicy.providerFallbackAllowed, false);
    assert.equal(order.authority.automaticApproval, false);
    assert.equal(order.authority.targetRepositoryMutation, false);
  }
});
