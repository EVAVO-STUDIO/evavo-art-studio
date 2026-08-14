import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  compileGameArtProductionProject,
  compileGameArtProductionWorkOrder,
  verifyGameArtProductionProfiles,
} from "./index.mjs";
import { heavyMetalFightingProductionWorkOrder } from "../heavy-metal-fighting/work-orders.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("profile discovery resolves multiple game types without hardcoding project identity into the engine", async () => {
  const verification = await verifyGameArtProductionProfiles();
  assert.equal(verification.status, "passed");
  assert.ok(verification.profileCount >= 2);
  assert.ok(verification.projectCount >= 2);
  assert.ok(verification.profiles.some((entry) => entry.gameType === "arcade-fighter"));
  assert.ok(verification.profiles.some((entry) => entry.gameType === "platformer"));
  assert.ok(verification.checks.every((entry) => entry.passed));

  const sourceFiles = ["common.mjs", "profile-validation.mjs", "project-resolution.mjs", "runtime.mjs"];
  const source = (await Promise.all(sourceFiles.map((name) => readFile(path.join(HERE, name), "utf8")))).join("\n");
  assert.doesNotMatch(source, /heavy-metal-fighting|bastion|viper|citadel|mirage|steel-dominion/iu);
});

test("the 1990s arcade-fighter profile reproduces the current HMF body-cel production contract through data", async () => {
  const project = await compileGameArtProductionProject("heavy-metal-fighting");
  const order = await compileGameArtProductionWorkOrder({
    resolvedProject: project,
    assetTypeId: "frame-body-cel",
    unitId: "hmf.frame-animation.bastion.slot-121",
    subjectId: "bastion",
    productionGroup: "normals",
    tokens: { bodySlot: 121 },
    creativeIntent: "Standing heavy hero-impact body cel with the governed Frame identity, readable contact pose and effects remaining separate.",
    referenceBindings: {
      construction: "working/frames/bastion/construction",
      previousCel: "working/frames/bastion/sprites/normals/slot-120.png",
      nextCel: "working/frames/bastion/sprites/normals/slot-122.png",
    },
  });
  const legacy = await heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121");

  assert.equal(project.profileId, "arcade-fighter-1990s");
  assert.equal(project.gameType, "arcade-fighter");
  assert.deepEqual(order.assetContract.nativeDimensions, { width: 160, height: 160 });
  assert.deepEqual(order.assetContract.authoringCanvas, { width: 640, height: 640 });
  assert.deepEqual(order.assetContract.pivot, { x: 80, y: 152 });
  assert.equal(order.assetContract.groundLineY, 152);
  assert.equal(order.assetContract.alpha, "transparent");
  assert.equal(order.output.working, "working/frames/bastion/sprites/normals/slot-121.png");
  assert.equal(order.output.master, "masters/frames/bastion/sprites/normals/slot-121.png");
  assert.equal(order.candidatePolicy.candidateFanout, 1);
  assert.equal(order.authority.targetRepositoryMutation, false);
  assert.match(order.providerPrompt, /1990s arcade fighter/i);

  assert.deepEqual(order.assetContract.nativeDimensions, legacy.assetContract.nativeDimensions);
  assert.deepEqual(order.assetContract.authoringCanvas, legacy.assetContract.authoringCanvas);
  assert.deepEqual(order.assetContract.pivot, legacy.assetContract.pivot);
  assert.equal(order.assetContract.groundLineY, legacy.assetContract.groundLineY);
  assert.equal(order.assetContract.alpha, legacy.assetContract.alpha);
  assert.equal(order.candidatePolicy.candidateFanout, legacy.candidatePolicy.candidateFanout);
});
