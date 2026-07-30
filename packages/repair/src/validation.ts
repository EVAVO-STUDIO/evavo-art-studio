import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  TARGETED_REPAIR_PROTOCOL_VERSION,
  TargetedRepairError,
  type NormalizedTargetedRepairReference,
  type NormalizedTargetedRepairRequest,
  type TargetedRepairReferenceRole,
  type TargetedRepairRequestInput,
} from "./types.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REFERENCE_ROLES = new Set<TargetedRepairReferenceRole>([
  "canonical-identity",
  "direction-master",
  "previous-key-pose",
  "next-key-pose",
  "palette-reference",
  "line-reference",
  "material-reference",
]);
const BACKGROUND_STRATEGIES = new Set([
  "native-alpha",
  "chroma-key",
  "opaque-source",
  "provider-auto",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(message: string, details?: JsonValue): never {
  throw new TargetedRepairError(
    "TARGETED_REPAIR_REQUEST_INVALID",
    message,
    details,
  );
}

function safeId(value: unknown, name: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value.trim())) {
    fail(`${name} must use 1 to 128 letters, digits, dots, underscores, colons or hyphens.`);
  }
  return value.trim();
}

function requiredText(value: unknown, name: string, maximum = 4_096): string {
  if (typeof value !== "string") fail(`${name} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0")) {
    fail(`${name} must contain 1 to ${maximum} safe characters.`);
  }
  return normalized;
}

function artifactId(value: unknown, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(`${name} must use artifact_<sha256> format.`);
  }
  return value as ArtifactId;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const resolved = value === undefined ? fallback : value;
  if (
    typeof resolved !== "number" ||
    !Number.isInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    fail(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return resolved;
}

function stringList(
  value: unknown,
  name: string,
  maximumItems: number,
  maximumLength = 512,
): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail(`${name} must contain no more than ${maximumItems} strings.`);
  }
  const result = value.map((entry, index) =>
    requiredText(entry, `${name}[${index}]`, maximumLength),
  );
  return [...new Set(result)];
}

function reference(
  value: unknown,
  index: number,
): NormalizedTargetedRepairReference {
  if (!isRecord(value)) fail(`references[${index}] must be an object.`);
  if (
    typeof value.role !== "string" ||
    !REFERENCE_ROLES.has(value.role as TargetedRepairReferenceRole)
  ) {
    fail(`references[${index}].role is not supported.`);
  }
  const strength = value.strength === undefined ? 1 : value.strength;
  if (
    typeof strength !== "number" ||
    !Number.isFinite(strength) ||
    strength < 0 ||
    strength > 1
  ) {
    fail(`references[${index}].strength must be between 0 and 1.`);
  }
  return {
    artifactId: artifactId(
      value.artifactId,
      `references[${index}].artifactId`,
    ),
    role: value.role as TargetedRepairReferenceRole,
    strength,
    ...(value.note === undefined
      ? {}
      : { note: requiredText(value.note, `references[${index}].note`, 1_024) }),
  };
}

function normalizeReferences(value: unknown): readonly NormalizedTargetedRepairReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 16) {
    fail("references must contain no more than 16 entries.");
  }
  const result = value.map(reference);
  const roles = new Set<string>();
  for (const entry of result) {
    if (roles.has(entry.role)) fail(`references contains duplicate role ${entry.role}.`);
    roles.add(entry.role);
  }
  return result;
}

function optionalJson(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  try {
    return normalizeJson(value);
  } catch (error: unknown) {
    fail(
      `metadata must be JSON compatible: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function validateTargetedRepairRequest(
  input: TargetedRepairRequestInput | unknown,
): NormalizedTargetedRepairRequest {
  if (!isRecord(input)) fail("Targeted repair request must be an object.");
  if (input.schemaVersion !== "1.0") fail('schemaVersion must be "1.0".');
  if (!isRecord(input.target)) fail("target must be an object.");
  if (input.style !== undefined && !isRecord(input.style)) {
    fail("style must be an object when supplied.");
  }
  if (input.shot !== undefined && !isRecord(input.shot)) {
    fail("shot must be an object when supplied.");
  }
  if (input.provider !== undefined && !isRecord(input.provider)) {
    fail("provider must be an object when supplied.");
  }
  if (input.policy !== undefined && !isRecord(input.policy)) {
    fail("policy must be an object when supplied.");
  }

  const provider = input.provider ?? {};
  const policy = input.policy ?? {};
  const gateIds = stringList(input.target.gateIds, "target.gateIds", 64, 128);
  const references = normalizeReferences(input.references);
  const allowedAdapterIds = stringList(
    provider.allowedAdapterIds,
    "provider.allowedAdapterIds",
    32,
    128,
  );
  const backgroundStrategy = provider.backgroundStrategy;
  if (
    backgroundStrategy !== undefined &&
    (typeof backgroundStrategy !== "string" ||
      !BACKGROUND_STRATEGIES.has(backgroundStrategy))
  ) {
    fail("provider.backgroundStrategy is not supported.");
  }
  const matteColour = provider.matteColour;
  if (
    matteColour !== undefined &&
    (typeof matteColour !== "string" ||
      !/^#[0-9a-fA-F]{6}$/.test(matteColour.trim()))
  ) {
    fail("provider.matteColour must use #RRGGBB format.");
  }
  if (backgroundStrategy === "chroma-key" && matteColour === undefined) {
    fail("provider.matteColour is required for chroma-key repair.");
  }
  if (backgroundStrategy !== "chroma-key" && matteColour !== undefined) {
    fail("provider.matteColour is accepted only with chroma-key repair.");
  }

  const metadata = optionalJson(input.metadata);
  return {
    schemaVersion: "1.0",
    protocolVersion: TARGETED_REPAIR_PROTOCOL_VERSION,
    repairId: safeId(input.repairId, "repairId"),
    familyEvidenceArtifactId: artifactId(
      input.familyEvidenceArtifactId,
      "familyEvidenceArtifactId",
    ),
    target: {
      frameId: safeId(input.target.frameId, "target.frameId"),
      ...(input.target.layerId === undefined
        ? {}
        : { layerId: safeId(input.target.layerId, "target.layerId") }),
      gateIds,
    },
    intent: requiredText(input.intent, "intent"),
    preserve: stringList(input.preserve, "preserve", 64, 1_024),
    ...(input.maskArtifactId === undefined
      ? {}
      : { maskArtifactId: artifactId(input.maskArtifactId, "maskArtifactId") }),
    references,
    ...(input.style === undefined
      ? {}
      : {
          style: input.style as unknown as NonNullable<
            TargetedRepairRequestInput["style"]
          >,
        }),
    ...(input.shot === undefined
      ? {}
      : {
          shot: input.shot as unknown as NonNullable<
            TargetedRepairRequestInput["shot"]
          >,
        }),
    provider: {
      enabled: provider.enabled !== false,
      ...(backgroundStrategy === undefined
        ? {}
        : {
            backgroundStrategy: backgroundStrategy as
              | "native-alpha"
              | "chroma-key"
              | "opaque-source"
              | "provider-auto",
          }),
      ...(matteColour === undefined
        ? {}
        : { matteColour: matteColour.toLowerCase() }),
      candidateCount: boundedInteger(
        provider.candidateCount,
        2,
        1,
        8,
        "provider.candidateCount",
      ),
      ...(provider.seed === undefined
        ? {}
        : {
            seed: boundedInteger(
              provider.seed,
              0,
              0,
              2_147_483_647,
              "provider.seed",
            ),
          }),
      ...(provider.preferredAdapterId === undefined
        ? {}
        : {
            preferredAdapterId: safeId(
              provider.preferredAdapterId,
              "provider.preferredAdapterId",
            ),
          }),
      ...(provider.preferredModel === undefined
        ? {}
        : {
            preferredModel: safeId(
              provider.preferredModel,
              "provider.preferredModel",
            ),
          }),
      allowedAdapterIds,
      allowFallback: provider.allowFallback === true,
    },
    policy: {
      requireMaskForPixelRepair: policy.requireMaskForPixelRepair !== false,
      allowSharedLayerRepair: policy.allowSharedLayerRepair === true,
      allowWholeFramePixelRepair: policy.allowWholeFramePixelRepair === true,
      maximumImpactedFrames: boundedInteger(
        policy.maximumImpactedFrames,
        32,
        1,
        512,
        "policy.maximumImpactedFrames",
      ),
    },
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function targetedRepairRequestSha256(
  input: NormalizedTargetedRepairRequest | TargetedRepairRequestInput | unknown,
): string {
  const request =
    isRecord(input) && input.protocolVersion === TARGETED_REPAIR_PROTOCOL_VERSION
      ? (input as unknown as NormalizedTargetedRepairRequest)
      : validateTargetedRepairRequest(input);
  return sha256(stableStringify(normalizeJson(request)));
}

export function targetedRepairProtocolSummary() {
  return {
    schemaVersion: "1.0",
    protocolVersion: TARGETED_REPAIR_PROTOCOL_VERSION,
    strategies: [
      "source-replace",
      "metadata-adjustment",
      "layer-transform",
      "layer-recompose",
      "alpha-remaster",
      "masked-provider-inpaint",
      "manual-review",
    ],
    rules: [
      "One packet mutates one frame layer or one shared immutable layer artifact.",
      "Unaffected artifacts are preserved by immutable ID and may not be regenerated.",
      "Linked-cel and static-family repair expands to every frame sharing the target artifact.",
      "Pixel repair requires an explicit mask unless policy deliberately permits whole-frame repair.",
      "Provider execution produces only unapproved candidates and must be followed by mastering and family reverification.",
      "Repair planning never approves assets or updates named references.",
    ],
  } as const;
}
