import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  SELECTION_PROTOCOL_VERSION,
  CandidateSelectionError,
  type CandidatePromotionRequestInput,
  type CandidateSelectionPolicyInput,
  type CandidateSelectionProfile,
  type CandidateSelectionRequestInput,
  type DeterministicSelectionMetricId,
  type ExternalSelectionEvidenceKind,
  type NormalizedCandidatePromotionRequest,
  type NormalizedCandidateSelectionPolicy,
  type NormalizedCandidateSelectionRequest,
  type NormalizedSelectionExternalEvidencePolicy,
  type NormalizedSelectionMetricPolicy,
  type SelectionExternalEvidencePolicyInput,
  type SelectionMetricPolicyInput,
} from "./types.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/;
const PROFILES = new Set<CandidateSelectionProfile>([
  "sprite-identity",
  "sprite-motion",
  "environment",
  "ui",
  "custom",
]);
const METRIC_IDS = new Set<DeterministicSelectionMetricId>([
  "silhouette-iou",
  "silhouette-dice",
  "edge-similarity",
  "visible-area-similarity",
  "centroid-similarity",
  "bounds-aspect-similarity",
  "palette-similarity",
  "luminance-similarity",
  "edge-orientation-similarity",
  "overlap-colour-similarity",
]);
const EXTERNAL_KINDS = new Set<ExternalSelectionEvidenceKind>([
  "identity-similarity",
  "costume-similarity",
  "equipment-similarity",
  "pose-similarity",
  "style-similarity",
  "perceptual-similarity",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(message: string, details?: JsonValue): never {
  throw new CandidateSelectionError(
    "CANDIDATE_SELECTION_REQUEST_INVALID",
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

function numberInRange(
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

function integerInRange(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const resolved = numberInRange(value, fallback, minimum, maximum, name);
  if (!Number.isInteger(resolved)) fail(`${name} must be an integer.`);
  return resolved;
}

function uniqueArtifactIds(
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
  return result;
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

const PROFILE_METRICS: Readonly<
  Record<Exclude<CandidateSelectionProfile, "custom">, readonly SelectionMetricPolicyInput[]>
> = Object.freeze({
  "sprite-identity": Object.freeze([
    { id: "silhouette-iou", weight: 0.2, minimum: 0.45, blocking: true },
    { id: "silhouette-dice", weight: 0.08, minimum: 0.58, blocking: false },
    { id: "edge-similarity", weight: 0.14, minimum: 0.42, blocking: true },
    { id: "visible-area-similarity", weight: 0.08, minimum: 0.72, blocking: true },
    { id: "centroid-similarity", weight: 0.07, minimum: 0.72, blocking: true },
    { id: "bounds-aspect-similarity", weight: 0.05, minimum: 0.72, blocking: false },
    { id: "palette-similarity", weight: 0.14, minimum: 0.52, blocking: true },
    { id: "luminance-similarity", weight: 0.07, minimum: 0.55, blocking: false },
    { id: "edge-orientation-similarity", weight: 0.07, minimum: 0.42, blocking: false },
    { id: "overlap-colour-similarity", weight: 0.1, minimum: 0.42, blocking: false },
  ]),
  "sprite-motion": Object.freeze([
    { id: "silhouette-iou", weight: 0.14, minimum: 0.28, blocking: false },
    { id: "silhouette-dice", weight: 0.06, minimum: 0.42, blocking: false },
    { id: "edge-similarity", weight: 0.12, minimum: 0.3, blocking: false },
    { id: "visible-area-similarity", weight: 0.11, minimum: 0.65, blocking: true },
    { id: "centroid-similarity", weight: 0.1, minimum: 0.62, blocking: true },
    { id: "bounds-aspect-similarity", weight: 0.06, minimum: 0.65, blocking: false },
    { id: "palette-similarity", weight: 0.18, minimum: 0.52, blocking: true },
    { id: "luminance-similarity", weight: 0.08, minimum: 0.5, blocking: false },
    { id: "edge-orientation-similarity", weight: 0.07, minimum: 0.32, blocking: false },
    { id: "overlap-colour-similarity", weight: 0.08, minimum: 0.28, blocking: false },
  ]),
  environment: Object.freeze([
    { id: "silhouette-iou", weight: 0.05, minimum: 0.05, blocking: false },
    { id: "edge-similarity", weight: 0.14, minimum: 0.32, blocking: false },
    { id: "visible-area-similarity", weight: 0.05, minimum: 0.7, blocking: false },
    { id: "palette-similarity", weight: 0.24, minimum: 0.48, blocking: true },
    { id: "luminance-similarity", weight: 0.2, minimum: 0.52, blocking: true },
    { id: "edge-orientation-similarity", weight: 0.17, minimum: 0.38, blocking: false },
    { id: "overlap-colour-similarity", weight: 0.15, minimum: 0.32, blocking: false },
  ]),
  ui: Object.freeze([
    { id: "silhouette-iou", weight: 0.2, minimum: 0.72, blocking: true },
    { id: "edge-similarity", weight: 0.18, minimum: 0.62, blocking: true },
    { id: "visible-area-similarity", weight: 0.08, minimum: 0.82, blocking: true },
    { id: "centroid-similarity", weight: 0.08, minimum: 0.88, blocking: true },
    { id: "bounds-aspect-similarity", weight: 0.08, minimum: 0.9, blocking: true },
    { id: "palette-similarity", weight: 0.18, minimum: 0.68, blocking: true },
    { id: "luminance-similarity", weight: 0.1, minimum: 0.72, blocking: false },
    { id: "edge-orientation-similarity", weight: 0.1, minimum: 0.62, blocking: false },
  ]),
});

const PROFILE_EXTERNAL: Readonly<
  Record<Exclude<CandidateSelectionProfile, "custom">, readonly SelectionExternalEvidencePolicyInput[]>
> = Object.freeze({
  "sprite-identity": Object.freeze([
    {
      kind: "identity-similarity",
      weight: 0.2,
      minimum: 0.78,
      blocking: true,
      required: false,
      requiredForAutomatic: true,
    },
    {
      kind: "style-similarity",
      weight: 0.08,
      minimum: 0.64,
      blocking: false,
      required: false,
      requiredForAutomatic: true,
    },
  ]),
  "sprite-motion": Object.freeze([
    {
      kind: "identity-similarity",
      weight: 0.17,
      minimum: 0.76,
      blocking: true,
      required: false,
      requiredForAutomatic: true,
    },
    {
      kind: "pose-similarity",
      weight: 0.12,
      minimum: 0.58,
      blocking: false,
      required: false,
      requiredForAutomatic: true,
    },
    {
      kind: "style-similarity",
      weight: 0.05,
      minimum: 0.6,
      blocking: false,
      required: false,
      requiredForAutomatic: true,
    },
  ]),
  environment: Object.freeze([
    {
      kind: "style-similarity",
      weight: 0.15,
      minimum: 0.62,
      blocking: false,
      required: false,
      requiredForAutomatic: true,
    },
    {
      kind: "perceptual-similarity",
      weight: 0.1,
      minimum: 0.52,
      blocking: false,
      required: false,
      requiredForAutomatic: true,
    },
  ]),
  ui: Object.freeze([]),
});

function metricPolicy(
  value: SelectionMetricPolicyInput,
  index: number,
): NormalizedSelectionMetricPolicy {
  if (!METRIC_IDS.has(value.id)) fail(`metrics[${index}].id is not supported.`);
  return {
    id: value.id,
    weight: numberInRange(value.weight, 1, 0, 100, `metrics[${index}].weight`),
    minimum: numberInRange(value.minimum, 0, 0, 1, `metrics[${index}].minimum`),
    blocking: value.blocking === true,
  };
}

function externalPolicy(
  value: SelectionExternalEvidencePolicyInput,
  index: number,
): NormalizedSelectionExternalEvidencePolicy {
  if (!EXTERNAL_KINDS.has(value.kind)) {
    fail(`externalEvidence[${index}].kind is not supported.`);
  }
  return {
    kind: value.kind,
    weight: numberInRange(
      value.weight,
      1,
      0,
      100,
      `externalEvidence[${index}].weight`,
    ),
    minimum: numberInRange(
      value.minimum,
      0,
      0,
      1,
      `externalEvidence[${index}].minimum`,
    ),
    blocking: value.blocking === true,
    required: value.required === true,
    requiredForAutomatic: value.requiredForAutomatic === true,
  };
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string, name: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) fail(`${name} contains duplicate ${id}.`);
    seen.add(id);
  }
}

function normalizePolicy(input: unknown): NormalizedCandidateSelectionPolicy {
  if (!isRecord(input)) fail("policy must be an object.");
  if (typeof input.profile !== "string" || !PROFILES.has(input.profile as CandidateSelectionProfile)) {
    fail("policy.profile is not supported.");
  }
  const profile = input.profile as CandidateSelectionProfile;
  const policyInput = input as unknown as CandidateSelectionPolicyInput;
  const metricInputs =
    policyInput.metrics ??
    (profile === "custom" ? undefined : PROFILE_METRICS[profile]);
  if (!metricInputs?.length) {
    fail("A custom selection policy must declare at least one deterministic metric.");
  }
  const metrics = metricInputs.map(metricPolicy);
  uniqueBy(metrics, (entry) => entry.id, "metrics");
  if (!metrics.some((entry) => entry.weight > 0)) {
    fail("At least one deterministic selection metric must have positive weight.");
  }

  const externalInputs =
    policyInput.externalEvidence ??
    (profile === "custom" ? [] : PROFILE_EXTERNAL[profile]);
  const externalEvidence = externalInputs.map(externalPolicy);
  uniqueBy(externalEvidence, (entry) => entry.kind, "externalEvidence");

  const allowedCandidateRoles = [
    ...new Set(
      (policyInput.allowedCandidateRoles ?? [
        "provider-candidate-alpha-master",
      ]).map((entry, index) => {
        const value = requiredString(
          entry,
          `policy.allowedCandidateRoles[${index}]`,
          128,
        );
        if (!SAFE_ID.test(value)) {
          fail(`policy.allowedCandidateRoles[${index}] is not a safe artifact role.`);
        }
        return value;
      }),
    ),
  ].sort();
  if (!allowedCandidateRoles.length) {
    fail("policy.allowedCandidateRoles must not be empty.");
  }

  return {
    profile,
    allowAutomaticSelection: policyInput.allowAutomaticSelection === true,
    requireReferenceLineage: policyInput.requireReferenceLineage !== false,
    requireQualityPassed: policyInput.requireQualityPassed !== false,
    allowedCandidateRoles,
    alphaVisibleThreshold: integerInRange(
      policyInput.alphaVisibleThreshold,
      8,
      1,
      255,
      "policy.alphaVisibleThreshold",
    ),
    maximumTranslationPixels: integerInRange(
      policyInput.maximumTranslationPixels,
      profile === "ui" ? 2 : 6,
      0,
      64,
      "policy.maximumTranslationPixels",
    ),
    maximumEdgeDistancePixels: numberInRange(
      policyInput.maximumEdgeDistancePixels,
      profile === "ui" ? 4 : 12,
      1,
      256,
      "policy.maximumEdgeDistancePixels",
    ),
    minimumOverallScore: numberInRange(
      policyInput.minimumOverallScore,
      profile === "ui" ? 0.78 : 0.68,
      0,
      1,
      "policy.minimumOverallScore",
    ),
    minimumWinnerMargin: numberInRange(
      policyInput.minimumWinnerMargin,
      0.035,
      0,
      1,
      "policy.minimumWinnerMargin",
    ),
    metrics,
    externalEvidence,
  };
}

export function selectionRequestSha256(
  request: NormalizedCandidateSelectionRequest,
): string {
  return sha256(stableStringify(normalizeJson(request)));
}

export function validateCandidateSelectionRequest(
  input: unknown,
): NormalizedCandidateSelectionRequest {
  if (!isRecord(input)) fail("Candidate selection request must be an object.");
  if (input.schemaVersion !== "1.0") fail('schemaVersion must be "1.0".');
  const candidateArtifactIds = uniqueArtifactIds(
    input.candidateArtifactIds,
    "candidateArtifactIds",
    2,
    32,
  );
  const referenceArtifactId = artifactId(
    input.referenceArtifactId,
    "referenceArtifactId",
  );
  if (candidateArtifactIds.includes(referenceArtifactId)) {
    fail("referenceArtifactId must not also be a candidate artifact.");
  }
  const externalEvidenceArtifactIds =
    input.externalEvidenceArtifactIds === undefined
      ? []
      : uniqueArtifactIds(
          input.externalEvidenceArtifactIds,
          "externalEvidenceArtifactIds",
          1,
          256,
        );
  const referenceRole =
    input.referenceRole === undefined
      ? "canonical-identity"
      : requiredString(input.referenceRole, "referenceRole", 128);
  if (!SAFE_LABEL.test(referenceRole)) fail("referenceRole is not a safe label.");
  const policy = normalizePolicy(input.policy);
  const metadata = normalizeMetadata(input.metadata);
  const base = {
    schemaVersion: "1.0" as const,
    protocolVersion: SELECTION_PROTOCOL_VERSION,
    candidateArtifactIds: [...candidateArtifactIds].sort(),
    referenceArtifactId,
    referenceRole,
    externalEvidenceArtifactIds: [...externalEvidenceArtifactIds].sort(),
    policy,
    ...(metadata === undefined ? {} : { metadata }),
  };
  const selectionId =
    input.selectionId === undefined
      ? `selection_${sha256(stableStringify(normalizeJson(base))).slice(0, 40)}`
      : safeId(input.selectionId, "selectionId");
  return { ...base, selectionId };
}

function safeNamespace(value: unknown): string {
  const normalized = requiredString(value, "target.namespace", 512)
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");
  const segments = normalized.split("/");
  if (
    !segments.length ||
    segments.some(
      (entry) =>
        !entry ||
        entry === "." ||
        entry === ".." ||
        !SAFE_ID.test(entry),
    )
  ) {
    fail("target.namespace must contain safe slash-separated segments.");
  }
  return segments.join("/");
}

export function promotionRequestSha256(
  request: NormalizedCandidatePromotionRequest,
): string {
  return sha256(stableStringify(normalizeJson(request)));
}

export function validateCandidatePromotionRequest(
  input: unknown,
): NormalizedCandidatePromotionRequest {
  if (!isRecord(input)) fail("Candidate promotion request must be an object.");
  if (input.schemaVersion !== "1.0") fail('schemaVersion must be "1.0".');
  if (!isRecord(input.target)) fail("target must be an object.");
  if (!isRecord(input.approval)) fail("approval must be an object.");
  const selectionEvidenceArtifactId = artifactId(
    input.selectionEvidenceArtifactId,
    "selectionEvidenceArtifactId",
  );
  const candidateArtifactId = artifactId(
    input.candidateArtifactId,
    "candidateArtifactId",
  );
  const expectedGeneration = integerInRange(
    input.target.expectedGeneration,
    0,
    0,
    Number.MAX_SAFE_INTEGER,
    "target.expectedGeneration",
  );
  const expectedArtifactId =
    input.target.expectedArtifactId === undefined
      ? undefined
      : artifactId(input.target.expectedArtifactId, "target.expectedArtifactId");
  if (expectedGeneration > 0 && expectedArtifactId === undefined) {
    fail("target.expectedArtifactId is required when expectedGeneration is greater than zero.");
  }
  if (expectedGeneration === 0 && expectedArtifactId !== undefined) {
    fail("target.expectedArtifactId must be omitted when expectedGeneration is zero.");
  }
  const actor = requiredString(input.actor, "actor", 256);
  let approval: NormalizedCandidatePromotionRequest["approval"];
  if (input.approval.mode === "automatic") {
    approval = { mode: "automatic" };
  } else if (input.approval.mode === "human") {
    approval = {
      mode: "human",
      approver: requiredString(input.approval.approver, "approval.approver", 256),
      reason: requiredString(input.approval.reason, "approval.reason", 4_096),
    };
  } else {
    fail("approval.mode must be automatic or human.");
  }
  const metadata = normalizeMetadata(input.metadata);
  const base = {
    schemaVersion: "1.0" as const,
    protocolVersion: SELECTION_PROTOCOL_VERSION,
    selectionEvidenceArtifactId,
    candidateArtifactId,
    target: {
      namespace: safeNamespace(input.target.namespace),
      name: safeId(input.target.name, "target.name"),
      expectedGeneration,
      ...(expectedArtifactId === undefined ? {} : { expectedArtifactId }),
    },
    approval,
    actor,
    ...(metadata === undefined ? {} : { metadata }),
  };
  const promotionId =
    input.promotionId === undefined
      ? `promotion_${sha256(stableStringify(normalizeJson(base))).slice(0, 40)}`
      : safeId(input.promotionId, "promotionId");
  return { ...base, promotionId };
}

export function selectionProtocolSummary(): JsonValue {
  return {
    schemaVersion: "1.0",
    protocolVersion: SELECTION_PROTOCOL_VERSION,
    profiles: [...PROFILES],
    deterministicMetrics: [...METRIC_IDS],
    externalEvidenceKinds: [...EXTERNAL_KINDS],
    decisions: ["selected", "review-required", "rejected"],
    rules: [
      "Selection evidence is immutable and cannot update an approved reference.",
      "Automatic selection requires every blocking gate, score threshold, margin and required model-evidence condition to pass.",
      "Human approval may resolve a review-required margin but cannot override blocking failures or choose a lower-ranked candidate.",
      "Promotion is a separate compare-and-swap transaction over a named artifact reference.",
      "The selected master remains traceable to the candidate, reference, selection evidence and approval actor.",
    ],
  };
}
