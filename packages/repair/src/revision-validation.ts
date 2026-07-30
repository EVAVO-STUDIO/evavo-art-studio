import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import {
  normalizeSpriteFrameExpectations,
  SpriteQualityInputError,
} from "@evavo/art-quality";

import {
  REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION,
  RepairedFamilyRevisionError,
  type NormalizedRepairedFamilyRevisionRequest,
  type RepairedFamilyRevisionRequestInput,
} from "./revision-types.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(message: string, details?: JsonValue): never {
  throw new RepairedFamilyRevisionError(
    "REPAIRED_FAMILY_REVISION_REQUEST_INVALID",
    message,
    details,
  );
}

function artifactId(value: unknown, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(`${name} must use artifact_<sha256> format.`);
  }
  return value as ArtifactId;
}

function safeId(value: unknown, name: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value.trim())) {
    fail(`${name} must use 1 to 128 letters, digits, dots, underscores, colons or hyphens.`);
  }
  return value.trim();
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

export function validateRepairedFamilyRevisionRequest(
  input: RepairedFamilyRevisionRequestInput | unknown,
): NormalizedRepairedFamilyRevisionRequest {
  if (!isRecord(input)) fail("Repaired family revision request must be an object.");
  if (input.schemaVersion !== "1.0") fail('schemaVersion must be "1.0".');
  if (input.quality !== undefined && !isRecord(input.quality)) {
    fail("quality must be an object when supplied.");
  }

  let quality;
  try {
    quality = normalizeSpriteFrameExpectations({
      frameId: "repaired-family-revision",
      transparency: "alpha-required",
      ...(input.quality ?? {}),
    });
  } catch (error: unknown) {
    if (error instanceof SpriteQualityInputError) {
      fail(error.message, { qualityCode: error.code });
    }
    throw error;
  }
  if (quality.transparency === "opaque") {
    fail("Repaired sprite-family candidates must require or prefer alpha transparency.");
  }

  const metadata = optionalJson(input.metadata);
  return {
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION,
    revisionId: safeId(input.revisionId, "revisionId"),
    repairPacketArtifactId: artifactId(
      input.repairPacketArtifactId,
      "repairPacketArtifactId",
    ),
    repairExecutionEvidenceArtifactId: artifactId(
      input.repairExecutionEvidenceArtifactId,
      "repairExecutionEvidenceArtifactId",
    ),
    restoredCandidateArtifactId: artifactId(
      input.restoredCandidateArtifactId,
      "restoredCandidateArtifactId",
    ),
    quality: {
      transparency: quality.transparency,
      safePadding: quality.safePadding,
      alphaVisibleThreshold: quality.alphaVisibleThreshold,
      knownMatteColours: quality.knownMatteColours,
      flatMatteBorderThreshold: quality.flatMatteBorderThreshold,
      checkerboardConfidenceThreshold: quality.checkerboardConfidenceThreshold,
      maximumHaloFraction: quality.maximumHaloFraction,
      maximumUnexpectedTransparentRgbFraction:
        quality.maximumUnexpectedTransparentRgbFraction,
    },
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function repairedFamilyRevisionRequestSha256(
  request: NormalizedRepairedFamilyRevisionRequest,
): string {
  return sha256(stableStringify(normalizeJson(request)));
}
