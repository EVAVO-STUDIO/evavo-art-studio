import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

export const SPRITE_CENSUS_SCHEMA = "evavo.heavy-metal-fighting-sprite-production-census.v1";
export const SPRITE_CENSUS_PROTOCOL_VERSION = "2026-08-12.1";

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_SPRITE_CENSUS_INVALID: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

function sha256(value) {
  return createHash("sha256").update(`${JSON.stringify(sortObject(value), null, 2)}\n`).digest("hex");
}

function positiveInteger(value, label) {
  assert(Number.isInteger(value) && value > 0, `${label} must be a positive integer.`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer.`);
  return value;
}

function nonEmptyString(value, label) {
  assert(typeof value === "string" && value.trim(), `${label} must be a non-empty string.`);
  return value.trim();
}

function point(value, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return deepFreeze({
    x: nonNegativeInteger(value.x, `${label}.x`),
    y: nonNegativeInteger(value.y, `${label}.y`),
  });
}

function size(value, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return deepFreeze({
    width: positiveInteger(value.width, `${label}.width`),
    height: positiveInteger(value.height, `${label}.height`),
  });
}

function normalizeBank(bank, index) {
  assert(bank && typeof bank === "object" && !Array.isArray(bank), `bodyCelBanks[${index}] must be an object.`);
  const start = nonNegativeInteger(bank.start, `bodyCelBanks[${index}].start`);
  const count = positiveInteger(bank.count, `bodyCelBanks[${index}].count`);
  const end = nonNegativeInteger(bank.end, `bodyCelBanks[${index}].end`);
  assert(end === start + count - 1, `bodyCelBanks[${index}] end must equal start + count - 1.`);
  return deepFreeze({
    id: nonEmptyString(bank.id, `bodyCelBanks[${index}].id`),
    start,
    count,
    end,
    purpose: nonEmptyString(bank.purpose, `bodyCelBanks[${index}].purpose`),
  });
}

function normalizeFrameEnvelope(value, frameId, master) {
  assert(value && typeof value === "object" && !Array.isArray(value), `frameVisualEnvelopes.${frameId} must be an object.`);
  const normalized = {
    neutralBodyHeightPx: positiveInteger(value.neutralBodyHeightPx, `${frameId}.neutralBodyHeightPx`),
    neutralBodyWidthPx: positiveInteger(value.neutralBodyWidthPx, `${frameId}.neutralBodyWidthPx`),
    maximumBodyHeightPx: positiveInteger(value.maximumBodyHeightPx, `${frameId}.maximumBodyHeightPx`),
    maximumBodyWidthPx: positiveInteger(value.maximumBodyWidthPx, `${frameId}.maximumBodyWidthPx`),
    groundFootprintPx: positiveInteger(value.groundFootprintPx, `${frameId}.groundFootprintPx`),
    motionCadence: nonEmptyString(value.motionCadence, `${frameId}.motionCadence`),
    screenRead: nonEmptyString(value.screenRead, `${frameId}.screenRead`),
  };
  assert(normalized.neutralBodyHeightPx <= normalized.maximumBodyHeightPx, `${frameId} neutral height exceeds maximum height.`);
  assert(normalized.neutralBodyWidthPx <= normalized.maximumBodyWidthPx, `${frameId} neutral width exceeds maximum width.`);
  assert(normalized.maximumBodyWidthPx <= master.cell.width - (master.minimumTransparentSafetyPx * 2), `${frameId} maximum body width violates transparent safety.`);
  assert(normalized.maximumBodyHeightPx <= master.groundLineY - master.minimumTransparentSafetyPx, `${frameId} maximum body height violates top/ground safety.`);
  assert(normalized.groundFootprintPx < normalized.maximumBodyWidthPx, `${frameId} ground footprint must be narrower than maximum body width.`);
  return deepFreeze(normalized);
}

function validateSupportingDimensions(value) {
  assert(value && typeof value === "object" && !Array.isArray(value), "supportingNativeDimensions must be an object.");
  const required = [
    "pilotPortraitMaster", "pilotHudPortrait", "pilotOverdriveCutIn", "pilotServiceStanding",
    "pilotCockpitCel", "frameConstructionMaster", "frameHeroCard", "frameDamageOverlay",
    "universalFxSmall", "universalFxMedium", "frameSpecificFx", "arenaLayer", "introCel",
    "titleAndMenuComposition",
  ];
  for (const key of required) assert(value[key], `supportingNativeDimensions.${key} is required.`);
  for (const [key, entry] of Object.entries(value)) {
    if (entry.width !== undefined || entry.height !== undefined) size(entry, `supportingNativeDimensions.${key}`);
  }
  return deepFreeze(structuredClone(value));
}

export function normalizeSpriteProductionCensus(input) {
  assert(input && typeof input === "object" && !Array.isArray(input), "census must be an object.");
  assert(input.schema === SPRITE_CENSUS_SCHEMA, `schema must equal ${SPRITE_CENSUS_SCHEMA}.`);
  assert(input.protocolVersion === SPRITE_CENSUS_PROTOCOL_VERSION, `protocolVersion must equal ${SPRITE_CENSUS_PROTOCOL_VERSION}.`);

  const project = input.project;
  assert(project && typeof project === "object", "project is required.");
  const compatibility = input.compatibilityAtlas;
  const master = input.productionMasterV3;
  const totals = input.productionTotals;
  assert(compatibility && master && totals, "compatibilityAtlas, productionMasterV3 and productionTotals are required.");

  const normalizedMaster = {
    status: nonEmptyString(master.status, "productionMasterV3.status"),
    migrationRequiredBeforeFinalPromotion: master.migrationRequiredBeforeFinalPromotion === true,
    cell: size(master.cell, "productionMasterV3.cell"),
    pivot: point(master.pivot, "productionMasterV3.pivot"),
    groundLineY: positiveInteger(master.groundLineY, "productionMasterV3.groundLineY"),
    minimumTransparentSafetyPx: positiveInteger(master.minimumTransparentSafetyPx, "productionMasterV3.minimumTransparentSafetyPx"),
    columns: positiveInteger(master.columns, "productionMasterV3.columns"),
    rows: positiveInteger(master.rows, "productionMasterV3.rows"),
    slotsPerFrame: positiveInteger(master.slotsPerFrame, "productionMasterV3.slotsPerFrame"),
    usedBodySlotsPerFrame: positiveInteger(master.usedBodySlotsPerFrame, "productionMasterV3.usedBodySlotsPerFrame"),
    reservedSlotsPerFrame: positiveInteger(master.reservedSlotsPerFrame, "productionMasterV3.reservedSlotsPerFrame"),
    atlas: size(master.atlas, "productionMasterV3.atlas"),
    launchFrames: positiveInteger(master.launchFrames, "productionMasterV3.launchFrames"),
    launchBodyCels: positiveInteger(master.launchBodyCels, "productionMasterV3.launchBodyCels"),
    generationGate: nonEmptyString(master.generationGate, "productionMasterV3.generationGate"),
    reason: nonEmptyString(master.reason, "productionMasterV3.reason"),
  };
  assert(normalizedMaster.status === "planned-production-target-not-yet-game-authoritative", "productionMasterV3 must remain explicitly non-authoritative until the game migrates.");
  assert(normalizedMaster.migrationRequiredBeforeFinalPromotion, "productionMasterV3 migration gate must remain enabled.");
  assert(normalizedMaster.pivot.y === normalizedMaster.groundLineY, "pivot.y must equal groundLineY.");
  assert(normalizedMaster.atlas.width === normalizedMaster.cell.width * normalizedMaster.columns, "production atlas width is inconsistent.");
  assert(normalizedMaster.atlas.height === normalizedMaster.cell.height * normalizedMaster.rows, "production atlas height is inconsistent.");
  assert(normalizedMaster.slotsPerFrame === normalizedMaster.columns * normalizedMaster.rows, "production atlas slot count is inconsistent.");
  assert(normalizedMaster.usedBodySlotsPerFrame + normalizedMaster.reservedSlotsPerFrame === normalizedMaster.slotsPerFrame, "used and reserved slots must fill the production atlas exactly.");
  assert(normalizedMaster.launchBodyCels === normalizedMaster.usedBodySlotsPerFrame * normalizedMaster.launchFrames, "launchBodyCels must equal used body cels per Frame × launch Frames.");

  const banks = input.bodyCelBanks.map(normalizeBank);
  assert(banks.length > 0, "bodyCelBanks must not be empty.");
  const ids = new Set();
  let cursor = 0;
  for (const bank of banks) {
    assert(!ids.has(bank.id), `duplicate body bank id ${bank.id}.`);
    ids.add(bank.id);
    assert(bank.start === cursor, `body bank ${bank.id} must start at ${cursor}, observed ${bank.start}.`);
    cursor = bank.end + 1;
  }
  assert(cursor === normalizedMaster.usedBodySlotsPerFrame, `body banks must cover exactly 0-${normalizedMaster.usedBodySlotsPerFrame - 1}.`);

  const reserved = input.reservedSlots;
  assert(reserved && typeof reserved === "object", "reservedSlots is required.");
  assert(reserved.start === normalizedMaster.usedBodySlotsPerFrame, "reservedSlots.start must follow the used body banks.");
  assert(reserved.end === normalizedMaster.slotsPerFrame - 1, "reservedSlots.end must equal final atlas slot.");
  assert(reserved.count === normalizedMaster.reservedSlotsPerFrame, "reservedSlots.count must match productionMasterV3.reservedSlotsPerFrame.");

  const frameIds = ["bastion", "viper", "citadel", "mirage"];
  const frameVisualEnvelopes = Object.fromEntries(frameIds.map((frameId) => [frameId, normalizeFrameEnvelope(input.frameVisualEnvelopes?.[frameId], frameId, normalizedMaster)]));
  assert(new Set(Object.values(frameVisualEnvelopes).map((entry) => entry.motionCadence)).size === 4, "every launch Frame must retain a distinct motion cadence profile.");

  const normalizedTotals = {
    legacyCampaignSourceImages: positiveInteger(totals.legacyCampaignSourceImages, "productionTotals.legacyCampaignSourceImages"),
    legacyFrameBodyCels: positiveInteger(totals.legacyFrameBodyCels, "productionTotals.legacyFrameBodyCels"),
    productionMasterFrameBodyCels: positiveInteger(totals.productionMasterFrameBodyCels, "productionTotals.productionMasterFrameBodyCels"),
    additionalFrameBodyCels: positiveInteger(totals.additionalFrameBodyCels, "productionTotals.additionalFrameBodyCels"),
    productionMasterSourceImages: positiveInteger(totals.productionMasterSourceImages, "productionTotals.productionMasterSourceImages"),
  };
  assert(normalizedTotals.productionMasterFrameBodyCels === normalizedMaster.launchBodyCels, "production master body-cel total must match the atlas plan.");
  assert(normalizedTotals.additionalFrameBodyCels === normalizedTotals.productionMasterFrameBodyCels - normalizedTotals.legacyFrameBodyCels, "additional body-cel total is inconsistent.");
  assert(normalizedTotals.productionMasterSourceImages === normalizedTotals.legacyCampaignSourceImages - normalizedTotals.legacyFrameBodyCels + normalizedTotals.productionMasterFrameBodyCels, "production-master source-image total is inconsistent.");

  const normalized = {
    schema: SPRITE_CENSUS_SCHEMA,
    protocolVersion: SPRITE_CENSUS_PROTOCOL_VERSION,
    project: deepFreeze({
      id: nonEmptyString(project.id, "project.id"),
      publicTitle: nonEmptyString(project.publicTitle, "project.publicTitle"),
      technicalRepositoryId: nonEmptyString(project.technicalRepositoryId, "project.technicalRepositoryId"),
      logicalCanvas: size(project.logicalCanvas, "project.logicalCanvas"),
      authoringCanvas: size(project.authoringCanvas, "project.authoringCanvas"),
      pixelMasterMethod: nonEmptyString(project.pixelMasterMethod, "project.pixelMasterMethod"),
      finalFiltering: nonEmptyString(project.finalFiltering, "project.finalFiltering"),
    }),
    compatibilityAtlas: deepFreeze(structuredClone(compatibility)),
    productionMasterV3: deepFreeze(normalizedMaster),
    productionTotals: deepFreeze(normalizedTotals),
    bodyCelBanks: deepFreeze(banks),
    reservedSlots: deepFreeze(structuredClone(reserved)),
    frameVisualEnvelopes: deepFreeze(frameVisualEnvelopes),
    recommendedHoldLanguage: deepFreeze(structuredClone(input.recommendedHoldLanguage)),
    supportingNativeDimensions: validateSupportingDimensions(input.supportingNativeDimensions),
    productionRules: deepFreeze([...input.productionRules].map((rule, index) => nonEmptyString(rule, `productionRules[${index}]`))),
  };
  assert(normalized.project.id === "heavy-metal-fighting", "project.id must remain heavy-metal-fighting.");
  assert(normalized.project.logicalCanvas.width === 640 && normalized.project.logicalCanvas.height === 360, "logical canvas must remain 640x360.");
  assert(normalized.productionMasterV3.cell.width === 160 && normalized.productionMasterV3.cell.height === 160, "production-master native body cell must remain 160x160.");
  assert(normalized.productionMasterV3.slotsPerFrame === 256, "production-master atlas must remain 256 slots per Frame.");
  assert(normalized.productionMasterV3.usedBodySlotsPerFrame === 224, "production-master body census must remain 224 cels per Frame.");
  assert(normalized.productionTotals.productionMasterSourceImages === 1573, "production-master source inventory must remain 1573 images.");
  return deepFreeze({ ...normalized, censusSha256: sha256(normalized) });
}

async function readStableJson(filePath) {
  const before = await lstat(filePath);
  assert(before.isFile() && !before.isSymbolicLink(), "sprite census path must be a regular file.");
  const bytes = await readFile(filePath);
  const after = await lstat(filePath);
  assert(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, "sprite census changed while it was being read.");
  return JSON.parse(bytes.toString("utf8"));
}

export async function loadSpriteProductionCensusFile(filePath) {
  return normalizeSpriteProductionCensus(await readStableJson(filePath));
}

export function spriteProductionCensusSummary(census) {
  return deepFreeze({
    schema: "evavo.heavy-metal-fighting-sprite-production-census-summary.v1",
    project: census.project,
    censusSha256: census.censusSha256,
    compatibilityAtlas: census.compatibilityAtlas,
    productionMasterV3: census.productionMasterV3,
    productionTotals: census.productionTotals,
    frameVisualEnvelopes: census.frameVisualEnvelopes,
    bankCount: census.bodyCelBanks.length,
    banks: census.bodyCelBanks,
    supportingNativeDimensions: census.supportingNativeDimensions,
    productionRules: census.productionRules,
  });
}

export function spriteBankPlan(census, bankId) {
  const normalized = String(bankId ?? "").trim().toLowerCase();
  const bank = census.bodyCelBanks.find((candidate) => candidate.id === normalized);
  assert(bank, `unknown sprite bank ${bankId}; expected one of ${census.bodyCelBanks.map((candidate) => candidate.id).join(", ")}.`);
  return deepFreeze({
    schema: "evavo.heavy-metal-fighting-sprite-bank-plan.v1",
    projectId: census.project.id,
    censusSha256: census.censusSha256,
    bank,
    nativeCell: census.productionMasterV3.cell,
    pivot: census.productionMasterV3.pivot,
    minimumTransparentSafetyPx: census.productionMasterV3.minimumTransparentSafetyPx,
    finalPromotionBlockedUntilGameAtlasV3: census.productionMasterV3.migrationRequiredBeforeFinalPromotion,
    productionRules: census.productionRules,
  });
}

export function verifySpriteProductionCensus(census) {
  const checks = [
    ["native-cell-160", census.productionMasterV3.cell.width === 160 && census.productionMasterV3.cell.height === 160],
    ["atlas-256-slots", census.productionMasterV3.slotsPerFrame === 256],
    ["body-224-per-frame", census.productionMasterV3.usedBodySlotsPerFrame === 224],
    ["body-896-launch", census.productionMasterV3.launchBodyCels === 896],
    ["reserved-32", census.productionMasterV3.reservedSlotsPerFrame === 32],
    ["atlas-2560-square", census.productionMasterV3.atlas.width === 2560 && census.productionMasterV3.atlas.height === 2560],
    ["all-banks-contiguous", census.bodyCelBanks.at(-1)?.end === 223],
    ["all-frame-envelopes-safe", Object.values(census.frameVisualEnvelopes).every((frame) => frame.maximumBodyWidthPx <= 152 && frame.maximumBodyHeightPx <= 148)],
    ["distinct-cadence-profiles", new Set(Object.values(census.frameVisualEnvelopes).map((frame) => frame.motionCadence)).size === 4],
    ["production-total-1573", census.productionTotals.productionMasterSourceImages === 1573],
    ["migration-gate-enabled", census.productionMasterV3.migrationRequiredBeforeFinalPromotion === true],
  ].map(([id, passed]) => deepFreeze({ id, passed }));
  const failed = checks.filter((check) => !check.passed);
  return deepFreeze({
    schema: "evavo.heavy-metal-fighting-sprite-production-census-verification.v1",
    status: failed.length ? "failed" : "passed",
    censusSha256: census.censusSha256,
    checks: deepFreeze(checks),
    failed: deepFreeze(failed),
  });
}
