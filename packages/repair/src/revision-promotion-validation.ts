import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  REPAIRED_FAMILY_PROMOTION_PROTOCOL_VERSION,
  RepairedFamilyPromotionError,
  type NormalizedRepairedFamilyPromotionRequest,
  type RepairedFamilyPromotionRequestInput,
} from "./revision-promotion-types.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(message: string, details?: JsonValue): never {
  throw new RepairedFamilyPromotionError(
    "REPAIRED_FAMILY_PROMOTION_REQUEST_INVALID",
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

function referencePart(value: unknown, name: string): string {
  if (typeof value !== "string" || !SAFE_REFERENCE.test(value.trim())) {
    fail(`${name} must contain a safe non-empty reference name.`);
  }
  return value.trim();
}

function requiredText(value: unknown, name: string, maximum: number): string {
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

function nonNegativeInteger(value: unknown, name: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    fail(`${name} must be a non-negative safe integer.`);
  }
  return value;
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

export function repairedFamilyPromotionRequestSha256(
  request: NormalizedRepairedFamilyPromotionRequest,
): string {
  return sha256(stableStringify(normalizeJson(request)));
}

export function validateRepairedFamilyPromotionRequest(
  input: RepairedFamilyPromotionRequestInput | unknown,
): NormalizedRepairedFamilyPromotionRequest {
  if (!isRecord(input)) fail("Revision-bound promotion request must be an object.");
  if (input.schemaVersion !== "1.0") fail('schemaVersion must be "1.0".');
  if (!isRecord(input.target)) fail("target must be an object.");
  if (!isRecord(input.approval)) fail("approval must be an object.");
  let approval: NormalizedRepairedFamilyPromotionRequest["approval"];
  if (input.approval.mode === "automatic") {
    approval = { mode: "automatic" };
  } else if (input.approval.mode === "human") {
    approval = {
      mode: "human",
      approver: requiredText(input.approval.approver, "approval.approver", 256),
      reason: requiredText(input.approval.reason, "approval.reason", 4_096),
    };
  } else {
    fail("approval.mode must be automatic or human.");
  }
  const metadata = optionalJson(input.metadata);
  return {
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_PROMOTION_PROTOCOL_VERSION,
    promotionId: safeId(input.promotionId, "promotionId"),
    rankingEvidenceArtifactId: artifactId(
      input.rankingEvidenceArtifactId,
      "rankingEvidenceArtifactId",
    ),
    target: {
      namespace: referencePart(input.target.namespace, "target.namespace"),
      name: referencePart(input.target.name, "target.name"),
      expectedGeneration: nonNegativeInteger(
        input.target.expectedGeneration,
        "target.expectedGeneration",
      ),
      expectedArtifactId: artifactId(
        input.target.expectedArtifactId,
        "target.expectedArtifactId",
      ),
    },
    approval,
    actor: requiredText(input.actor, "actor", 256),
    ...(metadata === undefined ? {} : { metadata }),
  };
}
