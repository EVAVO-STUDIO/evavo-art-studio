import assert from "node:assert/strict";
import { link, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  campaignSummary,
  compileCampaign,
  compileCampaignFile,
  getCampaignBatch,
  loadCampaignRequestFile,
  serializePlan,
  verifyPlanSelfHash,
} from "./game-art-campaign/compiler.mjs";
import { campaignMarkdown } from "./game-art-campaign/markdown.mjs";
import {
  BATCH_TOOL,
  SUMMARY_TOOL,
  WRITE_TOOL,
  callTool,
  policy,
  toolDefinitions,
} from "./game-art-campaign-planner-mcp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const REQUEST = path.join(ROOT, "config", "game-art-campaign.four-games.v1.json");
const PAYLOAD_PARTS = [
  "game-art-campaign.four-games.v1.payload.b64.part-001",
  "game-art-campaign.four-games.v1.payload.b64.part-002",
  "game-art-campaign.four-games.v1.payload.b64.part-003",
  "game-art-campaign.four-games.v1.payload.b64.part-004",
  "game-art-campaign.four-games.v1.payload.b64.part-005",
].map((name) => path.join(ROOT, "config", name));

async function requestObject() {
  return loadCampaignRequestFile(REQUEST);
}

async function copyCanonicalBundle(directory, wrapper) {
  const resolvedWrapper = wrapper ?? JSON.parse(await readFile(REQUEST, "utf8"));
  const requestPath = path.join(directory, "request.json");
  await writeFile(requestPath, JSON.stringify(resolvedWrapper));
  for (const sourcePath of PAYLOAD_PARTS) {
    await writeFile(path.join(directory, path.basename(sourcePath)), await readFile(sourcePath));
  }
  return requestPath;
}

const EXPECTED = Object.freeze({
  shell95: { images: 78, batches: 9, families: 4 },
  godz: { images: 1017, batches: 104, families: 8 },
  jonez: { images: 344, batches: 37, families: 9 },
  skyfury: { images: 408, batches: 44, families: 9 },
  pizza: { images: 1308, batches: 136, families: 11 },
});

test("canonical campaign compiles to the exact governed inventory", async () => {
  const plan = await compileCampaignFile(REQUEST);
  assert.deepEqual(plan.totals, {
    games: 5,
    families: 41,
    images: 3155,
    batches: 330,
    partialBatches: 28,
    unusedBatchSlots: 145,
    fontFamilies: 5,
  });
  assert.equal(plan.batchPolicy.size, 10);
  assert.equal(plan.batchPolicy.boundary, "family-locked");
  assert.equal(plan.batchPolicy.paddingGeneration, false);
  assert.equal(plan.fontPhase.startsAfterGameArtCampaign, true);
  assert.equal(plan.fontPhase.builds, 5);
  for (const game of plan.games) {
    assert.deepEqual(
      { images: game.totals.images, batches: game.totals.batches, families: game.totals.families },
      EXPECTED[game.id],
    );
  }
  assert.equal(verifyPlanSelfHash(plan), true);
});

test("every generation batch is ordered, family-locked, bounded and prompt-complete", async () => {
  const plan = await compileCampaignFile(REQUEST);
  const batches = plan.games.flatMap((game) => game.batches);
  assert.equal(batches.length, 330);
  assert.deepEqual(batches.map((batch) => batch.sequence), Array.from({ length: 330 }, (_, index) => index + 1));

  const unitIds = new Set();
  const targetPaths = new Set();
  for (const game of plan.games) {
    for (const family of game.families) {
      const familyBatches = game.batches.filter((batch) => batch.familyId === family.id);
      assert.equal(familyBatches.length, family.batches);
      assert.equal(familyBatches[0].id, family.firstBatchId);
      assert.equal(familyBatches.at(-1).id, family.lastBatchId);
      assert.ok(familyBatches.slice(0, -1).every((batch) => batch.requiredImages === 10));
      assert.equal(familyBatches.at(-1).partial, familyBatches.at(-1).requiredImages < 10);
    }

    for (const batch of game.batches) {
      assert.ok(batch.requiredImages >= 1 && batch.requiredImages <= 10);
      assert.equal(batch.requiredImages, batch.units.length);
      assert.equal(batch.capacity, 10);
      assert.equal(batch.partial, batch.requiredImages < batch.capacity);
      assert.match(batch.providerInstruction, /SEPARATE images/);
      assert.match(batch.providerInstruction, /Do not combine slots into a grid/);
      assert.ok(batch.units.every((unit) => unit.gameId === batch.gameId));
      assert.ok(batch.units.every((unit) => unit.familyId === batch.familyId));

      for (const unit of batch.units) {
        assert.equal(unitIds.has(unit.id), false, `duplicate unit ${unit.id}`);
        assert.equal(targetPaths.has(unit.targetPath), false, `duplicate target ${unit.targetPath}`);
        unitIds.add(unit.id);
        targetPaths.add(unit.targetPath);
        assert.match(unit.fileName, /^[a-z0-9_]+\.png$/);
        assert.ok(unit.targetPath.startsWith(game.outputRoot));
        assert.ok(["transparent", "opaque", "mixed"].includes(unit.alpha));
        assert.ok(Number.isInteger(unit.dimensions.width) && unit.dimensions.width > 0);
        assert.ok(Number.isInteger(unit.dimensions.height) && unit.dimensions.height > 0);
        assert.equal(unit.authoringCanvas.width % unit.dimensions.width, 0);
        assert.equal(unit.authoringCanvas.height % unit.dimensions.height, 0);
        assert.equal(
          unit.authoringCanvas.width / unit.dimensions.width,
          unit.authoringCanvas.height / unit.dimensions.height,
        );
        assert.match(unit.prompt, /ORIGINAL EVAVO GAME ART/);
        assert.match(unit.prompt, /Native runtime asset:/);
        assert.match(unit.prompt, /Deliver only this one asset\/frame as one separate image/);
        assert.match(unit.prompt, /Never make a grid, contact sheet, storyboard, labelled panel, or multi-frame sprite sheet/);
      }
    }
  }
  assert.equal(unitIds.size, 3155);
  assert.equal(targetPaths.size, 3155);
});

test("batch lookup returns the first exact GODZ ten-image job after Shell production", async () => {
  const plan = await compileCampaignFile(REQUEST);
  const batch = getCampaignBatch(plan, "godz", 1);
  assert.equal(batch.id, "godz.hero_base.batch-001");
  assert.equal(batch.sequence, 10);
  assert.equal(batch.requiredImages, 10);
  assert.equal(batch.units[0].id, "godz.hero_base.hero.east.idle.f001");
  assert.equal(batch.units[0].fileName, "godz__hero_base__hero__east__idle__f001.png");
  assert.deepEqual(batch.units[0].dimensions, { width: 32, height: 48 });
  assert.deepEqual(batch.units[0].authoringCanvas, { width: 512, height: 768 });
  assert.deepEqual(batch.units[0].pivot, { x: 16, y: 45 });
  assert.equal(batch.units[0].alpha, "transparent");
  assert.match(batch.units[0].prompt, /FRAME 1 OF 4/);
});

test("compilation and serialization are deterministic and self-hashed", async () => {
  const request = await requestObject();
  const left = compileCampaign(structuredClone(request));
  const right = compileCampaign(structuredClone(request));
  assert.equal(left.planSha256, right.planSha256);
  assert.equal(serializePlan(left), serializePlan(right));
  const mutated = JSON.parse(serializePlan(left));
  mutated.totals.images += 1;
  assert.throws(() => verifyPlanSelfHash(mutated), /does not match/);
});

test("Markdown summary preserves exact production totals and authority boundary", async () => {
  const plan = await compileCampaignFile(REQUEST);
  const markdown = campaignMarkdown(plan);
  assert.match(markdown, /\| \*\*Total\*\* \| \*\*41\*\* \| \*\*3155\*\* \| \*\*330\*\*/);
  assert.match(markdown, /EVAVO Shell 95/);
  assert.match(markdown, /GODZ/);
  assert.match(markdown, /PIZZA/);
  assert.match(markdown, /shared Shell 95 surface and all four game image campaigns complete/);
  assert.match(markdown, /does not call a provider/);
  assert.deepEqual(campaignSummary(plan).totals, plan.totals);
});

test("unsafe or incomplete campaign mutations fail closed", async () => {
  const baseline = await requestObject();

  const wrongBatch = structuredClone(baseline);
  wrongBatch.batchSize = 9;
  assert.throws(() => compileCampaign(wrongBatch), /must remain exactly 10/);

  const disabledGate = structuredClone(baseline);
  disabledGate.generationPolicy.humanApprovalRequired = false;
  assert.throws(() => compileCampaign(disabledGate), /protection must remain true/);

  const escapingRoot = structuredClone(baseline);
  escapingRoot.games[0].outputRoot = "../escape";
  assert.throws(() => compileCampaign(escapingRoot), /may not escape/);

  const smoothed = structuredClone(baseline);
  smoothed.games[0].technical.textureFiltering = "linear";
  assert.throws(() => compileCampaign(smoothed), /must remain nearest/);

  const nonIntegerScale = structuredClone(baseline);
  nonIntegerScale.games[0].families[1].authoringCanvas.width = 500;
  assert.throws(() => compileCampaign(nonIntegerScale), /integer multiple/);

  const duplicateTarget = structuredClone(baseline);
  duplicateTarget.games[0].families[1].items[1].id = duplicateTarget.games[0].families[1].items[0].id;
  assert.throws(() => compileCampaign(duplicateTarget), /duplicate value/);
});


test("bundled campaign input rejects path escape, payload tampering and hard-linked parts", async () => {
  const baseline = JSON.parse(await readFile(REQUEST, "utf8"));

  const escapeTemp = await mkdtemp(path.join(os.tmpdir(), "evavo-game-art-bundle-escape-"));
  const escapeWrapper = structuredClone(baseline);
  escapeWrapper.payloadParts[0].path = "../escape.payload.b64.part-001";
  const escapeRequest = path.join(escapeTemp, "request.json");
  await writeFile(escapeRequest, JSON.stringify(escapeWrapper));
  await assert.rejects(loadCampaignRequestFile(escapeRequest), /may not escape/);

  const tamperTemp = await mkdtemp(path.join(os.tmpdir(), "evavo-game-art-bundle-tamper-"));
  const tamperRequest = await copyCanonicalBundle(tamperTemp, { ...baseline, payloadSha256: "0".repeat(64) });
  await assert.rejects(loadCampaignRequestFile(tamperRequest), /payloadSha256 does not match/);

  const hardLinkTemp = await mkdtemp(path.join(os.tmpdir(), "evavo-game-art-bundle-hardlink-"));
  const hardLinkRequest = path.join(hardLinkTemp, "request.json");
  await writeFile(hardLinkRequest, JSON.stringify(baseline));
  const firstPartName = path.basename(PAYLOAD_PARTS[0]);
  const originalPart = path.join(hardLinkTemp, "payload-part-source.txt");
  await writeFile(originalPart, await readFile(PAYLOAD_PARTS[0]));
  await link(originalPart, path.join(hardLinkTemp, firstPartName));
  for (const sourcePath of PAYLOAD_PARTS.slice(1)) {
    await writeFile(path.join(hardLinkTemp, path.basename(sourcePath)), await readFile(sourcePath));
  }
  await assert.rejects(loadCampaignRequestFile(hardLinkRequest), /exactly one hard link/);
});

test("MCP is read-only by default and exposes exact batch retrieval", async () => {
  const current = policy({
    EVAVO_GAME_ART_CAMPAIGN_MODE: "read-only",
    EVAVO_GAME_ART_CAMPAIGN_ALLOWED_ROOTS: ROOT,
  });
  assert.deepEqual(toolDefinitions(current).map((tool) => tool.name), [SUMMARY_TOOL, BATCH_TOOL]);
  const summary = await callTool(SUMMARY_TOOL, { requestPath: REQUEST }, { policy: current });
  assert.equal(summary.totals.images, 3155);
  const batch = await callTool(BATCH_TOOL, { requestPath: REQUEST, gameId: "skyfury", batchNumber: 1 }, { policy: current });
  assert.equal(batch.id, "skyfury.player_aircraft.batch-001");
  await assert.rejects(
    callTool(WRITE_TOOL, { requestPath: REQUEST }, { policy: current }),
    /Unknown or prohibited/,
  );
});

test("MCP plan writes require the explicit gate and are create-only", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "evavo-game-art-campaign-"));
  const requestPath = path.join(temp, "request.json");
  const outputPath = path.join(temp, "plan.json");
  const markdownPath = path.join(temp, "plan.md");
  await copyCanonicalBundle(temp);
  const current = policy({
    EVAVO_GAME_ART_CAMPAIGN_MODE: "read-write",
    EVAVO_GAME_ART_CAMPAIGN_ALLOW_WRITES: "true",
    EVAVO_GAME_ART_CAMPAIGN_ALLOWED_ROOTS: temp,
  });
  assert.equal(toolDefinitions(current).some((tool) => tool.name === WRITE_TOOL), true);
  const result = await callTool(WRITE_TOOL, {
    requestPath,
    outputPath,
    markdownPath,
    confirmWrite: true,
  }, { policy: current });
  assert.equal(result.status, "passed");
  const writtenText = await readFile(outputPath, "utf8");
  const written = JSON.parse(writtenText);
  assert.equal(written.planSha256, result.planSha256);
  assert.equal(verifyPlanSelfHash(written), true);
  assert.equal(writtenText, serializePlan(written));
  const writtenMarkdown = await readFile(markdownPath, "utf8");
  assert.match(writtenMarkdown, /330/);
  assert.equal(writtenText.endsWith("\n"), true);
  assert.equal(writtenMarkdown.endsWith("\n"), true);
  await assert.rejects(
    callTool(WRITE_TOOL, { requestPath, outputPath, markdownPath, confirmWrite: true }, { policy: current }),
    /Create-only output already exists|EEXIST/,
  );
});
