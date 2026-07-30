import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION,
  RepairedFamilyRankingError,
  type NormalizedRepairedFamilyRankingRequest,
  type RepairedFamilyRankingRequestInput,
} from "./revision-ranking-types.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(message: string, details?: JsonValue): never {
  throw new RepairedFamilyRankingError(
    "REPAIRED_FAMILY_RANKING_REQUEST_INVALID",
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

function artifactId(value: unknown, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    fail(`${name} must use artifact_<sha256> format.`);
  }
  return value as ArtifactId;
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

export function repairedFamilyRankingRequestSha256(
  request: NormalizedRepairedFamilyRankingRequest,
): string {
  return sha256(stableStringify(normalizeJson(request)));
}

export function validateRepairedFamilyRankingRequest(
  input: RepairedFamilyRankingRequestInput | unknown,
): NormalizedRepairedFamilyRankingRequest {
  if (!isRecord(input)) fail("Revision-bound ranking request must be an object.");
  if (input.schemaVersion !== "1.0") fail('schemaVersion must be "1.0".');
  const metadata = optionalJson(input.metadata);
  return {
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION,
    rankingId: safeId(input.rankingId, "rankingId"),
    bridgeEvidenceArtifactId: artifactId(
      input.bridgeEvidenceArtifactId,
      "bridgeEvidenceArtifactId",
    ),
    ...(metadata === undefined ? {} : { metadata }),
  };
}
