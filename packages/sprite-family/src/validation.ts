import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  SPRITE_FAMILY_PROTOCOL_VERSION,
  SpriteFamilyError,
  type NormalizedSpriteFamilyFrame,
  type NormalizedSpriteFamilyFrameLayer,
  type NormalizedSpriteFamilyLayerDefinition,
  type NormalizedSpriteFamilyManifest,
  type NormalizedSpriteFamilyPolicy,
  type SpriteFamilyFrameInput,
  type SpriteFamilyLayerDefinitionInput,
  type SpriteFamilyManifestInput,
  type SpriteLayerBlendMode,
  type SpriteLayerRole,
  type SpriteLayerSourcePolicy,
} from "./types.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ROLES = new Set<SpriteLayerRole>([
  "identity-core",
  "costume",
  "hair",
  "shadow",
  "equipment",
  "weapon",
  "effect",
  "emission",
  "normal",
  "collision",
  "occlusion",
  "guide",
]);
const SOURCE_POLICIES = new Set<SpriteLayerSourcePolicy>([
  "per-frame",
  "linked-cel",
  "static-family",
  "engine-sidecar",
  "guide-only",
]);
const BLEND_MODES = new Set<SpriteLayerBlendMode>([
  "normal",
  "add",
  "multiply",
  "screen",
]);
const DEFAULT_IDENTITY_ROLES = new Set<SpriteLayerRole>([
  "identity-core",
  "costume",
  "hair",
  "equipment",
  "weapon",
]);
const DEFAULT_SEPARATE_ROLES = new Set<SpriteLayerRole>([
  "shadow",
  "equipment",
  "weapon",
  "effect",
  "emission",
  "occlusion",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(message: string, details?: JsonValue): never {
  throw new SpriteFamilyError(
    "SPRITE_FAMILY_MANIFEST_INVALID",
    message,
    details,
  );
}

function requiredString(
  value: unknown,
  name: string,
  maximum = 1_024,
): string {
  if (typeof value !== "string") fail(`${name} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0")) {
    fail(`${name} must contain 1 to ${maximum} safe characters.`);
  }
  return normalized;
}

function safeId(value: unknown, name: string): string {
  const normalized = requiredString(value, name, 128);
  if (!SAFE_ID.test(normalized)) {
    fail(`${name} must use letters, digits, dots, underscores, colons or hyphens.`);
  }
  return normalized;
}

function artifactId(value: unknown, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(`${name} must use artifact_<sha256> format.`);
  }
  return value as ArtifactId;
}

function finite(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const resolved = value === undefined ? fallback : value;
  if (
    typeof resolved !== "number" ||
    !Number.isFinite(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    fail(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return resolved;
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const resolved = finite(value, fallback, minimum, maximum, name);
  if (!Number.isInteger(resolved)) fail(`${name} must be an integer.`);
  return resolved;
}

function boolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(`${name} must be boolean.`);
  return value;
}

function point(
  value: unknown,
  name: string,
  bounds: Readonly<{ width: number; height: number }>,
  allowNegative = false,
): Readonly<{ x: number; y: number }> {
  if (!isRecord(value)) fail(`${name} must contain x and y.`);
  const minimumX = allowNegative ? -bounds.width : 0;
  const minimumY = allowNegative ? -bounds.height : 0;
  const maximumX = allowNegative ? bounds.width : bounds.width;
  const maximumY = allowNegative ? bounds.height : bounds.height;
  return {
    x: integer(value.x, 0, minimumX, maximumX, `${name}.x`),
    y: integer(value.y, 0, minimumY, maximumY, `${name}.y`),
  };
}

function strings(value: unknown, name: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) {
    fail(`${name} must contain at most 64 layer ids.`);
  }
  const result = value.map((entry, index) =>
    safeId(entry, `${name}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    fail(`${name} must not contain duplicates.`);
  }
  return [...result].sort();
}

function normalizeMetadata(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  try {
    return normalizeJson(value);
  } catch (error: unknown) {
    fail(
      `metadata must be JSON compatible: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function normalizePolicy(
  value: unknown,
): NormalizedSpriteFamilyPolicy {
  if (!isRecord(value)) fail("policy must be an object.");
  return {
    identityReferenceFrameId: safeId(
      value.identityReferenceFrameId,
      "policy.identityReferenceFrameId",
    ),
    requireDeclaredComposite: boolean(
      value.requireDeclaredComposite,
      true,
      "policy.requireDeclaredComposite",
    ),
    requireReferenceLineage: boolean(
      value.requireReferenceLineage,
      true,
      "policy.requireReferenceLineage",
    ),
    requireQualityPassed: boolean(
      value.requireQualityPassed,
      true,
      "policy.requireQualityPassed",
    ),
    alphaVisibleThreshold: integer(
      value.alphaVisibleThreshold,
      8,
      1,
      255,
      "policy.alphaVisibleThreshold",
    ),
    maximumInputBytes: integer(
      value.maximumInputBytes,
      64 * 1024 * 1024,
      1_024,
      512 * 1024 * 1024,
      "policy.maximumInputBytes",
    ),
    maximumPixels: integer(
      value.maximumPixels,
      16_777_216,
      1,
      67_108_864,
      "policy.maximumPixels",
    ),
    maximumFrames: integer(
      value.maximumFrames,
      512,
      1,
      4_096,
      "policy.maximumFrames",
    ),
    decodeConcurrency: integer(
      value.decodeConcurrency,
      4,
      1,
      16,
      "policy.decodeConcurrency",
    ),
    maximumTranslationPixels: integer(
      value.maximumTranslationPixels,
      8,
      0,
      64,
      "policy.maximumTranslationPixels",
    ),
    maximumEdgeDistancePixels: finite(
      value.maximumEdgeDistancePixels,
      16,
      1,
      256,
      "policy.maximumEdgeDistancePixels",
    ),
    pivotTolerancePixels: finite(
      value.pivotTolerancePixels,
      1,
      0,
      128,
      "policy.pivotTolerancePixels",
    ),
    baselineTolerancePixels: finite(
      value.baselineTolerancePixels,
      1,
      0,
      128,
      "policy.baselineTolerancePixels",
    ),
    groundContactTolerancePixels: finite(
      value.groundContactTolerancePixels,
      1,
      0,
      128,
      "policy.groundContactTolerancePixels",
    ),
    minimumCanonicalVisibleAreaSimilarity: finite(
      value.minimumCanonicalVisibleAreaSimilarity,
      0.62,
      0,
      1,
      "policy.minimumCanonicalVisibleAreaSimilarity",
    ),
    minimumCanonicalPaletteSimilarity: finite(
      value.minimumCanonicalPaletteSimilarity,
      0.5,
      0,
      1,
      "policy.minimumCanonicalPaletteSimilarity",
    ),
    minimumCanonicalCentroidSimilarity: finite(
      value.minimumCanonicalCentroidSimilarity,
      0.55,
      0,
      1,
      "policy.minimumCanonicalCentroidSimilarity",
    ),
    minimumAdjacentVisibleAreaSimilarity: finite(
      value.minimumAdjacentVisibleAreaSimilarity,
      0.68,
      0,
      1,
      "policy.minimumAdjacentVisibleAreaSimilarity",
    ),
    minimumAdjacentPaletteSimilarity: finite(
      value.minimumAdjacentPaletteSimilarity,
      0.58,
      0,
      1,
      "policy.minimumAdjacentPaletteSimilarity",
    ),
    minimumAdjacentCentroidSimilarity: finite(
      value.minimumAdjacentCentroidSimilarity,
      0.6,
      0,
      1,
      "policy.minimumAdjacentCentroidSimilarity",
    ),
    minimumLoopClosureSimilarity: finite(
      value.minimumLoopClosureSimilarity,
      0.52,
      0,
      1,
      "policy.minimumLoopClosureSimilarity",
    ),
    compositeChannelTolerance: integer(
      value.compositeChannelTolerance,
      1,
      0,
      255,
      "policy.compositeChannelTolerance",
    ),
    maximumCompositeMeanError: finite(
      value.maximumCompositeMeanError,
      0.5,
      0,
      255,
      "policy.maximumCompositeMeanError",
    ),
    maximumCompositeMismatchFraction: finite(
      value.maximumCompositeMismatchFraction,
      0.001,
      0,
      1,
      "policy.maximumCompositeMismatchFraction",
    ),
  };
}

function layerDefinition(
  value: unknown,
  index: number,
): NormalizedSpriteFamilyLayerDefinition {
  const name = `layerDefinitions[${index}]`;
  if (!isRecord(value)) fail(`${name} must be an object.`);
  if (typeof value.role !== "string" || !ROLES.has(value.role as SpriteLayerRole)) {
    fail(`${name}.role is not supported.`);
  }
  if (
    typeof value.sourcePolicy !== "string" ||
    !SOURCE_POLICIES.has(value.sourcePolicy as SpriteLayerSourcePolicy)
  ) {
    fail(`${name}.sourcePolicy is not supported.`);
  }
  const role = value.role as SpriteLayerRole;
  const sourcePolicy = value.sourcePolicy as SpriteLayerSourcePolicy;
  const defaultComposite =
    sourcePolicy !== "engine-sidecar" && sourcePolicy !== "guide-only";
  const contributesToComposite = boolean(
    value.contributesToComposite,
    defaultComposite,
    `${name}.contributesToComposite`,
  );
  const contributesToIdentity = boolean(
    value.contributesToIdentity,
    defaultComposite && DEFAULT_IDENTITY_ROLES.has(role),
    `${name}.contributesToIdentity`,
  );
  const mustRemainSeparate = boolean(
    value.mustRemainSeparate,
    defaultComposite && DEFAULT_SEPARATE_ROLES.has(role),
    `${name}.mustRemainSeparate`,
  );
  if (
    (sourcePolicy === "engine-sidecar" || sourcePolicy === "guide-only") &&
    (contributesToComposite || contributesToIdentity)
  ) {
    fail(
      `${name} uses ${sourcePolicy} and cannot contribute to colour or identity composites.`,
    );
  }
  if (mustRemainSeparate && !contributesToComposite) {
    fail(`${name}.mustRemainSeparate requires contributesToComposite=true.`);
  }
  const blendMode =
    value.blendMode === undefined
      ? "normal"
      : typeof value.blendMode === "string" &&
          BLEND_MODES.has(value.blendMode as SpriteLayerBlendMode)
        ? (value.blendMode as SpriteLayerBlendMode)
        : fail(`${name}.blendMode is not supported.`);
  return {
    id: safeId(value.id, `${name}.id`),
    role,
    sourcePolicy,
    required: boolean(value.required, role === "identity-core", `${name}.required`),
    contributesToComposite,
    contributesToIdentity,
    mustRemainSeparate,
    zIndex: integer(value.zIndex, 0, -10_000, 10_000, `${name}.zIndex`),
    blendMode,
    minimumVisibleFraction: finite(
      value.minimumVisibleFraction,
      contributesToComposite ? 0.005 : 0,
      0,
      1,
      `${name}.minimumVisibleFraction`,
    ),
    registrationTolerancePixels: finite(
      value.registrationTolerancePixels,
      sourcePolicy === "linked-cel" || sourcePolicy === "static-family" ? 0 : 8,
      0,
      256,
      `${name}.registrationTolerancePixels`,
    ),
    allowedOccludedBy: strings(value.allowedOccludedBy, `${name}.allowedOccludedBy`),
    occludes: strings(value.occludes, `${name}.occludes`),
  };
}

function frameLayer(
  value: unknown,
  frameIndex: number,
  layerIndex: number,
  canvas: Readonly<{ width: number; height: number }>,
): NormalizedSpriteFamilyFrameLayer {
  const name = `frames[${frameIndex}].layers[${layerIndex}]`;
  if (!isRecord(value)) fail(`${name} must be an object.`);
  const linkedFromFrameId =
    value.linkedFromFrameId === undefined
      ? undefined
      : safeId(value.linkedFromFrameId, `${name}.linkedFromFrameId`);
  const variantId =
    value.variantId === undefined
      ? undefined
      : safeId(value.variantId, `${name}.variantId`);
  return {
    layerId: safeId(value.layerId, `${name}.layerId`),
    artifactId: artifactId(value.artifactId, `${name}.artifactId`),
    offset:
      value.offset === undefined
        ? { x: 0, y: 0 }
        : point(value.offset, `${name}.offset`, canvas, true),
    opacity: finite(value.opacity, 1, 0, 1, `${name}.opacity`),
    ...(linkedFromFrameId === undefined ? {} : { linkedFromFrameId }),
    ...(variantId === undefined ? {} : { variantId }),
  };
}

function frame(
  value: unknown,
  index: number,
  canvas: Readonly<{ width: number; height: number }>,
): NormalizedSpriteFamilyFrame {
  const name = `frames[${index}]`;
  if (!isRecord(value)) fail(`${name} must be an object.`);
  if (!Array.isArray(value.layers) || !value.layers.length || value.layers.length > 64) {
    fail(`${name}.layers must contain 1 to 64 layer instances.`);
  }
  const layers = value.layers.map((entry, layerIndex) =>
    frameLayer(entry, index, layerIndex, canvas),
  );
  if (new Set(layers.map((entry) => entry.layerId)).size !== layers.length) {
    fail(`${name}.layers must not repeat a layerId.`);
  }
  const baseline =
    value.baseline === undefined
      ? undefined
      : finite(value.baseline, 0, 0, canvas.height, `${name}.baseline`);
  const declaredCompositeArtifactId =
    value.declaredCompositeArtifactId === undefined
      ? undefined
      : artifactId(
          value.declaredCompositeArtifactId,
          `${name}.declaredCompositeArtifactId`,
        );
  const intentionalDuplicateOf =
    value.intentionalDuplicateOf === undefined
      ? undefined
      : safeId(value.intentionalDuplicateOf, `${name}.intentionalDuplicateOf`);
  return {
    id: safeId(value.id, `${name}.id`),
    animation: safeId(value.animation, `${name}.animation`),
    direction: safeId(value.direction, `${name}.direction`),
    frameIndex: integer(
      value.frameIndex,
      0,
      0,
      100_000,
      `${name}.frameIndex`,
    ),
    globalFrameIndex: integer(
      value.globalFrameIndex,
      0,
      0,
      1_000_000,
      `${name}.globalFrameIndex`,
    ),
    durationMs: finite(value.durationMs, 0, 0.001, 3_600_000, `${name}.durationMs`),
    pivot: point(value.pivot, `${name}.pivot`, canvas),
    ...(baseline === undefined ? {} : { baseline }),
    groundContact: boolean(value.groundContact, false, `${name}.groundContact`),
    layers: layers.sort((left, right) => left.layerId.localeCompare(right.layerId)),
    ...(declaredCompositeArtifactId === undefined
      ? {}
      : { declaredCompositeArtifactId }),
    ...(intentionalDuplicateOf === undefined ? {} : { intentionalDuplicateOf }),
  };
}

function validateDefinitionReferences(
  definitions: readonly NormalizedSpriteFamilyLayerDefinition[],
): void {
  const byId = new Map(definitions.map((entry) => [entry.id, entry]));
  for (const definition of definitions) {
    for (const target of definition.allowedOccludedBy) {
      const other = byId.get(target);
      if (!other) fail(`${definition.id}.allowedOccludedBy references unknown ${target}.`);
      if (target === definition.id) fail(`${definition.id} cannot occlude itself.`);
      if (other.zIndex <= definition.zIndex) {
        fail(`${target} must have a greater zIndex to occlude ${definition.id}.`);
      }
    }
    for (const target of definition.occludes) {
      const other = byId.get(target);
      if (!other) fail(`${definition.id}.occludes references unknown ${target}.`);
      if (target === definition.id) fail(`${definition.id} cannot occlude itself.`);
      if (definition.zIndex <= other.zIndex) {
        fail(`${definition.id} must have a greater zIndex to occlude ${target}.`);
      }
    }
  }
}

function validateFrames(
  frames: readonly NormalizedSpriteFamilyFrame[],
  definitions: readonly NormalizedSpriteFamilyLayerDefinition[],
  policy: NormalizedSpriteFamilyPolicy,
): void {
  const byFrame = new Map(frames.map((entry) => [entry.id, entry]));
  const byDefinition = new Map(definitions.map((entry) => [entry.id, entry]));
  if (!byFrame.has(policy.identityReferenceFrameId)) {
    fail("policy.identityReferenceFrameId does not reference a frame.");
  }
  const staticValues = new Map<
    string,
    Readonly<{ artifactId: ArtifactId; offsetX: number; offsetY: number; opacity: number }>
  >();
  for (const frameValue of frames) {
    if (policy.requireDeclaredComposite && !frameValue.declaredCompositeArtifactId) {
      fail(`${frameValue.id} requires declaredCompositeArtifactId.`);
    }
    if (frameValue.intentionalDuplicateOf) {
      if (frameValue.intentionalDuplicateOf === frameValue.id) {
        fail(`${frameValue.id} cannot duplicate itself.`);
      }
      if (!byFrame.has(frameValue.intentionalDuplicateOf)) {
        fail(`${frameValue.id}.intentionalDuplicateOf references an unknown frame.`);
      }
    }
    const instances = new Map(frameValue.layers.map((entry) => [entry.layerId, entry]));
    for (const definition of definitions) {
      if (definition.required && !instances.has(definition.id)) {
        fail(`${frameValue.id} is missing required layer ${definition.id}.`);
      }
    }
    for (const instance of frameValue.layers) {
      const definition = byDefinition.get(instance.layerId);
      if (!definition) {
        fail(`${frameValue.id} references unknown layer ${instance.layerId}.`);
      }
      if (
        definition.sourcePolicy !== "linked-cel" &&
        instance.linkedFromFrameId !== undefined
      ) {
        fail(
          `${frameValue.id}.${instance.layerId} may link only when sourcePolicy=linked-cel.`,
        );
      }
      if (instance.linkedFromFrameId) {
        const sourceFrame = byFrame.get(instance.linkedFromFrameId);
        if (!sourceFrame) {
          fail(
            `${frameValue.id}.${instance.layerId} links from unknown frame ${instance.linkedFromFrameId}.`,
          );
        }
        const sourceLayer = sourceFrame.layers.find(
          (entry) => entry.layerId === instance.layerId,
        );
        if (!sourceLayer) {
          fail(
            `${frameValue.id}.${instance.layerId} links from a frame without that layer.`,
          );
        }
        if (
          sourceLayer.artifactId !== instance.artifactId ||
          sourceLayer.offset.x !== instance.offset.x ||
          sourceLayer.offset.y !== instance.offset.y ||
          sourceLayer.opacity !== instance.opacity
        ) {
          fail(
            `${frameValue.id}.${instance.layerId} linked cel must reuse artifact, offset and opacity exactly.`,
          );
        }
      }
      if (definition.sourcePolicy === "static-family") {
        const existing = staticValues.get(definition.id);
        const current = {
          artifactId: instance.artifactId,
          offsetX: instance.offset.x,
          offsetY: instance.offset.y,
          opacity: instance.opacity,
        };
        if (!existing) staticValues.set(definition.id, current);
        else if (
          existing.artifactId !== current.artifactId ||
          existing.offsetX !== current.offsetX ||
          existing.offsetY !== current.offsetY ||
          existing.opacity !== current.opacity
        ) {
          fail(
            `${definition.id} is static-family but changes artifact, offset or opacity.`,
          );
        }
      }
    }
  }

  const groups = new Map<string, NormalizedSpriteFamilyFrame[]>();
  for (const frameValue of frames) {
    const key = `${frameValue.animation}\0${frameValue.direction}`;
    const group = groups.get(key) ?? [];
    group.push(frameValue);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const ordered = [...group].sort(
      (left, right) => left.frameIndex - right.frameIndex,
    );
    for (let index = 0; index < ordered.length; index += 1) {
      if (ordered[index]!.frameIndex !== index) {
        fail(
          `${key.replace("\0", "/")} frameIndex values must be contiguous from zero.`,
        );
      }
    }
  }
}

export function spriteFamilyManifestSha256(
  manifest: NormalizedSpriteFamilyManifest,
): string {
  return sha256(stableStringify(normalizeJson(manifest)));
}

export function validateSpriteFamilyManifest(
  input: unknown,
): NormalizedSpriteFamilyManifest {
  if (!isRecord(input)) fail("Sprite family manifest must be an object.");
  if (input.schemaVersion !== "1.0") fail('schemaVersion must be "1.0".');
  if (!isRecord(input.canvas)) fail("canvas must be an object.");
  const canvas = {
    width: integer(input.canvas.width, 0, 1, 8_192, "canvas.width"),
    height: integer(input.canvas.height, 0, 1, 8_192, "canvas.height"),
  };
  const policy = normalizePolicy(input.policy);
  if (
    !Array.isArray(input.layerDefinitions) ||
    !input.layerDefinitions.length ||
    input.layerDefinitions.length > 64
  ) {
    fail("layerDefinitions must contain 1 to 64 definitions.");
  }
  const definitions = input.layerDefinitions.map(layerDefinition);
  if (new Set(definitions.map((entry) => entry.id)).size !== definitions.length) {
    fail("layerDefinitions must use unique ids.");
  }
  if (!definitions.some((entry) => entry.contributesToComposite)) {
    fail("At least one layer must contribute to the colour composite.");
  }
  if (!definitions.some((entry) => entry.contributesToIdentity)) {
    fail("At least one layer must contribute to the identity composite.");
  }
  validateDefinitionReferences(definitions);
  if (
    !Array.isArray(input.frames) ||
    !input.frames.length ||
    input.frames.length > policy.maximumFrames
  ) {
    fail(`frames must contain 1 to ${policy.maximumFrames} frames.`);
  }
  const frames = input.frames.map((entry, index) => frame(entry, index, canvas));
  if (new Set(frames.map((entry) => entry.id)).size !== frames.length) {
    fail("frames must use unique ids.");
  }
  if (
    new Set(frames.map((entry) => entry.globalFrameIndex)).size !== frames.length
  ) {
    fail("frames must use unique globalFrameIndex values.");
  }
  validateFrames(frames, definitions, policy);
  const metadata = normalizeMetadata(input.metadata);
  return {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_FAMILY_PROTOCOL_VERSION,
    familyId: safeId(input.familyId, "familyId"),
    canvas,
    layerDefinitions: [...definitions].sort(
      (left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id),
    ),
    frames: [...frames].sort(
      (left, right) =>
        left.globalFrameIndex - right.globalFrameIndex ||
        left.id.localeCompare(right.id),
    ),
    policy,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function spriteFamilyProtocolSummary(): JsonValue {
  return {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_FAMILY_PROTOCOL_VERSION,
    layerRoles: [...ROLES],
    sourcePolicies: [...SOURCE_POLICIES],
    blendModes: [...BLEND_MODES],
    rules: [
      "Every required layer must be present in every frame.",
      "Linked cels reuse the exact artifact, offset and opacity of their source frame.",
      "Family-static layers cannot drift between frames.",
      "Engine sidecars and guides cannot leak into the colour or identity composite.",
      "Required separate layers must make a visible, measurable composite contribution.",
      "Generated layer composites are compared with declared composites before atlas delivery.",
      "Family verification writes evidence and unapproved composites; it never approves an asset.",
    ],
  };
}
