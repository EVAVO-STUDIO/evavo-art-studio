import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileCampaignFile,
  verifyPlanSelfHash,
} from "./game-art-campaign/compiler.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const requestPath = path.join(
  repositoryRoot,
  "config",
  "game-art-campaign.heavy-metal-fighting.v1.json",
);

const EXPECTED_FAMILIES = new Map([
  ["title-and-shell", 42],
  ["pilot-portraits", 60],
  ["frame-construction", 40],
  ["frame-animation", 480],
  ["frame-damage-overlays", 16],
  ["universal-combat-fx", 115],
  ["frame-specific-fx", 160],
  ["arena-layers", 40],
  ["service-bay-crew-upgrades", 102],
  ["pilot-service-animation", 72],
  ["opening-intro", 30],
]);

const EXPECTED_FRAME_CELS = new Map([
  ["bastion", 120],
  ["viper", 120],
  ["citadel", 120],
  ["mirage", 120],
]);

function unitsForFamily(game, familyId) {
  return game.batches
    .filter((batch) => batch.familyId === familyId)
    .flatMap((batch) => batch.units);
}

test("HEAVY METAL FIGHTING compiles as the complete governed launch-four campaign", async () => {
  const plan = await compileCampaignFile(requestPath);
  assert.equal(verifyPlanSelfHash(plan), true);
  assert.equal(plan.campaignId, "heavy-metal-fighting-launch-four");
  assert.equal(plan.games.length, 1);
  assert.equal(plan.totals.games, 1);
  assert.equal(plan.totals.families, 11);
  assert.equal(plan.totals.images, 1157);
  assert.equal(plan.totals.batches, 119);
  assert.equal(plan.totals.fontFamilies, 1);

  const game = plan.games[0];
  assert.equal(game.id, "heavy-metal-fighting");
  assert.equal(game.title, "HEAVY METAL FIGHTING");
  assert.equal(game.totals.images, 1157);
  assert.equal(game.totals.batches, 119);
  assert.equal(game.families.length, EXPECTED_FAMILIES.size);

  for (const [familyId, expectedImages] of EXPECTED_FAMILIES) {
    const family = game.families.find((candidate) => candidate.id === familyId);
    assert.ok(family, `Missing campaign family ${familyId}`);
    assert.equal(family.images, expectedImages, `${familyId} image count drifted`);
    assert.equal(unitsForFamily(game, familyId).length, expectedImages, `${familyId} work-unit count drifted`);
  }

  assert.equal(plan.authority.planningOnly, true);
  for (const [name, value] of Object.entries(plan.authority)) {
    if (name !== "planningOnly") assert.equal(value, false, `${name} gained campaign authority`);
  }
  assert.ok(Object.values(plan.generationPolicy).every(Boolean), "Every campaign protection must remain enabled");
});

test("every launch Frame retains exactly 120 separate native sprite cels", async () => {
  const plan = await compileCampaignFile(requestPath);
  const game = plan.games[0];
  const units = unitsForFamily(game, "frame-animation");
  assert.equal(units.length, 480);

  for (const [subjectId, expectedCels] of EXPECTED_FRAME_CELS) {
    const subjectUnits = units.filter((unit) => unit.subjectId === subjectId);
    assert.equal(subjectUnits.length, expectedCels, `${subjectId} must retain ${expectedCels} authored cels`);
    assert.ok(subjectUnits.every((unit) => unit.kind === "animation-frame"));
    assert.ok(subjectUnits.every((unit) => unit.dimensions.width === 128 && unit.dimensions.height === 128));
    assert.ok(subjectUnits.every((unit) => unit.alpha === "transparent"));
    assert.ok(subjectUnits.every((unit) => unit.pivot?.x === 64 && unit.pivot?.y === 128));
    assert.equal(new Set(subjectUnits.map((unit) => unit.targetPath)).size, expectedCels);
  }

  const plannedUtility = units.filter((unit) => unit.clipId === "utility-v2-planned");
  assert.equal(plannedUtility.length, 48, "The non-authoritative atlas-v2 pose studies must remain 12 per Frame");
  for (const [subjectId] of EXPECTED_FRAME_CELS) {
    const subjectUtility = plannedUtility.filter((unit) => unit.subjectId === subjectId);
    assert.equal(subjectUtility.length, 12, `${subjectId} must retain 12 non-authoritative atlas-v2 pose studies`);
    assert.ok(subjectUtility.every((unit) => unit.framesInClip === 12));
    assert.deepEqual(
      subjectUtility.map((unit) => unit.frameIndex).sort((left, right) => left - right),
      Array.from({ length: 12 }, (_, index) => index),
      `${subjectId} atlas-v2 utility source indexes drifted`,
    );
  }
});

test("the intro, batching and one-image work-unit boundaries cannot collapse into generated sheets", async () => {
  const plan = await compileCampaignFile(requestPath);
  const game = plan.games[0];
  const introUnits = unitsForFamily(game, "opening-intro");
  assert.equal(introUnits.length, 30);
  assert.equal(new Set(introUnits.map((unit) => unit.frameNumber)).size, 30);
  assert.ok(introUnits.every((unit) => unit.kind === "animation-frame"));

  const allUnits = game.batches.flatMap((batch) => batch.units);
  assert.equal(allUnits.length, 1157);
  assert.equal(new Set(allUnits.map((unit) => unit.id)).size, 1157);
  assert.equal(new Set(allUnits.map((unit) => unit.targetPath)).size, 1157);
  assert.ok(game.batches.every((batch) => batch.capacity === 10));
  assert.ok(game.batches.every((batch) => batch.requiredImages === batch.units.length));
  assert.ok(game.batches.every((batch) => batch.requiredImages >= 1 && batch.requiredImages <= 10));
  assert.ok(game.batches.every((batch) => new Set(batch.units.map((unit) => unit.familyId)).size === 1));
  assert.ok(allUnits.every((unit) => unit.prompt.includes("Deliver only this one asset/frame as one separate image.")));
  assert.ok(allUnits.every((unit) => !/contact-sheet|sprite-sheet|storyboard-panel/i.test(unit.targetPath)));
});
