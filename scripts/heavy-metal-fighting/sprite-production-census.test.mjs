import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadSpriteProductionCensusFile,
  normalizeSpriteProductionCensus,
  spriteBankPlan,
  spriteProductionCensusSummary,
  verifySpriteProductionCensus,
} from "./sprite-production-census.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CENSUS_PATH = path.join(ROOT, "config", "heavy-metal-fighting", "sprite-production-census.v1.json");

async function load() {
  return loadSpriteProductionCensusFile(CENSUS_PATH);
}

test("production-master-v3 allocates exactly 224 unique body cels per Frame and 32 reserved slots", async () => {
  const census = await load();
  assert.match(census.censusSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(census.productionMasterV3.cell, { width: 160, height: 160 });
  assert.deepEqual(census.productionMasterV3.pivot, { x: 80, y: 152 });
  assert.equal(census.productionMasterV3.slotsPerFrame, 256);
  assert.equal(census.productionMasterV3.usedBodySlotsPerFrame, 224);
  assert.equal(census.productionMasterV3.reservedSlotsPerFrame, 32);
  assert.equal(census.productionMasterV3.launchBodyCels, 896);
  assert.equal(census.bodyCelBanks[0].start, 0);
  assert.equal(census.bodyCelBanks.at(-1).end, 223);
  assert.equal(census.bodyCelBanks.reduce((sum, bank) => sum + bank.count, 0), 224);
  assert.deepEqual(census.reservedSlots, {
    start: 224,
    end: 255,
    count: 32,
    policy: census.reservedSlots.policy,
  });
});

test("body-bank census preserves the intended classic-fighter balance of locomotion, reactions, moves and result states", async () => {
  const census = await load();
  const count = (...ids) => ids.reduce((sum, id) => sum + spriteBankPlan(census, id).bank.count, 0);
  assert.equal(count("ready","idle","walk-forward","walk-back","crouch-transition","crouch-hold","dash-forward","dash-back","jump-launch","jump-rise","jump-apex","jump-fall","landing"), 39);
  assert.equal(count("guard-standing","guard-crouching","block-high","block-low","instant-block","guard-crush","hit-light","hit-heavy","counter-stagger","air-hit","wall-impact","knockdown-fall","grounded-hold","wakeup"), 52);
  assert.equal(count("grab-whiff","throw-attacker","throw-receiver","throw-break"), 21);
  assert.equal(count("standing-light","standing-heavy","crouching-light","crouching-heavy","jumping-light","jumping-heavy"), 38);
  assert.equal(count("special-a","special-b","reversal","overdrive"), 42);
  assert.equal(count("system-down","reignition","heat-vent","entrance","victory","defeat"), 32);
});

test("Frame scale envelopes remain distinct and safe inside the 160x160 native cell", async () => {
  const census = await load();
  const frames = census.frameVisualEnvelopes;
  assert.ok(frames.citadel.neutralBodyHeightPx > frames.bastion.neutralBodyHeightPx);
  assert.ok(frames.bastion.neutralBodyHeightPx > frames.mirage.neutralBodyHeightPx);
  assert.ok(frames.mirage.neutralBodyHeightPx > frames.viper.neutralBodyHeightPx);
  assert.ok(frames.citadel.groundFootprintPx > frames.bastion.groundFootprintPx);
  assert.ok(frames.bastion.groundFootprintPx > frames.mirage.groundFootprintPx);
  assert.ok(frames.mirage.groundFootprintPx > frames.viper.groundFootprintPx);
  assert.ok(Object.values(frames).every((frame) => frame.maximumBodyWidthPx <= 152));
  assert.ok(Object.values(frames).every((frame) => frame.maximumBodyHeightPx <= 148));
  assert.equal(new Set(Object.values(frames).map((frame) => frame.motionCadence)).size, 4);
});

test("production-master inventory grows only the Frame-body family and keeps promotion gated until the game migrates", async () => {
  const census = await load();
  assert.equal(census.productionTotals.legacyCampaignSourceImages, 1157);
  assert.equal(census.productionTotals.legacyFrameBodyCels, 480);
  assert.equal(census.productionTotals.productionMasterFrameBodyCels, 896);
  assert.equal(census.productionTotals.additionalFrameBodyCels, 416);
  assert.equal(census.productionTotals.productionMasterSourceImages, 1573);
  assert.equal(census.productionMasterV3.migrationRequiredBeforeFinalPromotion, true);
  assert.match(census.productionMasterV3.generationGate, /final-body-cel-promotion-requires-game-atlas-v3-migration/);
  assert.equal(verifySpriteProductionCensus(census).status, "passed");
  assert.equal(spriteProductionCensusSummary(census).productionTotals.productionMasterSourceImages, 1573);
});

test("unsafe census mutations fail closed", async () => {
  const census = structuredClone(await load());
  delete census.censusSha256;

  const gap = structuredClone(census);
  gap.bodyCelBanks[1].start = 2;
  assert.throws(() => normalizeSpriteProductionCensus(gap), /must start at 1|end must equal/);

  const overflow = structuredClone(census);
  overflow.frameVisualEnvelopes.citadel.maximumBodyWidthPx = 153;
  assert.throws(() => normalizeSpriteProductionCensus(overflow), /violates transparent safety/);

  const prematureAuthority = structuredClone(census);
  prematureAuthority.productionMasterV3.status = "implemented";
  assert.throws(() => normalizeSpriteProductionCensus(prematureAuthority), /must remain explicitly non-authoritative/);

  const badTotal = structuredClone(census);
  badTotal.productionTotals.productionMasterSourceImages = 1572;
  assert.throws(() => normalizeSpriteProductionCensus(badTotal), /source-image total is inconsistent|must remain 1573/);
});
