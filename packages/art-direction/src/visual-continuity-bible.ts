import {
  VISUAL_ASSET_TYPES,
  VISUAL_CONTINUITY_BIBLE_KIND,
  VISUAL_CONTINUITY_DETECTIONS,
  VISUAL_CONTINUITY_METRIC_IDS,
  VISUAL_CONTINUITY_PROTOCOL_VERSION,
  VISUAL_LOCK_KINDS,
  VISUAL_REFERENCE_ROLES,
  VISUAL_STUDIO_TARGETS,
} from "./visual-continuity-types.js";
import type {
  CompiledVisualContinuityBible,
  VisualContinuityBibleInput,
  VisualContinuityColourTokenInput,
  VisualContinuityEntityInput,
  VisualContinuityLocationInput,
  VisualContinuityLockInput,
  VisualContinuityMapProfileInput,
  VisualContinuityMapSymbolInput,
  VisualContinuityMetricId,
  VisualContinuityReferenceInput,
  VisualContinuityShotTemplateInput,
} from "./visual-continuity-types.js";
import {
  arrayValue,
  assertKnownIds,
  assertUnique,
  enumValue,
  exactKeys,
  fail,
  finiteNumber,
  freeze,
  hash,
  hexValue,
  identifier,
  identifierArray,
  literalTrue,
  optionalIdentifierArray,
  optionalText,
  optionalTextArray,
  record,
  semverValue,
  sha256Value,
  sortById,
  text,
  textArray,
} from "./visual-continuity-internal.js";

function normalizeReference(value: unknown, index: number): VisualContinuityReferenceInput {
  const label = `references[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, [
    "id",
    "role",
    "uri",
    "sha256",
    "rights",
    "note",
    "weight",
    "entityIds",
    "locationIds",
    "mapProfileIds",
  ]);
  const weight = input.weight === undefined
    ? undefined
    : finiteNumber(input.weight, `${label}.weight`, 0, 1);
  const entityIds = optionalIdentifierArray(input.entityIds, `${label}.entityIds`);
  const locationIds = optionalIdentifierArray(input.locationIds, `${label}.locationIds`);
  const mapProfileIds = optionalIdentifierArray(input.mapProfileIds, `${label}.mapProfileIds`);
  return {
    id: identifier(input.id, `${label}.id`),
    role: enumValue(input.role, `${label}.role`, VISUAL_REFERENCE_ROLES),
    uri: text(input.uri, `${label}.uri`, 2048),
    sha256: sha256Value(input.sha256, `${label}.sha256`),
    rights: text(input.rights, `${label}.rights`, 500),
    note: text(input.note, `${label}.note`, 2000),
    ...(weight === undefined ? {} : { weight }),
    ...(entityIds.length === 0 ? {} : { entityIds }),
    ...(locationIds.length === 0 ? {} : { locationIds }),
    ...(mapProfileIds.length === 0 ? {} : { mapProfileIds }),
  };
}

function normalizeColourToken(
  value: unknown,
  index: number,
): VisualContinuityColourTokenInput {
  const label = `colourTokens[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, [
    "id",
    "hex",
    "role",
    "usage",
    "reservedFor",
    "prohibitedFor",
    "pairWith",
    "toleranceDeltaE",
  ]);
  const reservedFor = optionalTextArray(input.reservedFor, `${label}.reservedFor`);
  const prohibitedFor = optionalTextArray(input.prohibitedFor, `${label}.prohibitedFor`);
  const pairWith = optionalIdentifierArray(input.pairWith, `${label}.pairWith`);
  const toleranceDeltaE = input.toleranceDeltaE === undefined
    ? undefined
    : finiteNumber(input.toleranceDeltaE, `${label}.toleranceDeltaE`, 0, 100);
  return {
    id: identifier(input.id, `${label}.id`),
    hex: hexValue(input.hex, `${label}.hex`),
    role: text(input.role, `${label}.role`, 500),
    usage: textArray(input.usage, `${label}.usage`, 1),
    ...(reservedFor.length === 0 ? {} : { reservedFor }),
    ...(prohibitedFor.length === 0 ? {} : { prohibitedFor }),
    ...(pairWith.length === 0 ? {} : { pairWith }),
    ...(toleranceDeltaE === undefined ? {} : { toleranceDeltaE }),
  };
}

function normalizeLock(value: unknown, index: number): VisualContinuityLockInput {
  const label = `locks[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, [
    "id",
    "kind",
    "description",
    "severity",
    "appliesToAssetTypes",
    "entityIds",
    "locationIds",
    "mapProfileIds",
    "referenceIds",
    "mayVary",
    "mustNotVary",
  ]);
  const assetTypes = input.appliesToAssetTypes === undefined
    ? []
    : arrayValue(input.appliesToAssetTypes, `${label}.appliesToAssetTypes`, 1, 64)
        .map((item, itemIndex) => enumValue(
          item,
          `${label}.appliesToAssetTypes[${itemIndex}]`,
          VISUAL_ASSET_TYPES,
        ));
  const entityIds = optionalIdentifierArray(input.entityIds, `${label}.entityIds`);
  const locationIds = optionalIdentifierArray(input.locationIds, `${label}.locationIds`);
  const mapProfileIds = optionalIdentifierArray(input.mapProfileIds, `${label}.mapProfileIds`);
  const referenceIds = optionalIdentifierArray(input.referenceIds, `${label}.referenceIds`);
  const mayVary = optionalTextArray(input.mayVary, `${label}.mayVary`);
  const mustNotVary = optionalTextArray(input.mustNotVary, `${label}.mustNotVary`);
  return {
    id: identifier(input.id, `${label}.id`),
    kind: enumValue(input.kind, `${label}.kind`, VISUAL_LOCK_KINDS),
    description: text(input.description, `${label}.description`, 2000),
    severity: enumValue(input.severity, `${label}.severity`, ["blocking", "warning"] as const),
    ...(assetTypes.length === 0 ? {} : { appliesToAssetTypes: assetTypes }),
    ...(entityIds.length === 0 ? {} : { entityIds }),
    ...(locationIds.length === 0 ? {} : { locationIds }),
    ...(mapProfileIds.length === 0 ? {} : { mapProfileIds }),
    ...(referenceIds.length === 0 ? {} : { referenceIds }),
    ...(mayVary.length === 0 ? {} : { mayVary }),
    ...(mustNotVary.length === 0 ? {} : { mustNotVary }),
  };
}

function normalizeScale(value: unknown, label: string): VisualContinuityEntityInput["scale"] {
  if (value === undefined) return undefined;
  const input = record(value, label);
  exactKeys(input, label, ["unit", "value", "note"]);
  return {
    unit: enumValue(input.unit, `${label}.unit`, ["pixels", "centimetres", "metres", "relative"] as const),
    value: finiteNumber(input.value, `${label}.value`, 0.000001, 1_000_000),
    note: text(input.note, `${label}.note`, 1000),
  };
}

function normalizeEntity(value: unknown, index: number): VisualContinuityEntityInput {
  const label = `entities[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, [
    "id",
    "kind",
    "name",
    "canonicalDescription",
    "distinctiveFeatures",
    "silhouetteRules",
    "proportionRules",
    "materialRules",
    "asymmetryRules",
    "costumeOrVariantRules",
    "forbiddenMutations",
    "colourTokenIds",
    "referenceIds",
    "lockIds",
    "scale",
  ]);
  const asymmetryRules = optionalTextArray(input.asymmetryRules, `${label}.asymmetryRules`);
  const costumeOrVariantRules = optionalTextArray(
    input.costumeOrVariantRules,
    `${label}.costumeOrVariantRules`,
  );
  const scale = normalizeScale(input.scale, `${label}.scale`);
  return {
    id: identifier(input.id, `${label}.id`),
    kind: enumValue(
      input.kind,
      `${label}.kind`,
      ["character", "creature", "prop", "vehicle", "brand"] as const,
    ),
    name: text(input.name, `${label}.name`, 300),
    canonicalDescription: text(input.canonicalDescription, `${label}.canonicalDescription`, 4000),
    distinctiveFeatures: textArray(input.distinctiveFeatures, `${label}.distinctiveFeatures`, 1),
    silhouetteRules: textArray(input.silhouetteRules, `${label}.silhouetteRules`, 1),
    proportionRules: textArray(input.proportionRules, `${label}.proportionRules`, 1),
    materialRules: textArray(input.materialRules, `${label}.materialRules`, 1),
    ...(asymmetryRules.length === 0 ? {} : { asymmetryRules }),
    ...(costumeOrVariantRules.length === 0 ? {} : { costumeOrVariantRules }),
    forbiddenMutations: textArray(input.forbiddenMutations, `${label}.forbiddenMutations`, 1),
    colourTokenIds: identifierArray(input.colourTokenIds, `${label}.colourTokenIds`, 1),
    referenceIds: identifierArray(input.referenceIds, `${label}.referenceIds`, 1),
    lockIds: identifierArray(input.lockIds, `${label}.lockIds`, 1),
    ...(scale === undefined ? {} : { scale }),
  };
}

function normalizeLocation(value: unknown, index: number): VisualContinuityLocationInput {
  const label = `locations[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, [
    "id",
    "name",
    "canonicalDescription",
    "geographyRules",
    "architectureRules",
    "materialRules",
    "landmarkRules",
    "weatherRules",
    "timeOfDayRules",
    "forbiddenMutations",
    "colourTokenIds",
    "referenceIds",
    "lockIds",
    "mapCoordinates",
  ]);
  const coordinates = input.mapCoordinates === undefined
    ? undefined
    : (() => {
        const coordinateInput = record(input.mapCoordinates, `${label}.mapCoordinates`);
        exactKeys(coordinateInput, `${label}.mapCoordinates`, ["x", "y", "coordinateSpace"]);
        return {
          x: finiteNumber(
            coordinateInput.x,
            `${label}.mapCoordinates.x`,
            -1_000_000,
            1_000_000,
          ),
          y: finiteNumber(
            coordinateInput.y,
            `${label}.mapCoordinates.y`,
            -1_000_000,
            1_000_000,
          ),
          coordinateSpace: text(
            coordinateInput.coordinateSpace,
            `${label}.mapCoordinates.coordinateSpace`,
            300,
          ),
        };
      })();
  return {
    id: identifier(input.id, `${label}.id`),
    name: text(input.name, `${label}.name`, 300),
    canonicalDescription: text(input.canonicalDescription, `${label}.canonicalDescription`, 4000),
    geographyRules: textArray(input.geographyRules, `${label}.geographyRules`, 1),
    architectureRules: textArray(input.architectureRules, `${label}.architectureRules`, 1),
    materialRules: textArray(input.materialRules, `${label}.materialRules`, 1),
    landmarkRules: textArray(input.landmarkRules, `${label}.landmarkRules`, 1),
    weatherRules: textArray(input.weatherRules, `${label}.weatherRules`, 1),
    timeOfDayRules: textArray(input.timeOfDayRules, `${label}.timeOfDayRules`, 1),
    forbiddenMutations: textArray(input.forbiddenMutations, `${label}.forbiddenMutations`, 1),
    colourTokenIds: identifierArray(input.colourTokenIds, `${label}.colourTokenIds`, 1),
    referenceIds: identifierArray(input.referenceIds, `${label}.referenceIds`, 1),
    lockIds: identifierArray(input.lockIds, `${label}.lockIds`, 1),
    ...(coordinates === undefined ? {} : { mapCoordinates: coordinates }),
  };
}

function normalizeMapSymbol(value: unknown, index: number): VisualContinuityMapSymbolInput {
  const label = `mapSymbols[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, [
    "id",
    "meaning",
    "shapeRules",
    "colourTokenIds",
    "scaleRules",
    "referenceIds",
  ]);
  return {
    id: identifier(input.id, `${label}.id`),
    meaning: text(input.meaning, `${label}.meaning`, 1000),
    shapeRules: textArray(input.shapeRules, `${label}.shapeRules`, 1),
    colourTokenIds: identifierArray(input.colourTokenIds, `${label}.colourTokenIds`, 1),
    scaleRules: textArray(input.scaleRules, `${label}.scaleRules`, 1),
    referenceIds: identifierArray(input.referenceIds, `${label}.referenceIds`, 1),
  };
}

function normalizeMapProfile(value: unknown, index: number): VisualContinuityMapProfileInput {
  const label = `mapProfiles[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, [
    "id",
    "kind",
    "title",
    "projection",
    "orientation",
    "coordinateSpace",
    "scalePolicy",
    "terrainLayers",
    "routeGrammar",
    "labelGrammar",
    "safeAreaRules",
    "symbolIds",
    "colourTokenIds",
    "referenceIds",
    "lockIds",
    "outputSizes",
  ]);
  const outputSizes = arrayValue(input.outputSizes, `${label}.outputSizes`, 1, 32).map(
    (item, itemIndex) => {
      const sizeLabel = `${label}.outputSizes[${itemIndex}]`;
      const size = record(item, sizeLabel);
      exactKeys(size, sizeLabel, ["width", "height", "use"]);
      return {
        width: finiteNumber(size.width, `${sizeLabel}.width`, 1, 32768),
        height: finiteNumber(size.height, `${sizeLabel}.height`, 1, 32768),
        use: text(size.use, `${sizeLabel}.use`, 500),
      };
    },
  );
  return {
    id: identifier(input.id, `${label}.id`),
    kind: enumValue(input.kind, `${label}.kind`, ["world", "regional", "local", "tactical", "minimap"] as const),
    title: text(input.title, `${label}.title`, 300),
    projection: text(input.projection, `${label}.projection`, 500),
    orientation: text(input.orientation, `${label}.orientation`, 500),
    coordinateSpace: text(input.coordinateSpace, `${label}.coordinateSpace`, 500),
    scalePolicy: text(input.scalePolicy, `${label}.scalePolicy`, 1000),
    terrainLayers: textArray(input.terrainLayers, `${label}.terrainLayers`, 1),
    routeGrammar: textArray(input.routeGrammar, `${label}.routeGrammar`, 1),
    labelGrammar: textArray(input.labelGrammar, `${label}.labelGrammar`, 1),
    safeAreaRules: textArray(input.safeAreaRules, `${label}.safeAreaRules`, 1),
    symbolIds: identifierArray(input.symbolIds, `${label}.symbolIds`, 1),
    colourTokenIds: identifierArray(input.colourTokenIds, `${label}.colourTokenIds`, 1),
    referenceIds: identifierArray(input.referenceIds, `${label}.referenceIds`, 1),
    lockIds: identifierArray(input.lockIds, `${label}.lockIds`, 1),
    outputSizes,
  };
}

function normalizeShotTemplate(
  value: unknown,
  index: number,
): VisualContinuityShotTemplateInput {
  const label = `shotTemplates[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, [
    "id",
    "title",
    "assetTypes",
    "aspectRatio",
    "camera",
    "compositionRules",
    "lightingRules",
    "safeAreaRules",
    "referenceIds",
    "lockIds",
  ]);
  const camera = record(input.camera, `${label}.camera`);
  exactKeys(camera, `${label}.camera`, [
    "projection",
    "lensOrScale",
    "height",
    "angle",
    "movement",
  ]);
  const assetTypes = arrayValue(input.assetTypes, `${label}.assetTypes`, 1, 64).map(
    (item, itemIndex) => enumValue(
      item,
      `${label}.assetTypes[${itemIndex}]`,
      VISUAL_ASSET_TYPES,
    ),
  );
  assertUnique(assetTypes, `${label}.assetTypes`, (item) => item);
  return {
    id: identifier(input.id, `${label}.id`),
    title: text(input.title, `${label}.title`, 300),
    assetTypes,
    aspectRatio: text(input.aspectRatio, `${label}.aspectRatio`, 100),
    camera: {
      projection: text(camera.projection, `${label}.camera.projection`, 500),
      lensOrScale: text(camera.lensOrScale, `${label}.camera.lensOrScale`, 500),
      height: text(camera.height, `${label}.camera.height`, 500),
      angle: text(camera.angle, `${label}.camera.angle`, 500),
      movement: enumValue(camera.movement, `${label}.camera.movement`, ["locked", "bounded", "free"] as const),
    },
    compositionRules: textArray(input.compositionRules, `${label}.compositionRules`, 1),
    lightingRules: textArray(input.lightingRules, `${label}.lightingRules`, 1),
    safeAreaRules: textArray(input.safeAreaRules, `${label}.safeAreaRules`, 1),
    referenceIds: identifierArray(input.referenceIds, `${label}.referenceIds`, 1),
    lockIds: identifierArray(input.lockIds, `${label}.lockIds`, 1),
  };
}

function normalizeMinimumMetricScores(
  value: unknown,
): Readonly<Partial<Record<VisualContinuityMetricId, number>>> {
  const input = record(value, "quality.minimumMetricScores");
  exactKeys(input, "quality.minimumMetricScores", VISUAL_CONTINUITY_METRIC_IDS);
  return Object.fromEntries(
    Object.entries(input)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, score]) => [
        key,
        finiteNumber(score, `quality.minimumMetricScores.${key}`, 0, 1),
      ]),
  );
}

function validateCrossReferences(bible: VisualContinuityBibleInput): void {
  const colourIds = new Set(bible.colourTokens.map((item) => item.id));
  const referenceIds = new Set(bible.references.map((item) => item.id));
  const lockIds = new Set(bible.locks.map((item) => item.id));
  const entityIds = new Set(bible.entities.map((item) => item.id));
  const locationIds = new Set(bible.locations.map((item) => item.id));
  const mapSymbolIds = new Set(bible.mapSymbols.map((item) => item.id));
  const mapProfileIds = new Set(bible.mapProfiles.map((item) => item.id));

  for (const token of bible.colourTokens) {
    assertKnownIds(token.pairWith ?? [], colourIds, `colourTokens.${token.id}.pairWith`);
  }
  for (const reference of bible.references) {
    assertKnownIds(reference.entityIds ?? [], entityIds, `references.${reference.id}.entityIds`);
    assertKnownIds(reference.locationIds ?? [], locationIds, `references.${reference.id}.locationIds`);
    assertKnownIds(reference.mapProfileIds ?? [], mapProfileIds, `references.${reference.id}.mapProfileIds`);
  }
  for (const lock of bible.locks) {
    assertKnownIds(lock.entityIds ?? [], entityIds, `locks.${lock.id}.entityIds`);
    assertKnownIds(lock.locationIds ?? [], locationIds, `locks.${lock.id}.locationIds`);
    assertKnownIds(lock.mapProfileIds ?? [], mapProfileIds, `locks.${lock.id}.mapProfileIds`);
    assertKnownIds(lock.referenceIds ?? [], referenceIds, `locks.${lock.id}.referenceIds`);
  }
  for (const entity of bible.entities) {
    assertKnownIds(entity.colourTokenIds, colourIds, `entities.${entity.id}.colourTokenIds`);
    assertKnownIds(entity.referenceIds, referenceIds, `entities.${entity.id}.referenceIds`);
    assertKnownIds(entity.lockIds, lockIds, `entities.${entity.id}.lockIds`);
  }
  for (const location of bible.locations) {
    assertKnownIds(location.colourTokenIds, colourIds, `locations.${location.id}.colourTokenIds`);
    assertKnownIds(location.referenceIds, referenceIds, `locations.${location.id}.referenceIds`);
    assertKnownIds(location.lockIds, lockIds, `locations.${location.id}.lockIds`);
  }
  for (const symbol of bible.mapSymbols) {
    assertKnownIds(symbol.colourTokenIds, colourIds, `mapSymbols.${symbol.id}.colourTokenIds`);
    assertKnownIds(symbol.referenceIds, referenceIds, `mapSymbols.${symbol.id}.referenceIds`);
  }
  for (const profile of bible.mapProfiles) {
    assertKnownIds(profile.symbolIds, mapSymbolIds, `mapProfiles.${profile.id}.symbolIds`);
    assertKnownIds(profile.colourTokenIds, colourIds, `mapProfiles.${profile.id}.colourTokenIds`);
    assertKnownIds(profile.referenceIds, referenceIds, `mapProfiles.${profile.id}.referenceIds`);
    assertKnownIds(profile.lockIds, lockIds, `mapProfiles.${profile.id}.lockIds`);
  }
  for (const shot of bible.shotTemplates) {
    assertKnownIds(shot.referenceIds, referenceIds, `shotTemplates.${shot.id}.referenceIds`);
    assertKnownIds(shot.lockIds, lockIds, `shotTemplates.${shot.id}.lockIds`);
  }
}

export function compileVisualContinuityBible(value: unknown): CompiledVisualContinuityBible {
  const input = record(value, "bible");
  exactKeys(input, "bible", [
    "schemaVersion",
    "kind",
    "bibleId",
    "revision",
    "project",
    "scope",
    "style",
    "colourTokens",
    "references",
    "locks",
    "entities",
    "locations",
    "mapSymbols",
    "mapProfiles",
    "shotTemplates",
    "quality",
    "policy",
    "metadata",
  ]);
  if (input.schemaVersion !== "1.0") {
    fail("VISUAL_CONTINUITY_VERSION_UNSUPPORTED", "bible.schemaVersion must be 1.0.");
  }
  if (input.kind !== VISUAL_CONTINUITY_BIBLE_KIND) {
    fail("VISUAL_CONTINUITY_KIND_INVALID", `bible.kind must be ${VISUAL_CONTINUITY_BIBLE_KIND}.`);
  }

  const project = record(input.project, "project");
  exactKeys(project, "project", [
    "projectId",
    "title",
    "description",
    "engine",
    "engineVersion",
    "targetPlatforms",
    "targetStudios",
  ]);
  const targetStudios = arrayValue(project.targetStudios, "project.targetStudios", 1, 16).map(
    (item, index) => enumValue(item, `project.targetStudios[${index}]`, VISUAL_STUDIO_TARGETS),
  );
  assertUnique(targetStudios, "project.targetStudios", (item) => item);

  const scope = record(input.scope, "scope");
  exactKeys(scope, "scope", [
    "assetTypes",
    "preserveCrossStudioContinuity",
    "supportLongRunningSessions",
    "noHiddenChatState",
  ]);
  const assetTypes = arrayValue(scope.assetTypes, "scope.assetTypes", 1, 64).map(
    (item, index) => enumValue(item, `scope.assetTypes[${index}]`, VISUAL_ASSET_TYPES),
  );
  assertUnique(assetTypes, "scope.assetTypes", (item) => item);

  const style = record(input.style, "style");
  exactKeys(style, "style", [
    "title",
    "intent",
    "authoredEra",
    "renderingLanguage",
    "lineLanguage",
    "valueStructure",
    "materialLanguage",
    "lightingLanguage",
    "compositionLanguage",
    "distinctiveMotifs",
    "prohibitedGenericTraits",
    "prohibitedModernTraits",
  ]);

  const colourTokens = sortById(
    arrayValue(input.colourTokens, "colourTokens", 1, 512).map(normalizeColourToken),
  );
  const references = sortById(
    arrayValue(input.references, "references", 1, 1024).map(normalizeReference),
  );
  const locks = sortById(arrayValue(input.locks, "locks", 1, 1024).map(normalizeLock));
  const entities = sortById(arrayValue(input.entities, "entities", 0, 1024).map(normalizeEntity));
  const locations = sortById(arrayValue(input.locations, "locations", 0, 1024).map(normalizeLocation));
  const mapSymbols = sortById(arrayValue(input.mapSymbols, "mapSymbols", 0, 1024).map(normalizeMapSymbol));
  const mapProfiles = sortById(arrayValue(input.mapProfiles, "mapProfiles", 0, 256).map(normalizeMapProfile));
  const shotTemplates = sortById(
    arrayValue(input.shotTemplates, "shotTemplates", 1, 256).map(normalizeShotTemplate),
  );
  assertUnique(colourTokens, "colourTokens", (item) => item.id);
  assertUnique(references, "references", (item) => item.id);
  assertUnique(locks, "locks", (item) => item.id);
  assertUnique(entities, "entities", (item) => item.id);
  assertUnique(locations, "locations", (item) => item.id);
  assertUnique(mapSymbols, "mapSymbols", (item) => item.id);
  assertUnique(mapProfiles, "mapProfiles", (item) => item.id);
  assertUnique(shotTemplates, "shotTemplates", (item) => item.id);

  const quality = record(input.quality, "quality");
  exactKeys(quality, "quality", [
    "minimumMetricScores",
    "technicalPassScore",
    "maximumUnexpectedColourRatio",
    "maximumAnchorDriftPixels",
    "maximumGeometryDriftPixels",
    "maximumSilhouetteAreaDeltaRatio",
    "blockingDetections",
  ]);
  const blockingDetections = arrayValue(
    quality.blockingDetections,
    "quality.blockingDetections",
    1,
    VISUAL_CONTINUITY_DETECTIONS.length,
  ).map((item, index) => enumValue(
    item,
    `quality.blockingDetections[${index}]`,
    VISUAL_CONTINUITY_DETECTIONS,
  ));
  assertUnique(blockingDetections, "quality.blockingDetections", (item) => item);

  const policy = record(input.policy, "policy");
  exactKeys(policy, "policy", [
    "immutableApprovedReferences",
    "oneBoundedOutputPerWorkItem",
    "noSilentCanonMutation",
    "noGenericFallback",
    "promptIsNotAuthority",
    "seedIsNotAuthority",
    "requireFullResolutionReview",
    "requireEvidenceBeforePromotion",
    "preserveApprovedExceptions",
    "requireNeighborReviewForSequences",
    "requireLoopClosureReview",
  ]);

  const normalized: Omit<VisualContinuityBibleInput, "project"> & Readonly<{
    readonly project: VisualContinuityBibleInput["project"] & Readonly<{
      readonly engine: string;
      readonly engineVersion: string;
    }>;
  }> = {
    schemaVersion: "1.0",
    kind: VISUAL_CONTINUITY_BIBLE_KIND,
    bibleId: identifier(input.bibleId, "bible.bibleId"),
    revision: semverValue(input.revision, "bible.revision"),
    project: {
      projectId: identifier(project.projectId, "project.projectId"),
      title: text(project.title, "project.title", 300),
      description: text(project.description, "project.description", 4000),
      engine: optionalText(project.engine, "project.engine", 300) ?? "unspecified",
      engineVersion: optionalText(project.engineVersion, "project.engineVersion", 100) ?? "unspecified",
      targetPlatforms: textArray(project.targetPlatforms, "project.targetPlatforms", 1, 64),
      targetStudios,
    },
    scope: {
      assetTypes,
      preserveCrossStudioContinuity: literalTrue(
        scope.preserveCrossStudioContinuity,
        "scope.preserveCrossStudioContinuity",
      ),
      supportLongRunningSessions: literalTrue(
        scope.supportLongRunningSessions,
        "scope.supportLongRunningSessions",
      ),
      noHiddenChatState: literalTrue(scope.noHiddenChatState, "scope.noHiddenChatState"),
    },
    style: {
      title: text(style.title, "style.title", 300),
      intent: text(style.intent, "style.intent", 4000),
      authoredEra: text(style.authoredEra, "style.authoredEra", 500),
      renderingLanguage: textArray(style.renderingLanguage, "style.renderingLanguage", 1),
      lineLanguage: textArray(style.lineLanguage, "style.lineLanguage", 1),
      valueStructure: textArray(style.valueStructure, "style.valueStructure", 1),
      materialLanguage: textArray(style.materialLanguage, "style.materialLanguage", 1),
      lightingLanguage: textArray(style.lightingLanguage, "style.lightingLanguage", 1),
      compositionLanguage: textArray(style.compositionLanguage, "style.compositionLanguage", 1),
      distinctiveMotifs: textArray(style.distinctiveMotifs, "style.distinctiveMotifs", 3),
      prohibitedGenericTraits: textArray(
        style.prohibitedGenericTraits,
        "style.prohibitedGenericTraits",
        3,
      ),
      prohibitedModernTraits: textArray(
        style.prohibitedModernTraits,
        "style.prohibitedModernTraits",
        1,
      ),
    },
    colourTokens,
    references,
    locks,
    entities,
    locations,
    mapSymbols,
    mapProfiles,
    shotTemplates,
    quality: {
      minimumMetricScores: normalizeMinimumMetricScores(quality.minimumMetricScores),
      technicalPassScore: finiteNumber(quality.technicalPassScore, "quality.technicalPassScore", 0, 1),
      maximumUnexpectedColourRatio: finiteNumber(
        quality.maximumUnexpectedColourRatio,
        "quality.maximumUnexpectedColourRatio",
        0,
        1,
      ),
      maximumAnchorDriftPixels: finiteNumber(
        quality.maximumAnchorDriftPixels,
        "quality.maximumAnchorDriftPixels",
        0,
        4096,
      ),
      maximumGeometryDriftPixels: finiteNumber(
        quality.maximumGeometryDriftPixels,
        "quality.maximumGeometryDriftPixels",
        0,
        4096,
      ),
      maximumSilhouetteAreaDeltaRatio: finiteNumber(
        quality.maximumSilhouetteAreaDeltaRatio,
        "quality.maximumSilhouetteAreaDeltaRatio",
        0,
        1,
      ),
      blockingDetections,
    },
    policy: {
      immutableApprovedReferences: literalTrue(
        policy.immutableApprovedReferences,
        "policy.immutableApprovedReferences",
      ),
      oneBoundedOutputPerWorkItem: literalTrue(
        policy.oneBoundedOutputPerWorkItem,
        "policy.oneBoundedOutputPerWorkItem",
      ),
      noSilentCanonMutation: literalTrue(
        policy.noSilentCanonMutation,
        "policy.noSilentCanonMutation",
      ),
      noGenericFallback: literalTrue(policy.noGenericFallback, "policy.noGenericFallback"),
      promptIsNotAuthority: literalTrue(
        policy.promptIsNotAuthority,
        "policy.promptIsNotAuthority",
      ),
      seedIsNotAuthority: literalTrue(policy.seedIsNotAuthority, "policy.seedIsNotAuthority"),
      requireFullResolutionReview: literalTrue(
        policy.requireFullResolutionReview,
        "policy.requireFullResolutionReview",
      ),
      requireEvidenceBeforePromotion: literalTrue(
        policy.requireEvidenceBeforePromotion,
        "policy.requireEvidenceBeforePromotion",
      ),
      preserveApprovedExceptions: literalTrue(
        policy.preserveApprovedExceptions,
        "policy.preserveApprovedExceptions",
      ),
      requireNeighborReviewForSequences: literalTrue(
        policy.requireNeighborReviewForSequences,
        "policy.requireNeighborReviewForSequences",
      ),
      requireLoopClosureReview: literalTrue(
        policy.requireLoopClosureReview,
        "policy.requireLoopClosureReview",
      ),
    },
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };

  validateCrossReferences(normalized);

  const indexes = {
    colourTokenIds: colourTokens.map((item) => item.id),
    referenceIds: references.map((item) => item.id),
    lockIds: locks.map((item) => item.id),
    entityIds: entities.map((item) => item.id),
    locationIds: locations.map((item) => item.id),
    mapSymbolIds: mapSymbols.map((item) => item.id),
    mapProfileIds: mapProfiles.map((item) => item.id),
    shotTemplateIds: shotTemplates.map((item) => item.id),
  };
  const unsigned = {
    ...normalized,
    protocolVersion: VISUAL_CONTINUITY_PROTOCOL_VERSION,
    indexes,
    authority: {
      providerExecution: false as const,
      imageMutation: false as const,
      creativeApproval: false as const,
      canonMutation: false as const,
      targetRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    },
  };
  return freeze({ ...unsigned, bibleSha256: hash(unsigned) });
}

export function verifyVisualContinuityBible(
  value: CompiledVisualContinuityBible,
): void {
  const {
    protocolVersion: _protocolVersion,
    indexes: _indexes,
    authority: _authority,
    bibleSha256,
    ...input
  } = value;
  const compiled = compileVisualContinuityBible(input);
  if (compiled.bibleSha256 !== bibleSha256) {
    fail(
      "VISUAL_CONTINUITY_BIBLE_HASH_MISMATCH",
      "The visual continuity bible does not match its deterministic SHA-256.",
    );
  }
  if (compiled.protocolVersion !== VISUAL_CONTINUITY_PROTOCOL_VERSION) {
    fail("VISUAL_CONTINUITY_VERSION_UNSUPPORTED", "The visual continuity protocol is unsupported.");
  }
}
