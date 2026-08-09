import path from "node:path";

import {
  asArray,
  asInteger,
  asObject,
  asString,
  assert,
  freeze,
  optionalString,
  slug,
  unique,
} from "./common.mjs";

export const REQUEST_SCHEMA = "evavo.game-art-campaign-request.v1";
export const PLAN_SCHEMA = "evavo.game-art-campaign-plan.v1";
export const BUNDLE_SCHEMA = "evavo.game-art-campaign-bundle.v1";
export const PROTOCOL_VERSION = "2026-08-09.1";
export const REQUIRED_BATCH_SIZE = 10;

const ALPHA_MODES = new Set(["transparent", "opaque", "mixed"]);
const FAMILY_KINDS = new Set(["sequence", "catalogue"]);
const PHASES = new Set(["vertical-slice", "primary-production", "content-breadth", "polish"]);
const LOOP_MODES = new Set(["none", "linear", "ping-pong", "hold"]);

function dimensions(value, label) {
  const input = asObject(value, label);
  return freeze({
    width: asInteger(input.width, `${label}.width`, { minimum: 1, maximum: 4096 }),
    height: asInteger(input.height, `${label}.height`, { minimum: 1, maximum: 4096 }),
  });
}

function alphaMode(value, label) {
  const result = asString(value, label);
  assert(ALPHA_MODES.has(result), `${label} must be transparent, opaque, or mixed.`);
  return result;
}

function phase(value, label) {
  const result = asString(value, label);
  assert(PHASES.has(result), `${label} has unsupported production phase ${result}.`);
  return result;
}

function loopMode(value, label) {
  const result = asString(value, label);
  assert(LOOP_MODES.has(result), `${label} has unsupported loop mode ${result}.`);
  return result;
}

function relativePosixPath(value, label) {
  const result = asString(value, label, { maximum: 1000 });
  assert(!result.includes("\\"), `${label} must use POSIX forward slashes.`);
  assert(!path.posix.isAbsolute(result), `${label} must be repository-relative.`);
  const normalized = path.posix.normalize(result);
  assert(normalized === result && normalized !== "." && !normalized.startsWith("../"), `${label} must be canonical and may not escape its root.`);
  return result;
}

export function validateIntegerAuthoringScale(nativeDimensions, authoringCanvas, label) {
  assert(authoringCanvas.width >= nativeDimensions.width && authoringCanvas.height >= nativeDimensions.height, `${label} must be at least as large as the native asset.`);
  assert(authoringCanvas.width % nativeDimensions.width === 0, `${label}.width must be an integer multiple of native width.`);
  assert(authoringCanvas.height % nativeDimensions.height === 0, `${label}.height must be an integer multiple of native height.`);
  const scaleX = authoringCanvas.width / nativeDimensions.width;
  const scaleY = authoringCanvas.height / nativeDimensions.height;
  assert(scaleX === scaleY, `${label} must use one uniform integer authoring scale.`);
  return scaleX;
}

function normalizeStyle(input, label) {
  const value = asObject(input, label);
  return freeze({
    lock: asString(value.lock, `${label}.lock`, { maximum: 8000 }),
    continuity: asString(value.continuity, `${label}.continuity`, { maximum: 4000 }),
    negatives: unique(asArray(value.negatives, `${label}.negatives`, { minimum: 1 }).map((item, index) =>
      asString(item, `${label}.negatives[${index}]`, { maximum: 500 })), `${label}.negatives`),
    originality: asString(value.originality, `${label}.originality`, { maximum: 2000 }),
  });
}

function normalizeTechnical(input, label) {
  const value = asObject(input, label);
  const result = freeze({
    nativeCanvas: dimensions(value.nativeCanvas, `${label}.nativeCanvas`),
    runtimeCanvas: dimensions(value.runtimeCanvas, `${label}.runtimeCanvas`),
    presentationCanvas: dimensions(value.presentationCanvas, `${label}.presentationCanvas`),
    textureFiltering: asString(value.textureFiltering, `${label}.textureFiltering`),
    integerScaleOnly: value.integerScaleOnly === true,
    pixelSnapRequired: value.pixelSnapRequired === true,
    authoringScale: asInteger(value.authoringScale, `${label}.authoringScale`, { minimum: 1, maximum: 64 }),
  });
  assert(result.textureFiltering === "nearest", `${label}.textureFiltering must remain nearest.`);
  assert(result.integerScaleOnly, `${label}.integerScaleOnly must remain true.`);
  assert(result.pixelSnapRequired, `${label}.pixelSnapRequired must remain true.`);
  return result;
}

function normalizeSubject(input, label) {
  const value = asObject(input, label);
  return freeze({
    id: slug(value.id, `${label}.id`),
    label: asString(value.label, `${label}.label`, { maximum: 300 }),
    prompt: asString(value.prompt, `${label}.prompt`, { maximum: 2500 }),
    continuityKey: optionalString(value.continuityKey, `${label}.continuityKey`, { maximum: 200 }),
  });
}

function normalizeClip(input, label, poseLibraries) {
  const value = asObject(input, label);
  const frames = asInteger(value.frames, `${label}.frames`, { minimum: 1, maximum: 256 });
  const explicitPoses = value.poses === undefined ? undefined : asArray(value.poses, `${label}.poses`, { minimum: frames })
    .map((item, index) => asString(item, `${label}.poses[${index}]`, { maximum: 800 }));
  const poseLibrary = optionalString(value.poseLibrary, `${label}.poseLibrary`, { maximum: 200 });
  assert(Boolean(explicitPoses) !== Boolean(poseLibrary), `${label} must define exactly one of poses or poseLibrary.`);
  const poses = explicitPoses ?? poseLibraries[poseLibrary];
  assert(Array.isArray(poses), `${label}.poseLibrary references missing library ${poseLibrary}.`);
  assert(poses.length === frames, `${label} requires exactly ${frames} pose descriptions; observed ${poses.length}.`);
  const directions = value.directions === undefined ? undefined : unique(
    asArray(value.directions, `${label}.directions`, { minimum: 1 }).map((item, index) => slug(item, `${label}.directions[${index}]`)),
    `${label}.directions`,
  );
  return freeze({
    id: slug(value.id, `${label}.id`),
    label: asString(value.label, `${label}.label`, { maximum: 200 }),
    frames,
    fps: asInteger(value.fps, `${label}.fps`, { minimum: 1, maximum: 60 }),
    loop: loopMode(value.loop, `${label}.loop`),
    directions,
    poses: [...poses],
    prompt: asString(value.prompt, `${label}.prompt`, { maximum: 1500 }),
  });
}

function normalizeCatalogueItem(input, label) {
  const value = asObject(input, label);
  const variants = value.variants === undefined
    ? [freeze({ id: "base", label: "base", prompt: "canonical required production asset" })]
    : asArray(value.variants, `${label}.variants`, { minimum: 1 }).map((variant, index) => {
      if (typeof variant === "string") {
        return freeze({ id: slug(variant, `${label}.variants[${index}]`), label: variant, prompt: variant });
      }
      const item = asObject(variant, `${label}.variants[${index}]`);
      return freeze({
        id: slug(item.id, `${label}.variants[${index}].id`),
        label: asString(item.label, `${label}.variants[${index}].label`, { maximum: 300 }),
        prompt: asString(item.prompt, `${label}.variants[${index}].prompt`, { maximum: 1500 }),
      });
    });
  unique(variants.map((variant) => variant.id), `${label}.variants ids`);
  const itemDimensions = value.dimensions ? dimensions(value.dimensions, `${label}.dimensions`) : undefined;
  const itemAuthoringCanvas = value.authoringCanvas ? dimensions(value.authoringCanvas, `${label}.authoringCanvas`) : undefined;
  if (itemAuthoringCanvas) assert(itemDimensions, `${label}.authoringCanvas requires item-specific dimensions.`);
  if (itemDimensions && itemAuthoringCanvas) validateIntegerAuthoringScale(itemDimensions, itemAuthoringCanvas, `${label}.authoringCanvas`);
  return freeze({
    id: slug(value.id, `${label}.id`),
    label: asString(value.label, `${label}.label`, { maximum: 300 }),
    prompt: asString(value.prompt, `${label}.prompt`, { maximum: 2500 }),
    variants,
    dimensions: itemDimensions,
    authoringCanvas: itemAuthoringCanvas,
    alpha: value.alpha ? alphaMode(value.alpha, `${label}.alpha`) : undefined,
  });
}

function normalizeFamily(input, label, poseLibraries) {
  const value = asObject(input, label);
  const kind = asString(value.kind, `${label}.kind`);
  assert(FAMILY_KINDS.has(kind), `${label}.kind must be sequence or catalogue.`);
  const familyDimensions = dimensions(value.dimensions, `${label}.dimensions`);
  const familyAuthoringCanvas = dimensions(value.authoringCanvas, `${label}.authoringCanvas`);
  validateIntegerAuthoringScale(familyDimensions, familyAuthoringCanvas, `${label}.authoringCanvas`);
  const shared = {
    id: slug(value.id, `${label}.id`),
    label: asString(value.label, `${label}.label`, { maximum: 300 }),
    kind,
    phase: phase(value.phase, `${label}.phase`),
    priority: asInteger(value.priority, `${label}.priority`, { minimum: 1, maximum: 9999 }),
    dimensions: familyDimensions,
    authoringCanvas: familyAuthoringCanvas,
    alpha: alphaMode(value.alpha, `${label}.alpha`),
    runtimeRoot: relativePosixPath(value.runtimeRoot, `${label}.runtimeRoot`),
    prompt: asString(value.prompt, `${label}.prompt`, { maximum: 3500 }),
    continuity: asString(value.continuity, `${label}.continuity`, { maximum: 2500 }),
    reviewPreset: asString(value.reviewPreset, `${label}.reviewPreset`, { maximum: 300 }),
    pivot: value.pivot ? freeze({
      x: asInteger(value.pivot.x, `${label}.pivot.x`, { minimum: 0, maximum: familyDimensions.width }),
      y: asInteger(value.pivot.y, `${label}.pivot.y`, { minimum: 0, maximum: familyDimensions.height }),
    }) : undefined,
    ySortOrigin: value.ySortOrigin ? freeze({
      x: asInteger(value.ySortOrigin.x, `${label}.ySortOrigin.x`, { minimum: 0, maximum: familyDimensions.width }),
      y: asInteger(value.ySortOrigin.y, `${label}.ySortOrigin.y`, { minimum: 0, maximum: familyDimensions.height }),
    }) : undefined,
  };
  if (kind === "sequence") {
    const directions = unique(asArray(value.directions, `${label}.directions`, { minimum: 1 })
      .map((item, index) => slug(item, `${label}.directions[${index}]`)), `${label}.directions`);
    const subjects = asArray(value.subjects, `${label}.subjects`, { minimum: 1 })
      .map((item, index) => normalizeSubject(item, `${label}.subjects[${index}]`));
    const clips = asArray(value.clips, `${label}.clips`, { minimum: 1 })
      .map((item, index) => normalizeClip(item, `${label}.clips[${index}]`, poseLibraries));
    unique(subjects.map((item) => item.id), `${label}.subject ids`);
    unique(clips.map((item) => item.id), `${label}.clip ids`);
    return freeze({ ...shared, directions, subjects, clips });
  }
  const items = asArray(value.items, `${label}.items`, { minimum: 1 })
    .map((item, index) => normalizeCatalogueItem(item, `${label}.items[${index}]`));
  unique(items.map((item) => item.id), `${label}.item ids`);
  return freeze({ ...shared, items });
}

function normalizeFontFamily(input, label) {
  const value = asObject(input, label);
  return freeze({
    id: slug(value.id, `${label}.id`),
    displayName: asString(value.displayName, `${label}.displayName`, { maximum: 300 }),
    buildOrder: asInteger(value.buildOrder, `${label}.buildOrder`, { minimum: 1, maximum: 100 }),
    requestPath: asString(value.requestPath, `${label}.requestPath`, { maximum: 1000 }),
    faces: unique(asArray(value.faces, `${label}.faces`, { minimum: 1 }).map((item, index) => slug(item, `${label}.faces[${index}]`)), `${label}.faces`),
    review: asString(value.review, `${label}.review`, { maximum: 1500 }),
  });
}

export function normalizeCampaignRequest(input) {
  const request = asObject(input, "request");
  assert(request.schema === REQUEST_SCHEMA, `request.schema must equal ${REQUEST_SCHEMA}.`);
  const batchSize = asInteger(request.batchSize, "request.batchSize", { minimum: 1, maximum: 10 });
  assert(batchSize === REQUIRED_BATCH_SIZE, `request.batchSize must remain exactly ${REQUIRED_BATCH_SIZE}.`);
  assert(request.lastBatchPolicy === "allow-partial-no-padding", "request.lastBatchPolicy must be allow-partial-no-padding.");
  const poseLibraryInput = asObject(request.poseLibraries, "request.poseLibraries");
  const poseLibraries = Object.fromEntries(Object.entries(poseLibraryInput).map(([key, poses]) => [
    slug(key, `request.poseLibraries.${key}`),
    asArray(poses, `request.poseLibraries.${key}`, { minimum: 1 }).map((item, index) =>
      asString(item, `request.poseLibraries.${key}[${index}]`, { maximum: 800 })),
  ]));
  const games = asArray(request.games, "request.games", { minimum: 1 }).map((gameInput, gameIndex) => {
    const game = asObject(gameInput, `request.games[${gameIndex}]`);
    const families = asArray(game.families, `request.games[${gameIndex}].families`, { minimum: 1 })
      .map((family, familyIndex) => normalizeFamily(family, `request.games[${gameIndex}].families[${familyIndex}]`, poseLibraries))
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
    unique(families.map((item) => item.id), `request.games[${gameIndex}].family ids`);
    return freeze({
      id: slug(game.id, `request.games[${gameIndex}].id`),
      title: asString(game.title, `request.games[${gameIndex}].title`, { maximum: 300 }),
      productionOrder: asInteger(game.productionOrder, `request.games[${gameIndex}].productionOrder`, { minimum: 1, maximum: 100 }),
      technical: normalizeTechnical(game.technical, `request.games[${gameIndex}].technical`),
      style: normalizeStyle(game.style, `request.games[${gameIndex}].style`),
      outputRoot: relativePosixPath(game.outputRoot, `request.games[${gameIndex}].outputRoot`),
      families,
      expected: game.expected ? freeze({
        images: asInteger(game.expected.images, `request.games[${gameIndex}].expected.images`, { minimum: 1 }),
        batches: asInteger(game.expected.batches, `request.games[${gameIndex}].expected.batches`, { minimum: 1 }),
      }) : undefined,
    });
  }).sort((left, right) => left.productionOrder - right.productionOrder || left.id.localeCompare(right.id));
  unique(games.map((game) => game.id), "request game ids");
  unique(games.map((game) => game.productionOrder), "request game productionOrder values");
  const fontFamilies = asArray(request.fontFamilies, "request.fontFamilies", { minimum: 1 })
    .map((font, index) => normalizeFontFamily(font, `request.fontFamilies[${index}]`))
    .sort((left, right) => left.buildOrder - right.buildOrder || left.id.localeCompare(right.id));
  unique(fontFamilies.map((font) => font.id), "request font family ids");
  unique(fontFamilies.map((font) => font.buildOrder), "request font family buildOrder values");
  return freeze({
    schema: REQUEST_SCHEMA,
    campaignId: slug(request.campaignId, "request.campaignId"),
    version: asString(request.version, "request.version", { pattern: /^\d+\.\d+\.\d+$/ }),
    planningEpoch: asString(request.planningEpoch, "request.planningEpoch", { pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/ }),
    sourceRepository: asString(request.sourceRepository, "request.sourceRepository", { maximum: 300 }),
    targetRepository: asString(request.targetRepository, "request.targetRepository", { maximum: 300 }),
    batchSize,
    lastBatchPolicy: request.lastBatchPolicy,
    generationPolicy: freeze({
      oneAssetPerImage: request.generationPolicy?.oneAssetPerImage === true,
      separateImagesOnly: request.generationPolicy?.separateImagesOnly === true,
      contactSheetsForbiddenForRuntime: request.generationPolicy?.contactSheetsForbiddenForRuntime === true,
      readableTextForbiddenInGeneratedArt: request.generationPolicy?.readableTextForbiddenInGeneratedArt === true,
      originalEvavoArtRequired: request.generationPolicy?.originalEvavoArtRequired === true,
      referenceBytesForbidden: request.generationPolicy?.referenceBytesForbidden === true,
      humanApprovalRequired: request.generationPolicy?.humanApprovalRequired === true,
      automaticPromotionForbidden: request.generationPolicy?.automaticPromotionForbidden === true,
    }),
    games,
    fontFamilies,
    expected: request.expected ? freeze({
      images: asInteger(request.expected.images, "request.expected.images", { minimum: 1 }),
      batches: asInteger(request.expected.batches, "request.expected.batches", { minimum: 1 }),
    }) : undefined,
  });
}
