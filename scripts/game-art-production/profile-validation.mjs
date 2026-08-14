import {
  ALPHA_MODES,
  AUTHORING_SCALE_POLICIES,
  GAME_ART_PRODUCTION_PROFILE_SCHEMA,
  GAME_ART_PRODUCTION_PROTOCOL_VERSION,
  array,
  assert,
  dimensions,
  freeze,
  id,
  integer,
  object,
  safeTemplate,
  sha256,
  string,
  uniqueStrings,
  validateAuthority,
  validateAuthoringScale,
} from "./common.mjs";

function validateLifecycle(input, label) {
  const states = array(input, label, 2).map((entry, index) => {
    const state = object(entry, `${label}[${index}]`);
    const outcomes = state.outcomes === undefined
      ? undefined
      : uniqueStrings(state.outcomes, `${label}[${index}].outcomes`, { identifiers: true });
    return freeze({
      id: id(state.id, `${label}[${index}].id`),
      rank: integer(state.rank, `${label}[${index}].rank`, 0, 100),
      implicit: state.implicit === true,
      requiresEvidence: state.requiresEvidence === true,
      requiresCandidate: state.requiresCandidate === true,
      requiresHuman: state.requiresHuman === true,
      outcomes,
      nextAction: id(state.nextAction, `${label}[${index}].nextAction`),
      terminal: state.terminal === true,
    });
  });
  assert(states.every((state, index) => state.rank === index), `${label} ranks must be gapless and ordered.`);
  assert(new Set(states.map((state) => state.id)).size === states.length, `${label} state ids must be unique.`);
  assert(states[0].implicit === true, `${label} must begin with one implicit state.`);
  assert(states.at(-1).terminal === true, `${label} must end with one terminal state.`);
  assert(states.slice(0, -1).every((state) => state.terminal === false), `${label} may contain only one terminal state.`);
  assert(states.filter((state) => state.requiresHuman).length >= 2, `${label} must retain at least two explicit human gates.`);
  return freeze(states);
}

function validateReviewPresets(input, label) {
  const presets = object(input, label);
  assert(Object.keys(presets).length >= 1, `${label} must contain at least one preset.`);
  const normalized = {};
  for (const [presetId, raw] of Object.entries(presets)) {
    id(presetId, `${label} key`);
    const preset = object(raw, `${label}.${presetId}`);
    assert(preset.humanRequired === true, `${label}.${presetId}.humanRequired must remain true.`);
    normalized[presetId] = freeze({
      humanRequired: true,
      modes: freeze(uniqueStrings(preset.modes, `${label}.${presetId}.modes`, { identifiers: true })),
      criteria: freeze(uniqueStrings(preset.criteria, `${label}.${presetId}.criteria`, { identifiers: true })),
    });
  }
  return freeze(normalized);
}

export function validateAssetType(assetTypeId, input, reviewPresets, defaults, label) {
  id(assetTypeId, `${label}.id`);
  const value = object(input, label);
  const nativeDimensions = dimensions(value.nativeDimensions, `${label}.nativeDimensions`);
  const authoringCanvas = dimensions(value.authoringCanvas, `${label}.authoringCanvas`);
  const authoringScalePolicy = id(value.authoringScalePolicy ?? defaults.authoringScalePolicy, `${label}.authoringScalePolicy`);
  assert(AUTHORING_SCALE_POLICIES.has(authoringScalePolicy), `${label}.authoringScalePolicy is unsupported.`);
  const authoringScale = validateAuthoringScale(nativeDimensions, authoringCanvas, authoringScalePolicy, `${label}.authoringCanvas`);
  const alpha = string(value.alpha, `${label}.alpha`, 1, 32);
  assert(ALPHA_MODES.has(alpha), `${label}.alpha must be transparent, opaque, or mixed.`);
  const reviewPreset = id(value.reviewPreset, `${label}.reviewPreset`);
  assert(reviewPresets[reviewPreset], `${label}.reviewPreset references unknown preset ${reviewPreset}.`);
  const pivot = value.pivot === undefined || value.pivot === null ? null : freeze({
    x: integer(value.pivot.x, `${label}.pivot.x`, 0, nativeDimensions.width),
    y: integer(value.pivot.y, `${label}.pivot.y`, 0, nativeDimensions.height),
  });
  const groundLineY = value.groundLineY === undefined || value.groundLineY === null
    ? null
    : integer(value.groundLineY, `${label}.groundLineY`, 0, nativeDimensions.height);
  return freeze({
    id: assetTypeId,
    kind: id(value.kind, `${label}.kind`),
    nativeDimensions,
    authoringCanvas,
    authoringScalePolicy,
    authoringScale,
    alpha,
    pivot,
    groundLineY,
    reviewPreset,
    pathTemplate: safeTemplate(value.pathTemplate, `${label}.pathTemplate`, "working"),
    masterPathTemplate: safeTemplate(value.masterPathTemplate, `${label}.masterPathTemplate`, "masters"),
    qaChecks: freeze(uniqueStrings(value.qaChecks, `${label}.qaChecks`, { identifiers: true })),
    failureCodes: freeze(uniqueStrings(value.failureCodes, `${label}.failureCodes`, { identifiers: true })),
    promptFragments: freeze(uniqueStrings(value.promptFragments, `${label}.promptFragments`)),
  });
}

function validateDefaults(input, label) {
  const value = object(input, label);
  return freeze({
    batchSize: integer(value.batchSize, `${label}.batchSize`, 1, 10),
    candidateFanout: integer(value.candidateFanout, `${label}.candidateFanout`, 1, 1),
    maximumRepairAttempts: integer(value.maximumRepairAttempts, `${label}.maximumRepairAttempts`, 1, 20),
    imageFormat: id(value.imageFormat, `${label}.imageFormat`),
    renderingModel: id(value.renderingModel, `${label}.renderingModel`),
    textureFiltering: id(value.textureFiltering, `${label}.textureFiltering`),
    authoringScalePolicy: id(value.authoringScalePolicy, `${label}.authoringScalePolicy`),
    oneAssetPerOutput: value.oneAssetPerOutput === true,
    providerFallbackAllowed: value.providerFallbackAllowed === true,
  });
}

export function validateGameArtProductionProfile(input) {
  const raw = object(input, "profile");
  assert(raw.schema === GAME_ART_PRODUCTION_PROFILE_SCHEMA, `profile.schema must equal ${GAME_ART_PRODUCTION_PROFILE_SCHEMA}.`);
  assert(raw.protocolVersion === GAME_ART_PRODUCTION_PROTOCOL_VERSION, "profile.protocolVersion drifted.");
  const profileId = id(raw.profileId, "profile.profileId");
  const defaults = validateDefaults(raw.defaults, "profile.defaults");
  assert(AUTHORING_SCALE_POLICIES.has(defaults.authoringScalePolicy), "profile defaults use an unsupported authoring scale policy.");
  assert(defaults.oneAssetPerOutput === true, "profile defaults must retain one asset per output.");
  assert(defaults.providerFallbackAllowed === false, "profile defaults must disable provider fallback.");
  const lifecycle = validateLifecycle(raw.lifecycle, "profile.lifecycle");
  const reviewPresets = validateReviewPresets(raw.reviewPresets, "profile.reviewPresets");
  const rawAssetTypes = object(raw.assetTypes, "profile.assetTypes");
  assert(Object.keys(rawAssetTypes).length >= 1, "profile.assetTypes must contain at least one type.");
  const assetTypes = Object.fromEntries(Object.entries(rawAssetTypes).map(([assetTypeId, value]) => [
    assetTypeId,
    validateAssetType(assetTypeId, value, reviewPresets, defaults, `profile.assetTypes.${assetTypeId}`),
  ]));
  const authority = validateAuthority(raw.authority, "profile.authority");
  const body = {
    schema: GAME_ART_PRODUCTION_PROFILE_SCHEMA,
    protocolVersion: GAME_ART_PRODUCTION_PROTOCOL_VERSION,
    profileId,
    label: string(raw.label, "profile.label", 2, 300),
    gameType: id(raw.gameType, "profile.gameType"),
    era: id(raw.era, "profile.era"),
    tags: freeze(uniqueStrings(raw.tags, "profile.tags", { identifiers: true })),
    defaults,
    lifecycle,
    reviewPresets,
    assetTypes: freeze(assetTypes),
    authority,
  };
  return freeze({ ...body, profileSha256: sha256(body) });
}
