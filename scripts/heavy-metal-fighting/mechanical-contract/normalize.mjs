import {
  MECHANICAL_CONTRACT_PROTOCOL_VERSION,
  MECHANICAL_CONTRACT_SCHEMA,
  REQUIRED_FRAME_IDS,
  asArray,
  asInteger,
  asObject,
  asString,
  asTrue,
  assert,
  deepFreeze,
  normalizePoint,
  normalizeStringArray,
  sha256,
  unique,
} from "./common.mjs";
import { normalizeFrame } from "./frame.mjs";
import { normalizeClipBindings, normalizeStyleProof } from "./topology.mjs";

export function normalizeMechanicalContract(input) {
  const contract = asObject(input, "contract");
  assert(contract.schema === MECHANICAL_CONTRACT_SCHEMA, `contract.schema must equal ${MECHANICAL_CONTRACT_SCHEMA}.`);
  assert(contract.protocolVersion === MECHANICAL_CONTRACT_PROTOCOL_VERSION, `contract.protocolVersion must equal ${MECHANICAL_CONTRACT_PROTOCOL_VERSION}.`);
  const project = asObject(contract.project, "project");
  const logicalCanvas = asObject(project.logicalCanvas, "project.logicalCanvas");
  const nativeCell = asObject(project.nativeCell, "project.nativeCell");
  const authority = asObject(contract.authority, "authority");
  const inventory = asObject(contract.inventory, "inventory");
  const atlas = asObject(contract.atlas, "atlas");
  const plannedAtlasV2 = asObject(contract.plannedAtlasV2, "plannedAtlasV2");
  const phaseGrammar = asObject(contract.phaseGrammar, "phaseGrammar");
  const requiredLandmarkIds = normalizeStringArray(contract.requiredLandmarkIds, "requiredLandmarkIds", 10);
  const normalizedFrames = asArray(contract.frames, "frames", REQUIRED_FRAME_IDS.length)
    .map((frame, index) => normalizeFrame(frame, index, requiredLandmarkIds));
  unique(normalizedFrames.map((frame) => frame.id), "frame ids");
  assert(normalizedFrames.length === REQUIRED_FRAME_IDS.length, `frames must contain exactly ${REQUIRED_FRAME_IDS.length} launch Frames.`);
  assert([...normalizedFrames.map((frame) => frame.id)].sort().join("|") === [...REQUIRED_FRAME_IDS].sort().join("|"), `frames must contain exactly ${REQUIRED_FRAME_IDS.join(", ")}.`);
  unique(normalizedFrames.map((frame) => frame.pilot.id), "pilot ids");
  unique(normalizedFrames.map((frame) => frame.motionIdentity), "motion identities");

  const normalizedAtlas = deepFreeze({
    status: asString(atlas.status, "atlas.status"),
    width: asInteger(atlas.width, "atlas.width", 1),
    height: asInteger(atlas.height, "atlas.height", 1),
    cellWidth: asInteger(atlas.cellWidth, "atlas.cellWidth", 1),
    cellHeight: asInteger(atlas.cellHeight, "atlas.cellHeight", 1),
    columns: asInteger(atlas.columns, "atlas.columns", 1),
    rows: asInteger(atlas.rows, "atlas.rows", 1),
    slots: asInteger(atlas.slots, "atlas.slots", 1),
    origin: normalizePoint(atlas.origin, "atlas.origin"),
    sharedBoundarySlots: deepFreeze(unique(
      asArray(atlas.sharedBoundarySlots, "atlas.sharedBoundarySlots", 1)
        .map((slot, index) => asInteger(slot, `atlas.sharedBoundarySlots[${index}]`)),
      "atlas.sharedBoundarySlots",
    )),
    victorySlot: asInteger(atlas.victorySlot, "atlas.victorySlot"),
    defeatSlot: asInteger(atlas.defeatSlot, "atlas.defeatSlot"),
    facingPolicy: asString(atlas.facingPolicy, "atlas.facingPolicy"),
    sourceOfTruth: asString(atlas.sourceOfTruth, "atlas.sourceOfTruth"),
  });
  assert(normalizedAtlas.width === normalizedAtlas.cellWidth * normalizedAtlas.columns, "atlas width must equal cellWidth × columns.");
  assert(normalizedAtlas.height === normalizedAtlas.cellHeight * normalizedAtlas.rows, "atlas height must equal cellHeight × rows.");
  assert(normalizedAtlas.slots === normalizedAtlas.columns * normalizedAtlas.rows, "atlas slots must equal columns × rows.");
  assert(normalizedAtlas.victorySlot < normalizedAtlas.slots && normalizedAtlas.defeatSlot < normalizedAtlas.slots, "victory and defeat slots must fit inside the atlas.");
  assert(normalizedAtlas.sharedBoundarySlots.every((slot) => slot < normalizedAtlas.slots), "shared boundary slots must fit inside the atlas.");

  const utilitySlots = asObject(plannedAtlasV2.utilitySlots, "plannedAtlasV2.utilitySlots");
  const normalizedUtilitySlots = Object.fromEntries(Object.entries(utilitySlots).map(([slot, semantic]) => {
    const index = Number(slot);
    assert(Number.isInteger(index) && index >= 0 && index < normalizedAtlas.slots, `plannedAtlasV2 utility slot ${slot} is invalid.`);
    return [String(index), asString(semantic, `plannedAtlasV2.utilitySlots.${slot}`)];
  }));
  unique(Object.values(normalizedUtilitySlots), "plannedAtlasV2 utility semantics");

  const normalizedClipBindings = normalizeClipBindings(contract.clipBindings, normalizedAtlas, normalizedUtilitySlots);

  const normalizedPhaseGrammar = deepFreeze({
    bankFrameCount: asInteger(phaseGrammar.bankFrameCount, "phaseGrammar.bankFrameCount", 1),
    startupFrameIndexes: deepFreeze(unique(asArray(phaseGrammar.startupFrameIndexes, "phaseGrammar.startupFrameIndexes", 1).map((entry, index) => asInteger(entry, `phaseGrammar.startupFrameIndexes[${index}]`)), "phaseGrammar.startupFrameIndexes")),
    activeFrameIndexes: deepFreeze(unique(asArray(phaseGrammar.activeFrameIndexes, "phaseGrammar.activeFrameIndexes", 1).map((entry, index) => asInteger(entry, `phaseGrammar.activeFrameIndexes[${index}]`)), "phaseGrammar.activeFrameIndexes")),
    heroImpactFrameIndex: asInteger(phaseGrammar.heroImpactFrameIndex, "phaseGrammar.heroImpactFrameIndex"),
    recoveryFrameIndexes: deepFreeze(unique(asArray(phaseGrammar.recoveryFrameIndexes, "phaseGrammar.recoveryFrameIndexes", 1).map((entry, index) => asInteger(entry, `phaseGrammar.recoveryFrameIndexes[${index}]`)), "phaseGrammar.recoveryFrameIndexes")),
    rule: asString(phaseGrammar.rule, "phaseGrammar.rule"),
  });
  const phaseIndexes = [
    ...normalizedPhaseGrammar.startupFrameIndexes,
    ...normalizedPhaseGrammar.activeFrameIndexes,
    ...normalizedPhaseGrammar.recoveryFrameIndexes,
  ];
  assert(new Set(phaseIndexes).size === normalizedPhaseGrammar.bankFrameCount, "phase grammar must cover every bank frame exactly once.");
  assert(phaseIndexes.every((index) => index >= 0 && index < normalizedPhaseGrammar.bankFrameCount), "phase grammar indexes must fit inside the bank.");
  assert(normalizedPhaseGrammar.activeFrameIndexes.includes(normalizedPhaseGrammar.heroImpactFrameIndex), "hero impact must be an active frame.");

  const normalizedInventory = deepFreeze({
    families: asInteger(inventory.families, "inventory.families", 1),
    sourceImages: asInteger(inventory.sourceImages, "inventory.sourceImages", 1),
    batches: asInteger(inventory.batches, "inventory.batches", 1),
    frameAnimationImages: asInteger(inventory.frameAnimationImages, "inventory.frameAnimationImages", 1),
    frameAnimationImagesPerFrame: asInteger(inventory.frameAnimationImagesPerFrame, "inventory.frameAnimationImagesPerFrame", 1),
    openingIntroImages: asInteger(inventory.openingIntroImages, "inventory.openingIntroImages", 1),
  });
  assert(normalizedInventory.frameAnimationImages === normalizedInventory.frameAnimationImagesPerFrame * normalizedFrames.length, "frame animation inventory must equal per-Frame cells × Frame count.");
  assert(normalizedInventory.frameAnimationImagesPerFrame === normalizedAtlas.slots, "per-Frame animation inventory must equal atlas slot count.");

  const protectedAuthority = [
    "gameRepositoryOwnsCombatTiming",
    "gameRepositoryOwnsHitboxesAndDamage",
    "gameRepositoryOwnsRuntimeSlotManifest",
    "artStudioOwnsCandidateProductionAndReview",
    "automaticPromotionForbidden",
    "namedHumanApprovalRequired",
    "targetRepositoryMutationForbidden",
    "gitMutationForbidden",
  ];
  for (const key of protectedAuthority) asTrue(authority[key], `authority.${key}`);
  assert(authority.providerMayDefineCanon === false, "authority.providerMayDefineCanon must remain false.");
  assert(authority.providerMayGeneratePackedRuntimeAtlas === false, "authority.providerMayGeneratePackedRuntimeAtlas must remain false.");

  const normalized = {
    schema: MECHANICAL_CONTRACT_SCHEMA,
    protocolVersion: MECHANICAL_CONTRACT_PROTOCOL_VERSION,
    project: deepFreeze({
      id: asString(project.id, "project.id"),
      publicTitle: asString(project.publicTitle, "project.publicTitle"),
      subtitle: asString(project.subtitle, "project.subtitle"),
      technicalRepositoryId: asString(project.technicalRepositoryId, "project.technicalRepositoryId"),
      logicalCanvas: deepFreeze({
        width: asInteger(logicalCanvas.width, "project.logicalCanvas.width", 1),
        height: asInteger(logicalCanvas.height, "project.logicalCanvas.height", 1),
      }),
      nativeCell: deepFreeze({
        width: asInteger(nativeCell.width, "project.nativeCell.width", 1),
        height: asInteger(nativeCell.height, "project.nativeCell.height", 1),
      }),
      origin: normalizePoint(project.origin, "project.origin"),
      authoredFacing: asString(project.authoredFacing, "project.authoredFacing"),
      runtimeMirror: asTrue(project.runtimeMirror, "project.runtimeMirror"),
      stylePreset: asString(project.stylePreset, "project.stylePreset"),
    }),
    authority: deepFreeze({
      gameRepositoryOwnsCombatTiming: true,
      gameRepositoryOwnsHitboxesAndDamage: true,
      gameRepositoryOwnsRuntimeSlotManifest: true,
      artStudioOwnsCandidateProductionAndReview: true,
      providerMayDefineCanon: false,
      providerMayGeneratePackedRuntimeAtlas: false,
      automaticPromotionForbidden: true,
      namedHumanApprovalRequired: true,
      targetRepositoryMutationForbidden: true,
      gitMutationForbidden: true,
    }),
    inventory: normalizedInventory,
    atlas: normalizedAtlas,
    plannedAtlasV2: deepFreeze({
      status: asString(plannedAtlasV2.status, "plannedAtlasV2.status"),
      requiresGameRepositoryMigration: asTrue(plannedAtlasV2.requiresGameRepositoryMigration, "plannedAtlasV2.requiresGameRepositoryMigration"),
      utilitySlots: deepFreeze(normalizedUtilitySlots),
    }),
    phaseGrammar: normalizedPhaseGrammar,
    clipBindings: normalizedClipBindings,
    requiredLandmarkIds,
    universalReviewGates: normalizeStringArray(contract.universalReviewGates, "universalReviewGates", 10),
    frames: deepFreeze(normalizedFrames),
    styleProof: normalizeStyleProof(contract.styleProof, normalizedAtlas.slots, normalizedClipBindings),
  };
  assert(normalized.project.nativeCell.width === normalized.atlas.cellWidth && normalized.project.nativeCell.height === normalized.atlas.cellHeight, "project native cell must match atlas cells.");
  assert(normalized.project.origin.x === normalized.atlas.origin.x && normalized.project.origin.y === normalized.atlas.origin.y, "project origin must match atlas origin.");
  assert(normalized.styleProof.frameId === "bastion" && normalized.styleProof.pilotId === "branka-kovac", "the first style proof must remain Branka and Bastion.");
  assert(normalized.plannedAtlasV2.status === "planned-not-authoritative", "atlas v2 must remain planned-not-authoritative until the game repository migrates.");

  const contractSha256 = sha256(normalized);
  return deepFreeze({ ...normalized, contractSha256 });
}

