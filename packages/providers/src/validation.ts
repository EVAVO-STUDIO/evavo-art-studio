import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  PROVIDER_CAPABILITIES,
  PROVIDER_PROTOCOL_VERSION,
  PROVIDER_REFERENCE_CAPABILITY_REQUIREMENTS,
  ProviderError,
  type NormalizedProviderCandidateReference,
  type NormalizedProviderCandidateRequest,
  type ProviderAssetKind,
  type ProviderBackgroundStrategy,
  type ProviderCandidateQuality,
  type ProviderCandidateReferenceInput,
  type ProviderCandidateRequestInput,
  type ProviderContinuityPhase,
  type ProviderOperation,
  type ProviderReferenceRole,
  type ProviderTransparencyTarget,
} from "./types.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const OPERATIONS = new Set<ProviderOperation>(["generate", "edit", "inpaint"]);
const ASSET_KINDS = new Set<ProviderAssetKind>([
  "sprite-frame",
  "sprite-layer",
  "environment",
  "effect",
  "ui",
  "illustration",
  "print",
]);
const PHASES = new Set<ProviderContinuityPhase>([
  "identity-master",
  "direction-master",
  "key-pose",
  "in-between",
  "repair",
  "independent",
]);
const REFERENCE_ROLES = new Set<ProviderReferenceRole>([
  "canonical-identity",
  "direction-master",
  "previous-key-pose",
  "next-key-pose",
  "base-image",
  "mask",
  "pose-control",
  "edge-control",
  "depth-control",
  "palette-reference",
  "line-reference",
  "material-reference",
  "layer-context",
]);
const REFERENCE_ORDER: Readonly<Record<ProviderReferenceRole, number>> = {
  "canonical-identity": 0,
  "direction-master": 1,
  "base-image": 2,
  "previous-key-pose": 3,
  "next-key-pose": 4,
  "pose-control": 5,
  "edge-control": 6,
  "depth-control": 7,
  "palette-reference": 8,
  "line-reference": 9,
  "material-reference": 10,
  "layer-context": 11,
  mask: 12,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function freezeNormalizedProviderRequest<T>(
  value: T,
  seen = new WeakSet<object>(),
): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  const entries: readonly unknown[] = Array.isArray(value)
    ? value
    : Object.values(value as unknown as Record<string, unknown>);
  for (const entry of entries) {
    freezeNormalizedProviderRequest(entry, seen);
  }
  return Object.freeze(value) as T;
}

function fail(message: string): never {
  throw new ProviderError(
    "PROVIDER_CANDIDATE_REQUEST_INVALID",
    message,
    "permanent",
  );
}

function requiredString(value: unknown, name: string, maximum = 32_000): string {
  if (typeof value !== "string") fail(`${name} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0")) {
    fail(`${name} must contain 1 to ${maximum} safe characters.`);
  }
  return normalized;
}

function optionalString(
  value: unknown,
  name: string,
  maximum = 32_000,
): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, name, maximum);
}

function safeId(value: unknown, name: string): string {
  const normalized = requiredString(value, name, 128);
  if (!SAFE_ID.test(normalized)) {
    fail(`${name} must use 1 to 128 letters, digits, dots, underscores, colons or hyphens.`);
  }
  return normalized;
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== "number" ||
    !Number.isInteger(result) ||
    result < minimum ||
    result > maximum
  ) {
    fail(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return result;
}

function booleanValue(
  value: unknown,
  fallback: boolean,
  name: string,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(`${name} must be a boolean.`);
  return value;
}

function finite(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== "number" ||
    !Number.isFinite(result) ||
    result < minimum ||
    result > maximum
  ) {
    fail(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return result;
}

function strings(
  value: unknown,
  name: string,
  maximumItems = 64,
  maximumLength = 1_024,
): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail(`${name} must contain at most ${maximumItems} strings.`);
  }
  return [
    ...new Set(
      value.map((entry, index) =>
        requiredString(entry, `${name}[${index}]`, maximumLength),
      ),
    ),
  ];
}

function dimensions(
  value: unknown,
  name: string,
): Readonly<{ width: number; height: number }> {
  if (!isRecord(value)) fail(`${name} must be an object.`);
  return {
    width: integer(value.width, 0, 1, 8_192, `${name}.width`),
    height: integer(value.height, 0, 1, 8_192, `${name}.height`),
  };
}

function artifactId(value: unknown, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(`${name} must use artifact_<sha256> format.`);
  }
  return value as ArtifactId;
}

function reference(
  value: unknown,
  index: number,
): NormalizedProviderCandidateReference {
  const name = `references[${index}]`;
  if (!isRecord(value)) fail(`${name} must be an object.`);
  if (
    typeof value.role !== "string" ||
    !REFERENCE_ROLES.has(value.role as ProviderReferenceRole)
  ) {
    fail(`${name}.role is not supported.`);
  }
  const note = optionalString(value.note, `${name}.note`, 512);
  return {
    artifactId: artifactId(value.artifactId, `${name}.artifactId`),
    role: value.role as ProviderReferenceRole,
    strength: finite(value.strength, 1, 0, 2, `${name}.strength`),
    required: booleanValue(value.required, true, `${name}.required`),
    ...(note === undefined ? {} : { note }),
  };
}

function references(
  value: unknown,
): readonly NormalizedProviderCandidateReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 16) {
    fail("references must contain at most 16 entries.");
  }
  const result = value.map(reference);
  const seen = new Set<string>();
  for (const entry of result) {
    const key = `${entry.role}\0${entry.artifactId}`;
    if (seen.has(key)) fail(`Duplicate provider reference: ${entry.role}.`);
    seen.add(key);
  }
  return result.sort(
    (left, right) =>
      REFERENCE_ORDER[left.role] - REFERENCE_ORDER[right.role] ||
      left.artifactId.localeCompare(right.artifactId),
  );
}

function hasRole(
  values: readonly NormalizedProviderCandidateReference[],
  role: ProviderReferenceRole,
): boolean {
  return values.some((entry) => entry.role === role);
}

function hasRequiredRole(
  values: readonly NormalizedProviderCandidateReference[],
  role: ProviderReferenceRole,
): boolean {
  return values.some((entry) => entry.role === role && entry.required);
}

function enumValue<T extends string>(
  value: unknown,
  values: ReadonlySet<T>,
  name: string,
): T {
  if (typeof value !== "string" || !values.has(value as T)) {
    fail(`${name} is not supported.`);
  }
  return value as T;
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

export function providerRequestSha256(
  request: NormalizedProviderCandidateRequest,
): string {
  return sha256(stableStringify(normalizeJson(request)));
}

export function validateProviderCandidateRequest(
  input: unknown,
): NormalizedProviderCandidateRequest {
  if (!isRecord(input)) fail("Provider candidate request must be an object.");
  if (input.schemaVersion !== "1.0") {
    fail('schemaVersion must be "1.0".');
  }

  const operation = enumValue(
    input.operation,
    OPERATIONS,
    "operation",
  );
  const assetKind = enumValue(
    input.assetKind,
    ASSET_KINDS,
    "assetKind",
  );
  const continuityPhase = enumValue(
    input.continuityPhase,
    PHASES,
    "continuityPhase",
  );
  const assetIdValue = safeId(input.assetId, "assetId");
  const candidateFamilyId = safeId(
    input.candidateFamilyId,
    "candidateFamilyId",
  );
  const frameId =
    input.frameId === undefined ? undefined : safeId(input.frameId, "frameId");
  const layerId =
    input.layerId === undefined ? undefined : safeId(input.layerId, "layerId");
  const creativeIntent = requiredString(
    input.creativeIntent,
    "creativeIntent",
  );
  const negativeIntent = optionalString(
    input.negativeIntent,
    "negativeIntent",
  );

  if (!isRecord(input.style)) fail("style must be an object.");
  if (!isRecord(input.shot)) fail("shot must be an object.");
  if (!isRecord(input.target)) fail("target must be an object.");

  const transparency = enumValue(
    input.target.transparency,
    new Set<ProviderTransparencyTarget>(["required", "preferred", "opaque"]),
    "target.transparency",
  );
  const outputFormat =
    input.target.outputFormat === undefined
      ? "png"
      : enumValue(
          input.target.outputFormat,
          new Set(["png", "webp", "jpeg"] as const),
          "target.outputFormat",
        );
  if (transparency === "required" && outputFormat !== "png") {
    fail("Transparency-required targets must retain a PNG master.");
  }

  const backgroundInput = isRecord(input.background) ? input.background : {};
  const strategy =
    backgroundInput.strategy === undefined
      ? transparency === "opaque"
        ? "opaque-source"
        : "chroma-key"
      : enumValue(
          backgroundInput.strategy,
          new Set<ProviderBackgroundStrategy>([
            "native-alpha",
            "chroma-key",
            "opaque-source",
            "provider-auto",
          ]),
          "background.strategy",
        );
  const matteColour = optionalString(
    backgroundInput.matteColour,
    "background.matteColour",
    7,
  );
  if (matteColour !== undefined && !HEX_COLOUR.test(matteColour)) {
    fail("background.matteColour must use #RRGGBB format.");
  }
  if (strategy === "chroma-key" && !matteColour) {
    fail("Chroma-key candidates require an explicit matteColour.");
  }
  if (transparency === "required" && strategy === "opaque-source") {
    fail("A transparency-required target cannot use opaque-source strategy.");
  }

  const normalizedReferences = references(input.references);
  const lockedSprite =
    (assetKind === "sprite-frame" || assetKind === "sprite-layer") &&
    continuityPhase !== "independent" &&
    continuityPhase !== "identity-master";
  if (lockedSprite && !hasRequiredRole(normalizedReferences, "canonical-identity")) {
    fail("Continuity-locked sprite work requires canonical-identity as a required reference.");
  }
  if (
    continuityPhase === "in-between" &&
    (!hasRequiredRole(normalizedReferences, "previous-key-pose") ||
      !hasRequiredRole(normalizedReferences, "next-key-pose"))
  ) {
    fail("In-between frames require previous-key-pose and next-key-pose as required references.");
  }
  if (operation === "inpaint") {
    if (!hasRequiredRole(normalizedReferences, "base-image")) {
      fail("Inpaint requests require base-image as a required reference.");
    }
    const masks = normalizedReferences.filter((entry) => entry.role === "mask");
    if (masks.length !== 1 || masks[0]?.required !== true) {
      fail("Inpaint requests require exactly one required mask reference.");
    }
  } else if (hasRole(normalizedReferences, "mask")) {
    fail("Mask references are only valid for inpaint requests.");
  }
  if (
    operation === "edit" &&
    !normalizedReferences.some((entry) => entry.role !== "mask")
  ) {
    fail("Edit requests require at least one image reference.");
  }

  const selectionInput = isRecord(input.selection) ? input.selection : {};
  const allowedAdapterIds = strings(
    selectionInput.allowedAdapterIds,
    "selection.allowedAdapterIds",
    32,
    128,
  ).map((entry) => safeId(entry, "selection.allowedAdapterId"));
  const preferredAdapterId =
    selectionInput.preferredAdapterId === undefined
      ? undefined
      : safeId(selectionInput.preferredAdapterId, "selection.preferredAdapterId");
  if (
    preferredAdapterId &&
    allowedAdapterIds.length > 0 &&
    !allowedAdapterIds.includes(preferredAdapterId)
  ) {
    fail("preferredAdapterId must be present in allowedAdapterIds when an allow-list is used.");
  }

  const sourceCanvas =
    input.sourceCanvas === undefined
      ? undefined
      : dimensions(input.sourceCanvas, "sourceCanvas");
  const metadata = normalizeMetadata(input.metadata);
  const base = {
    schemaVersion: "1.0" as const,
    protocolVersion: PROVIDER_PROTOCOL_VERSION,
    operation,
    assetKind,
    continuityPhase,
    assetId: assetIdValue,
    candidateFamilyId,
    ...(frameId === undefined ? {} : { frameId }),
    ...(layerId === undefined ? {} : { layerId }),
    creativeIntent,
    ...(negativeIntent === undefined ? {} : { negativeIntent }),
    style: {
      styleName: requiredString(input.style.styleName, "style.styleName", 256),
      intent: requiredString(input.style.intent, "style.intent"),
      mustHave: strings(input.style.mustHave, "style.mustHave"),
      mustAvoid: strings(input.style.mustAvoid, "style.mustAvoid"),
      identityLocks: strings(input.style.identityLocks, "style.identityLocks"),
      palette: strings(input.style.palette, "style.palette"),
      lineTreatment: strings(input.style.lineTreatment, "style.lineTreatment"),
      materials: strings(input.style.materials, "style.materials"),
      cameraRules: strings(input.style.cameraRules, "style.cameraRules"),
      compositionRules: strings(
        input.style.compositionRules,
        "style.compositionRules",
      ),
      eraRules: strings(input.style.eraRules, "style.eraRules"),
    },
    shot: {
      subject: requiredString(input.shot.subject, "shot.subject", 2_048),
      ...(input.shot.action === undefined
        ? {}
        : { action: requiredString(input.shot.action, "shot.action", 2_048) }),
      ...(input.shot.direction === undefined
        ? {}
        : {
            direction: requiredString(
              input.shot.direction,
              "shot.direction",
              256,
            ),
          }),
      include: strings(input.shot.include, "shot.include"),
      exclude: strings(input.shot.exclude, "shot.exclude"),
      separateAssets: strings(
        input.shot.separateAssets,
        "shot.separateAssets",
      ),
      framing: strings(input.shot.framing, "shot.framing"),
    },
    target: {
      ...dimensions(input.target, "target"),
      transparency,
      outputFormat,
    },
    ...(sourceCanvas === undefined ? {} : { sourceCanvas }),
    background: {
      strategy,
      ...(matteColour === undefined
        ? {}
        : { matteColour: matteColour.toLowerCase() }),
    },
    quality:
      input.quality === undefined
        ? ("standard" as const)
        : enumValue(
            input.quality,
            new Set<ProviderCandidateQuality>(["draft", "standard", "high"]),
            "quality",
          ),
    candidateCount: integer(
      input.candidateCount,
      4,
      1,
      8,
      "candidateCount",
    ),
    ...(input.seed === undefined
      ? {}
      : {
          seed: integer(
            input.seed,
            0,
            0,
            4_294_967_295,
            "seed",
          ),
        }),
    references: normalizedReferences,
    selection: {
      ...(preferredAdapterId === undefined ? {} : { preferredAdapterId }),
      ...(selectionInput.preferredModel === undefined
        ? {}
        : {
            preferredModel: safeId(
              selectionInput.preferredModel,
              "selection.preferredModel",
            ),
          }),
      allowedAdapterIds,
      allowFallback: selectionInput.allowFallback === true,
      requireSeed: selectionInput.requireSeed === true,
    },
    ...(metadata === undefined ? {} : { metadata }),
  };

  const deterministicId = `provider_${sha256(
    stableStringify(normalizeJson(base)),
  ).slice(0, 40)}`;
  const requestId =
    input.requestId === undefined
      ? deterministicId
      : safeId(input.requestId, "requestId");

  const request = { ...base, requestId } as NormalizedProviderCandidateRequest;
  return freezeNormalizedProviderRequest(request);
}

export function providerProtocolSummary(): JsonValue {
  return {
    schemaVersion: "1.0",
    protocolVersion: PROVIDER_PROTOCOL_VERSION,
    operations: [...OPERATIONS],
    assetKinds: [...ASSET_KINDS],
    continuityPhases: [...PHASES],
    referenceRoles: [...REFERENCE_ROLES],
    capabilityVocabulary: PROVIDER_CAPABILITIES,
    requiredReferenceCapabilities: PROVIDER_REFERENCE_CAPABILITY_REQUIREMENTS,
    rules: [
      "Provider outputs are intermediate candidates, never final deliverables.",
      "Every required semantic reference role adds its declared adapter capability to provider selection.",
      "Required pose, edge and depth controls are structural controls and cannot be satisfied by generic reference-image capability alone.",
      "Continuity-locked sprite work requires a canonical identity reference.",
      "In-between frames require both neighbouring key poses.",
      "Inpaint work requires one base image and one mask.",
      "Transparency-required output must retain a PNG master.",
    ],
  };
}
