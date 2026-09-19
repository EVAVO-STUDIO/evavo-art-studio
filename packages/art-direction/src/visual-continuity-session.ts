import {
  VISUAL_ASSET_TYPES,
  VISUAL_CONTINUITY_PROTOCOL_VERSION,
  VISUAL_CONTINUITY_SESSION_KIND,
  VISUAL_STUDIO_TARGETS,
} from "./visual-continuity-types.js";
import type {
  CompiledVisualContinuityBible,
  CompiledVisualContinuitySession,
  VisualAssetType,
  VisualContinuityDetection,
  VisualContinuityMetricId,
  VisualContinuitySessionInput,
  VisualContinuityWorkItemInput,
  VisualContinuityWorkItemState,
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
  identifier,
  integer,
  literalTrue,
  optionalIdentifierArray,
  record,
  semverValue,
  sha256Value,
  sortById,
  text,
  textArray,
} from "./visual-continuity-internal.js";
import { verifyVisualContinuityBible } from "./visual-continuity-bible.js";

const MAP_ASSET_TYPES = new Set<VisualAssetType>([
  "world-map",
  "regional-map",
  "local-map",
  "tactical-map",
  "minimap",
]);
const ENTITY_ASSET_TYPES = new Set<VisualAssetType>([
  "character",
  "creature",
  "prop",
  "vehicle",
  "sprite-frame",
  "sprite-animation",
  "model-sheet",
  "orthographic-view",
  "turntable-frame",
]);
const ENVIRONMENT_ASSET_TYPES = new Set<VisualAssetType>([
  "environment",
  "interior",
  "exterior",
  "matte-painting",
  "location-card",
]);
const TEMPORAL_ASSET_TYPES = new Set<VisualAssetType>([
  "sprite-frame",
  "sprite-animation",
  "storyboard-frame",
  "cinematic-keyframe",
  "turntable-frame",
  "particle",
]);

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function requiredMetrics(
  assetType: VisualAssetType,
  hasSequence: boolean,
  loop: boolean,
): readonly VisualContinuityMetricId[] {
  const metrics: VisualContinuityMetricId[] = [
    "style",
    "palette",
    "composition",
    "non-generic",
    "output-readiness",
  ];
  if (ENTITY_ASSET_TYPES.has(assetType)) {
    metrics.push("identity", "silhouette", "proportions", "material");
  }
  if (ENVIRONMENT_ASSET_TYPES.has(assetType)) {
    metrics.push("geography", "architecture", "material", "lighting", "camera");
  }
  if (MAP_ASSET_TYPES.has(assetType)) {
    metrics.push("map-grammar", "geography", "typography", "camera");
  }
  if (assetType === "ui" || assetType === "icon" || assetType === "logo" || assetType === "typography") {
    metrics.push("typography", "silhouette");
  }
  if (assetType === "texture" || assetType === "material-reference" || assetType === "decal") {
    metrics.push("material");
  }
  if (assetType === "storyboard-frame" || assetType === "cinematic-keyframe") {
    metrics.push("camera", "lighting");
  }
  if (TEMPORAL_ASSET_TYPES.has(assetType) || hasSequence) {
    metrics.push("temporal", "neighbor-continuity", "anchor");
  }
  if (loop) metrics.push("loop-closure");
  return uniqueSorted(metrics);
}

function requiredDetections(
  bible: CompiledVisualContinuityBible,
  assetType: VisualAssetType,
  hasSequence: boolean,
): readonly VisualContinuityDetection[] {
  const detections: VisualContinuityDetection[] = [
    ...bible.quality.blockingDetections,
    "generic-ai-treatment",
    "random-detail",
    "palette-drift",
    "crop-risk",
  ];
  if (ENTITY_ASSET_TYPES.has(assetType)) {
    detections.push(
      "identity-drift",
      "geometry-drift",
      "costume-drift",
      "equipment-side-swap",
      "material-drift",
      "scale-drift",
    );
  }
  if (ENVIRONMENT_ASSET_TYPES.has(assetType)) {
    detections.push(
      "map-geography-drift",
      "geometry-drift",
      "lighting-drift",
      "material-drift",
      "scale-drift",
    );
  }
  if (MAP_ASSET_TYPES.has(assetType)) {
    detections.push(
      "map-geography-drift",
      "symbol-drift",
      "text-corruption",
      "camera-drift",
      "scale-drift",
    );
  }
  if (hasSequence || TEMPORAL_ASSET_TYPES.has(assetType)) {
    detections.push("duplicate-frame", "frozen-animation", "camera-drift");
  }
  return uniqueSorted(detections);
}

function normalizeOutput(value: unknown, label: string): VisualContinuityWorkItemInput["output"] {
  const input = record(value, label);
  exactKeys(input, label, ["width", "height", "format", "transparency"]);
  const size = {
    width: integer(input.width, `${label}.width`, 1, 32768),
    height: integer(input.height, `${label}.height`, 1, 32768),
  };
  return {
    ...size,
    format: enumValue(
      input.format,
      `${label}.format`,
      ["png", "webp", "svg", "json", "glb", "exr"] as const,
    ),
    transparency: enumValue(
      input.transparency,
      `${label}.transparency`,
      ["required", "preferred", "opaque", "not-applicable"] as const,
    ),
  };
}

function normalizeSequence(
  value: unknown,
  label: string,
): VisualContinuityWorkItemInput["sequence"] {
  if (value === undefined) return undefined;
  const input = record(value, label);
  exactKeys(input, label, [
    "sequenceId",
    "frameNumber",
    "frameCount",
    "framesPerSecond",
    "loop",
    "previousWorkItemId",
    "nextWorkItemId",
  ]);
  const frameCount = integer(input.frameCount, `${label}.frameCount`, 1, 100_000);
  const previousWorkItemId = input.previousWorkItemId === undefined
    ? undefined
    : identifier(input.previousWorkItemId, `${label}.previousWorkItemId`);
  const nextWorkItemId = input.nextWorkItemId === undefined
    ? undefined
    : identifier(input.nextWorkItemId, `${label}.nextWorkItemId`);
  if (typeof input.loop !== "boolean") {
    fail("VISUAL_CONTINUITY_INPUT_INVALID", `${label}.loop must be boolean.`);
  }
  return {
    sequenceId: identifier(input.sequenceId, `${label}.sequenceId`),
    frameNumber: integer(input.frameNumber, `${label}.frameNumber`, 1, frameCount),
    frameCount,
    framesPerSecond: finiteNumber(input.framesPerSecond, `${label}.framesPerSecond`, 0.1, 240),
    loop: input.loop,
    ...(previousWorkItemId === undefined ? {} : { previousWorkItemId }),
    ...(nextWorkItemId === undefined ? {} : { nextWorkItemId }),
  };
}

function normalizeWorkItem(
  value: unknown,
  index: number,
): VisualContinuityWorkItemInput {
  const label = `workItems[${index}]`;
  const input = record(value, label);
  exactKeys(input, label, [
    "id",
    "title",
    "assetType",
    "targetStudio",
    "purpose",
    "output",
    "dependsOn",
    "entityIds",
    "locationIds",
    "mapProfileIds",
    "shotTemplateId",
    "referenceIds",
    "lockIds",
    "preserve",
    "mayChange",
    "mustNotIntroduce",
    "sequence",
    "metadata",
  ]);
  const dependsOn = optionalIdentifierArray(input.dependsOn, `${label}.dependsOn`);
  const entityIds = optionalIdentifierArray(input.entityIds, `${label}.entityIds`);
  const locationIds = optionalIdentifierArray(input.locationIds, `${label}.locationIds`);
  const mapProfileIds = optionalIdentifierArray(input.mapProfileIds, `${label}.mapProfileIds`);
  const referenceIds = optionalIdentifierArray(input.referenceIds, `${label}.referenceIds`);
  const lockIds = optionalIdentifierArray(input.lockIds, `${label}.lockIds`);
  const shotTemplateId = input.shotTemplateId === undefined
    ? undefined
    : identifier(input.shotTemplateId, `${label}.shotTemplateId`);
  const sequence = normalizeSequence(input.sequence, `${label}.sequence`);
  return {
    id: identifier(input.id, `${label}.id`),
    title: text(input.title, `${label}.title`, 300),
    assetType: enumValue(input.assetType, `${label}.assetType`, VISUAL_ASSET_TYPES),
    targetStudio: enumValue(input.targetStudio, `${label}.targetStudio`, VISUAL_STUDIO_TARGETS),
    purpose: text(input.purpose, `${label}.purpose`, 4000),
    output: normalizeOutput(input.output, `${label}.output`),
    ...(dependsOn.length === 0 ? {} : { dependsOn }),
    ...(entityIds.length === 0 ? {} : { entityIds }),
    ...(locationIds.length === 0 ? {} : { locationIds }),
    ...(mapProfileIds.length === 0 ? {} : { mapProfileIds }),
    ...(shotTemplateId === undefined ? {} : { shotTemplateId }),
    ...(referenceIds.length === 0 ? {} : { referenceIds }),
    ...(lockIds.length === 0 ? {} : { lockIds }),
    preserve: textArray(input.preserve, `${label}.preserve`, 1),
    mayChange: textArray(input.mayChange, `${label}.mayChange`, 0),
    mustNotIntroduce: textArray(input.mustNotIntroduce, `${label}.mustNotIntroduce`, 1),
    ...(sequence === undefined ? {} : { sequence }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

function validateDag(items: readonly VisualContinuityWorkItemInput[]): void {
  const byId = new Map(items.map((item) => [item.id, item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, trail: readonly string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      fail(
        "VISUAL_CONTINUITY_DEPENDENCY_CYCLE",
        `Work-item dependency cycle detected: ${[...trail, id].join(" -> ")}.`,
      );
    }
    visiting.add(id);
    const item = byId.get(id);
    if (!item) {
      fail("VISUAL_CONTINUITY_REFERENCE_INVALID", `Unknown work item ${id}.`);
    }
    for (const dependency of item.dependsOn ?? []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const item of items) visit(item.id, []);
}

function validateWorkReferences(
  bible: CompiledVisualContinuityBible,
  items: readonly VisualContinuityWorkItemInput[],
): void {
  const itemIds = new Set(items.map((item) => item.id));
  const entityIds = new Set(bible.indexes.entityIds);
  const locationIds = new Set(bible.indexes.locationIds);
  const mapProfileIds = new Set(bible.indexes.mapProfileIds);
  const referenceIds = new Set(bible.indexes.referenceIds);
  const lockIds = new Set(bible.indexes.lockIds);
  const shotTemplateIds = new Set(bible.indexes.shotTemplateIds);
  const scopedAssetTypes = new Set(bible.scope.assetTypes);
  const targetStudios = new Set(bible.project.targetStudios);
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const item of items) {
    if (!scopedAssetTypes.has(item.assetType)) {
      fail(
        "VISUAL_CONTINUITY_SCOPE_INVALID",
        `workItems.${item.id}.assetType is not enabled by the continuity bible.`,
      );
    }
    if (!targetStudios.has(item.targetStudio)) {
      fail(
        "VISUAL_CONTINUITY_SCOPE_INVALID",
        `workItems.${item.id}.targetStudio is not enabled by the continuity bible.`,
      );
    }
    assertKnownIds(item.dependsOn ?? [], itemIds, `workItems.${item.id}.dependsOn`);
    assertKnownIds(item.entityIds ?? [], entityIds, `workItems.${item.id}.entityIds`);
    assertKnownIds(item.locationIds ?? [], locationIds, `workItems.${item.id}.locationIds`);
    assertKnownIds(item.mapProfileIds ?? [], mapProfileIds, `workItems.${item.id}.mapProfileIds`);
    assertKnownIds(item.referenceIds ?? [], referenceIds, `workItems.${item.id}.referenceIds`);
    assertKnownIds(item.lockIds ?? [], lockIds, `workItems.${item.id}.lockIds`);
    if (item.shotTemplateId !== undefined) {
      assertKnownIds([item.shotTemplateId], shotTemplateIds, `workItems.${item.id}.shotTemplateId`);
      const shot = bible.shotTemplates.find((candidate) => candidate.id === item.shotTemplateId);
      if (!shot?.assetTypes.includes(item.assetType)) {
        fail(
          "VISUAL_CONTINUITY_SHOT_INVALID",
          `Shot template ${item.shotTemplateId} does not support ${item.assetType}.`,
        );
      }
    }
    for (const neighborId of [
      item.sequence?.previousWorkItemId,
      item.sequence?.nextWorkItemId,
    ]) {
      if (neighborId === undefined) continue;
      assertKnownIds([neighborId], itemIds, `workItems.${item.id}.sequence`);
      const neighbor = byId.get(neighborId);
      if (neighbor?.sequence?.sequenceId !== item.sequence?.sequenceId) {
        fail(
          "VISUAL_CONTINUITY_SEQUENCE_INVALID",
          `Sequence neighbor ${neighborId} must belong to ${item.sequence?.sequenceId}.`,
        );
      }
    }
    if (MAP_ASSET_TYPES.has(item.assetType) && (item.mapProfileIds?.length ?? 0) === 0) {
      fail(
        "VISUAL_CONTINUITY_MAP_PROFILE_REQUIRED",
        `Map work item ${item.id} requires at least one mapProfileId.`,
      );
    }
  }
  validateDag(items);
}

function inheritedContext(
  bible: CompiledVisualContinuityBible,
  item: VisualContinuityWorkItemInput,
) {
  const entities = bible.entities.filter((entity) => (item.entityIds ?? []).includes(entity.id));
  const locations = bible.locations.filter((location) => (item.locationIds ?? []).includes(location.id));
  const mapProfiles = bible.mapProfiles.filter((profile) => (item.mapProfileIds ?? []).includes(profile.id));
  const shotTemplate = item.shotTemplateId === undefined
    ? undefined
    : bible.shotTemplates.find((shot) => shot.id === item.shotTemplateId);
  const referenceIds = uniqueSorted([
    ...(item.referenceIds ?? []),
    ...entities.flatMap((entity) => entity.referenceIds),
    ...locations.flatMap((location) => location.referenceIds),
    ...mapProfiles.flatMap((profile) => profile.referenceIds),
    ...(shotTemplate?.referenceIds ?? []),
  ]);
  const lockIds = uniqueSorted([
    ...(item.lockIds ?? []),
    ...entities.flatMap((entity) => entity.lockIds),
    ...locations.flatMap((location) => location.lockIds),
    ...mapProfiles.flatMap((profile) => profile.lockIds),
    ...(shotTemplate?.lockIds ?? []),
  ]);
  return { entities, locations, mapProfiles, shotTemplate, referenceIds, lockIds };
}

function sessionTotals(
  states: readonly VisualContinuityWorkItemState[],
  attempts: number,
): CompiledVisualContinuitySession["totals"] {
  return {
    items: states.length,
    queued: states.filter((state) => state.status === "queued").length,
    repairRequired: states.filter((state) => state.status === "repair-required").length,
    accepted: states.filter((state) => state.status === "accepted").length,
    blocked: states.filter((state) => state.status === "blocked").length,
    attempts,
  };
}

export function compileVisualContinuitySession(
  bible: CompiledVisualContinuityBible,
  value: unknown,
): CompiledVisualContinuitySession {
  verifyVisualContinuityBible(bible);
  const input = record(value, "session");
  exactKeys(input, "session", [
    "schemaVersion",
    "kind",
    "sessionId",
    "bibleSha256",
    "objective",
    "mode",
    "revision",
    "iteration",
    "workItems",
    "metadata",
  ]);
  if (input.schemaVersion !== "1.0") {
    fail("VISUAL_CONTINUITY_VERSION_UNSUPPORTED", "session.schemaVersion must be 1.0.");
  }
  if (input.kind !== VISUAL_CONTINUITY_SESSION_KIND) {
    fail("VISUAL_CONTINUITY_KIND_INVALID", `session.kind must be ${VISUAL_CONTINUITY_SESSION_KIND}.`);
  }
  const submittedBibleSha = sha256Value(input.bibleSha256, "session.bibleSha256");
  if (submittedBibleSha !== bible.bibleSha256) {
    fail(
      "VISUAL_CONTINUITY_BIBLE_HASH_MISMATCH",
      "The session is not bound to the supplied continuity bible.",
    );
  }
  const iteration = record(input.iteration, "session.iteration");
  exactKeys(iteration, "session.iteration", [
    "maximumAttemptsPerItem",
    "maximumBatchSize",
    "candidateCountPerAttempt",
    "repairBeforeNewWork",
    "failClosed",
  ]);
  const normalizedItems = sortById(
    arrayValue(input.workItems, "session.workItems", 1, 10_000).map(normalizeWorkItem),
  );
  assertUnique(normalizedItems, "session.workItems", (item) => item.id);
  validateWorkReferences(bible, normalizedItems);

  const workItems = normalizedItems.map((item) => {
    const context = inheritedContext(bible, item);
    const loop = item.sequence?.loop ?? false;
    const compiled = {
      ...item,
      dependsOn: item.dependsOn ?? [],
      entityIds: item.entityIds ?? [],
      locationIds: item.locationIds ?? [],
      mapProfileIds: item.mapProfileIds ?? [],
      referenceIds: context.referenceIds,
      lockIds: context.lockIds,
      requiredMetricIds: requiredMetrics(item.assetType, item.sequence !== undefined, loop),
      blockingDetections: requiredDetections(bible, item.assetType, item.sequence !== undefined),
    };
    return freeze({
      ...compiled,
      contextSha256: hash({
        bibleSha256: bible.bibleSha256,
        item: compiled,
        style: bible.style,
        colourTokens: bible.colourTokens,
        entities: context.entities,
        locations: context.locations,
        mapProfiles: context.mapProfiles,
        shotTemplate: context.shotTemplate,
        references: bible.references.filter((reference) => context.referenceIds.includes(reference.id)),
        locks: bible.locks.filter((lock) => context.lockIds.includes(lock.id)),
      }),
    });
  });
  const states = workItems.map((item) => ({
    id: item.id,
    status: "queued" as const,
    attemptCount: 0,
  }));
  const normalized: VisualContinuitySessionInput = {
    schemaVersion: "1.0",
    kind: VISUAL_CONTINUITY_SESSION_KIND,
    sessionId: identifier(input.sessionId, "session.sessionId"),
    bibleSha256: submittedBibleSha,
    objective: text(input.objective, "session.objective", 6000),
    mode: enumValue(
      input.mode,
      "session.mode",
      ["explore", "production", "repair", "conversion", "handoff"] as const,
    ),
    revision: semverValue(input.revision, "session.revision"),
    iteration: {
      maximumAttemptsPerItem: integer(
        iteration.maximumAttemptsPerItem,
        "session.iteration.maximumAttemptsPerItem",
        1,
        100,
      ),
      maximumBatchSize: integer(
        iteration.maximumBatchSize,
        "session.iteration.maximumBatchSize",
        1,
        256,
      ),
      candidateCountPerAttempt: integer(
        iteration.candidateCountPerAttempt,
        "session.iteration.candidateCountPerAttempt",
        1,
        8,
      ),
      repairBeforeNewWork: literalTrue(
        iteration.repairBeforeNewWork,
        "session.iteration.repairBeforeNewWork",
      ),
      failClosed: literalTrue(iteration.failClosed, "session.iteration.failClosed"),
    },
    workItems: normalizedItems,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
  const unsigned = {
    ...normalized,
    protocolVersion: VISUAL_CONTINUITY_PROTOCOL_VERSION,
    bibleId: bible.bibleId,
    workItems,
    states,
    attempts: [],
    totals: sessionTotals(states, 0),
    agentContract: {
      compatibleClients: ["chatgpt", "claude", "codex"] as const,
      explicitContextEveryPacket: true as const,
      deterministicResume: true as const,
      noRelianceOnConversationMemory: true as const,
      oneBoundedOutputPerWorkItem: true as const,
      approvalIsExternal: true as const,
    },
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
  return freeze({ ...unsigned, sessionSha256: hash(unsigned) });
}

export function rebuildVisualContinuitySession(
  session: Omit<CompiledVisualContinuitySession, "sessionSha256" | "totals">,
): CompiledVisualContinuitySession {
  const totals = sessionTotals(session.states, session.attempts.length);
  const unsigned = { ...session, totals };
  return freeze({ ...unsigned, sessionSha256: hash(unsigned) });
}

export function verifyVisualContinuitySession(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
): void {
  verifyVisualContinuityBible(bible);
  if (session.protocolVersion !== VISUAL_CONTINUITY_PROTOCOL_VERSION) {
    fail("VISUAL_CONTINUITY_VERSION_UNSUPPORTED", "The visual continuity session protocol is unsupported.");
  }
  if (session.bibleSha256 !== bible.bibleSha256 || session.bibleId !== bible.bibleId) {
    fail(
      "VISUAL_CONTINUITY_BIBLE_HASH_MISMATCH",
      "The visual continuity session is bound to a different bible.",
    );
  }
  assertUnique(session.workItems, "session.workItems", (item) => item.id);
  assertUnique(session.states, "session.states", (state) => state.id);
  const itemIds = new Set(session.workItems.map((item) => item.id));
  assertKnownIds(session.states.map((state) => state.id), itemIds, "session.states");
  if (session.states.length !== session.workItems.length) {
    fail("VISUAL_CONTINUITY_STATE_INVALID", "Each work item must have exactly one state.");
  }
  for (const item of session.workItems) {
    const context = inheritedContext(bible, item);
    const expectedContextSha = hash({
      bibleSha256: bible.bibleSha256,
      item: {
        ...item,
        contextSha256: undefined,
      },
      style: bible.style,
      colourTokens: bible.colourTokens,
      entities: context.entities,
      locations: context.locations,
      mapProfiles: context.mapProfiles,
      shotTemplate: context.shotTemplate,
      references: bible.references.filter((reference) => context.referenceIds.includes(reference.id)),
      locks: bible.locks.filter((lock) => context.lockIds.includes(lock.id)),
    });
    const itemWithoutDigest = Object.fromEntries(
      Object.entries(item).filter(([key]) => key !== "contextSha256"),
    );
    const canonicalExpected = hash({
      bibleSha256: bible.bibleSha256,
      item: itemWithoutDigest,
      style: bible.style,
      colourTokens: bible.colourTokens,
      entities: context.entities,
      locations: context.locations,
      mapProfiles: context.mapProfiles,
      shotTemplate: context.shotTemplate,
      references: bible.references.filter((reference) => context.referenceIds.includes(reference.id)),
      locks: bible.locks.filter((lock) => context.lockIds.includes(lock.id)),
    });
    if (item.contextSha256 !== expectedContextSha && item.contextSha256 !== canonicalExpected) {
      fail(
        "VISUAL_CONTINUITY_CONTEXT_HASH_MISMATCH",
        `Work item ${item.id} no longer matches its continuity context.`,
      );
    }
  }
  for (const attempt of session.attempts) {
    const { attemptSha256, ...unsignedAttempt } = attempt;
    if (attemptSha256 !== hash(unsignedAttempt)) {
      fail(
        "VISUAL_CONTINUITY_ATTEMPT_HASH_MISMATCH",
        `Attempt ${attempt.workItemId}/${attempt.attemptNumber} failed hash verification.`,
      );
    }
  }
  const { sessionSha256, ...unsigned } = session;
  if (sessionSha256 !== hash(unsigned)) {
    fail(
      "VISUAL_CONTINUITY_SESSION_HASH_MISMATCH",
      "The visual continuity session does not match its deterministic SHA-256.",
    );
  }
  const expectedTotals = sessionTotals(session.states, session.attempts.length);
  if (hash(expectedTotals) !== hash(session.totals)) {
    fail("VISUAL_CONTINUITY_STATE_INVALID", "Session totals do not match work-item states.");
  }
}
