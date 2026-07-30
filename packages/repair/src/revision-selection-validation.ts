import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import type { CandidateSelectionPolicyInput } from "@evavo/art-selection";

import {
  REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION,
  RepairedFamilySelectionError,
  type NormalizedRepairedFamilySelectionRequest,
  type RepairedFamilySelectionRequestInput,
} from "./revision-selection-types.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(message: string, details?: JsonValue): never {
  throw new RepairedFamilySelectionError(
    "REPAIRED_FAMILY_SELECTION_REQUEST_INVALID",
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

function artifactIds(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): readonly ArtifactId[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${name} must contain ${minimum} to ${maximum} artifact ids.`);
  }
  const result = value.map((entry, index) =>
    artifactId(entry, `${name}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    fail(`${name} must not contain duplicate artifact ids.`);
  }
  return [...result].sort();
}

function optionalJson(value: unknown, name: string): JsonValue | undefined {
  if (value === undefined) return undefined;
  try {
    return normalizeJson(value);
  } catch (error: unknown) {
    fail(
      `${name} must be JSON compatible: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function policy(
  value: unknown,
): NormalizedRepairedFamilySelectionRequest["policy"] {
  if (value === undefined) {
    return {
      profile: "sprite-identity",
      allowAutomaticSelection: false,
    };
  }
  if (!isRecord(value)) fail("policy must be an object when supplied.");
  const normalized = optionalJson(value, "policy");
  if (!isRecord(normalized)) fail("policy must normalize to a JSON object.");
  const {
    requireReferenceLineage: _requireReferenceLineage,
    requireQualityPassed: _requireQualityPassed,
    allowedCandidateRoles: _allowedCandidateRoles,
    ...callerPolicy
  } = normalized;
  return callerPolicy as unknown as Omit<
    CandidateSelectionPolicyInput,
    "requireReferenceLineage" | "requireQualityPassed" | "allowedCandidateRoles"
  >;
}

export function repairedFamilySelectionRequestSha256(
  request: NormalizedRepairedFamilySelectionRequest,
): string {
  return sha256(stableStringify(normalizeJson(request)));
}

export function validateRepairedFamilySelectionRequest(
  input: RepairedFamilySelectionRequestInput | unknown,
): NormalizedRepairedFamilySelectionRequest {
  if (!isRecord(input)) fail("Repaired family selection request must be an object.");
  if (input.schemaVersion !== "1.0") fail('schemaVersion must be "1.0".');
  const revisionEvidenceArtifactIds = artifactIds(
    input.revisionEvidenceArtifactIds,
    "revisionEvidenceArtifactIds",
    2,
    32,
  );
  const externalEvidenceArtifactIds =
    input.externalEvidenceArtifactIds === undefined ||
    (Array.isArray(input.externalEvidenceArtifactIds) &&
      input.externalEvidenceArtifactIds.length === 0)
      ? []
      : artifactIds(
          input.externalEvidenceArtifactIds,
          "externalEvidenceArtifactIds",
          1,
          256,
        );
  const metadata = optionalJson(input.metadata, "metadata");
  return {
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION,
    bridgeId: safeId(input.bridgeId, "bridgeId"),
    revisionEvidenceArtifactIds,
    externalEvidenceArtifactIds,
    policy: policy(input.policy),
    ...(metadata === undefined ? {} : { metadata }),
  };
}
