import {
  fingerprintBookIllustrationValue,
  type BookIllustrationVisualConsensusEvaluationV1,
} from "./book-illustration-intelligence.js";
import type {
  BookArtIdentityV1,
  BookArtPurpose,
} from "./book-production.js";
import {
  validateBookArtProductionWorkOrder,
  type BookArtProductionWorkOrderV1,
  type BookArtProviderRequestV1,
} from "./book-production-profile.js";

export const BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION = 1 as const;
export const BOOK_ART_CANDIDATE_SET_CONTRACT =
  "evavo_book_art_candidate_set_production_v1" as const;
export const BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES = 3 as const;
export const BOOK_ART_CANDIDATE_SET_DEFAULT_CANDIDATES = 4 as const;
export const BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES = 8 as const;
export const BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS = 9_200 as const;

export const BOOK_ART_CANDIDATE_SET_CAPABILITIES = Object.freeze([
  "book.candidate_set.generate",
  "book.visual.candidate_set.consensus",
] as const);

export type BookArtCandidateSetCapability =
  (typeof BOOK_ART_CANDIDATE_SET_CAPABILITIES)[number];

export interface BookArtCandidateSetCapabilityDescriptorV1 {
  capabilityId: BookArtCandidateSetCapability;
  owner: "art_studio";
  operationId:
    | "compileBookArtCandidateSetWorkOrder"
    | "evaluateBookArtCandidateSetConsensus";
  providerBacked: boolean;
  oneProviderAttemptRequired: boolean;
  providerFallbackAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationPerformed: false;
}

export const BOOK_ART_CANDIDATE_SET_CAPABILITY_DESCRIPTORS:
  readonly BookArtCandidateSetCapabilityDescriptorV1[] = Object.freeze([
    Object.freeze({
      capabilityId: "book.candidate_set.generate",
      owner: "art_studio",
      operationId: "compileBookArtCandidateSetWorkOrder",
      providerBacked: true,
      oneProviderAttemptRequired: true,
      providerFallbackAllowed: false,
      automaticSelectionAllowed: false,
      automaticPromotionAllowed: false,
      publicationPerformed: false,
    }),
    Object.freeze({
      capabilityId: "book.visual.candidate_set.consensus",
      owner: "art_studio",
      operationId: "evaluateBookArtCandidateSetConsensus",
      providerBacked: false,
      oneProviderAttemptRequired: false,
      providerFallbackAllowed: false,
      automaticSelectionAllowed: false,
      automaticPromotionAllowed: false,
      publicationPerformed: false,
    }),
  ]);

export function listBookArtCandidateSetCapabilities(): Readonly<{
  outputKind: "evavo_art_book_candidate_set_capabilities";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CANDIDATE_SET_CONTRACT;
  capabilities: readonly BookArtCandidateSetCapability[];
  descriptors: readonly BookArtCandidateSetCapabilityDescriptorV1[];
  minimumCandidates: typeof BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES;
  defaultCandidates: typeof BOOK_ART_CANDIDATE_SET_DEFAULT_CANDIDATES;
  maximumCandidates: typeof BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES;
  nearDuplicateBasisPoints:
    typeof BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS;
  providerFallbackAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationPerformed: false;
}> {
  return Object.freeze({
    outputKind: "evavo_art_book_candidate_set_capabilities",
    schemaVersion: BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    capabilities: BOOK_ART_CANDIDATE_SET_CAPABILITIES,
    descriptors: BOOK_ART_CANDIDATE_SET_CAPABILITY_DESCRIPTORS,
    minimumCandidates: BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
    defaultCandidates: BOOK_ART_CANDIDATE_SET_DEFAULT_CANDIDATES,
    maximumCandidates: BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
    nearDuplicateBasisPoints:
      BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS,
    providerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationPerformed: false,
  });
}

export type BookArtCandidateSetProviderRequestV1 = Omit<
  BookArtProviderRequestV1,
  "requestId" | "candidateCount" | "metadata"
> & {
  requestId: string;
  candidateCount: number;
  metadata: BookArtProviderRequestV1["metadata"] & {
    candidateSetId: string;
    candidateCount: number;
    completePairwiseComparisonRequired: true;
    independentSetReviewRequired: true;
    generatedTextProhibited: true;
    automaticSelectionAllowed: false;
    publicationPerformed: false;
  };
};

export interface BookArtCandidateSetWorkOrderCompileInputV1 {
  outputKind: "evavo_book_art_candidate_set_work_order_compile_input";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CANDIDATE_SET_CONTRACT;
  baseWorkOrder: unknown;
  candidateCount?: number;
  requestedAt: string;
  requestedBy: string;
  providerFallbackAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationAllowed: false;
}

export interface BookArtCandidateSetPolicyV1 {
  minimumCandidates: typeof BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES;
  maximumCandidates: typeof BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES;
  nearDuplicateBasisPoints:
    typeof BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS;
  everyCandidateRequiresTechnicalQa: true;
  everyCandidateRequiresIndependentVisualConsensus: true;
  completePairwiseComparisonRequired: true;
  manuscriptEvidenceRequiredForEveryCandidate: true;
  distinctConceptCompositionAndSilhouetteRequired: true;
  generatedTextProhibited: true;
  oneProviderAttemptPerCandidateSet: true;
  providerFallbackAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationAllowed: false;
}

export interface BookArtCandidateSetWorkOrderV1 {
  outputKind: "evavo_book_art_candidate_set_work_order";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CANDIDATE_SET_CONTRACT;
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  candidateSetId: string;
  candidateCount: number;
  sourceBriefFingerprint: string;
  baseWorkOrderFingerprintSha256: string;
  baseWorkOrder: BookArtProductionWorkOrderV1;
  providerRequest: BookArtCandidateSetProviderRequestV1;
  policy: BookArtCandidateSetPolicyV1;
  requestedAt: string;
  requestedBy: string;
  workOrderFingerprintSha256: string;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
}

export interface BookArtCandidateSetWorkOrderCompilationResultV1 {
  outputKind: "evavo_book_art_candidate_set_work_order_compilation_result";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CANDIDATE_SET_CONTRACT;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  workOrder?: BookArtCandidateSetWorkOrderV1;
  blockers: string[];
  warnings: string[];
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  publicationPerformed: false;
}

export async function compileBookArtCandidateSetWorkOrder(
  value: unknown,
): Promise<BookArtCandidateSetWorkOrderCompilationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = strictObject(
    value,
    "candidate-set work-order input",
    WORK_ORDER_INPUT_KEYS,
    blockers,
  );
  if (!input) return blockedWorkOrder(emptyIdentity(), blockers, warnings);
  if (
    input.outputKind !==
      "evavo_book_art_candidate_set_work_order_compile_input" ||
    input.schemaVersion !== BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION ||
    input.contract !== BOOK_ART_CANDIDATE_SET_CONTRACT
  ) {
    blockers.push("Candidate-set work-order input identity or version is invalid.");
  }
  for (const field of [
    "providerFallbackAllowed",
    "automaticSelectionAllowed",
    "automaticPromotionAllowed",
    "publicationAllowed",
  ] as const) {
    if (input[field] !== false) blockers.push(`${field} must remain false.`);
  }
  const requestedAt = timestamp(
    input.requestedAt,
    "candidate-set requestedAt",
    blockers,
  );
  const requestedBy = safeId(
    input.requestedBy,
    "candidate-set requestedBy",
    blockers,
  );
  const candidateCount =
    input.candidateCount === undefined
      ? BOOK_ART_CANDIDATE_SET_DEFAULT_CANDIDATES
      : integer(
          input.candidateCount,
          BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
          BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
          "candidateCount",
          blockers,
        );

  const baseWorkOrder = input.baseWorkOrder as BookArtProductionWorkOrderV1;
  const identity = parseIdentity(record(baseWorkOrder?.identity));
  if (!record(input.baseWorkOrder)) {
    blockers.push("Candidate-set baseWorkOrder must be one object.");
  } else {
    try {
      const validation = await validateBookArtProductionWorkOrder(baseWorkOrder);
      blockers.push(...validation.issues);
    } catch (error: unknown) {
      blockers.push(message(error, "Base Book Art work-order validation failed."));
    }
  }
  if (
    baseWorkOrder?.providerRequest?.candidateCount !== 1 ||
    baseWorkOrder?.providerRequest?.selection?.allowFallback !== false
  ) {
    blockers.push(
      "Candidate-set compilation requires the exact governed one-candidate base work order.",
    );
  }
  if (blockers.length) return blockedWorkOrder(identity, unique(blockers), warnings);

  const setSeed = fingerprintBookIllustrationValue({
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    baseWorkOrderFingerprintSha256: normalizeDigest(
      baseWorkOrder.workOrderFingerprintSha256,
    ),
    candidateCount,
    requestedAt,
    requestedBy,
  });
  const hex = setSeed.replace(/^sha256:/u, "");
  const candidateSetId = `candidate-set-${hex.slice(0, 40)}`;
  const providerRequest: BookArtCandidateSetProviderRequestV1 = {
    ...clone(baseWorkOrder.providerRequest),
    requestId: `book-set-${hex.slice(0, 40)}`,
    candidateCount,
    selection: {
      ...clone(baseWorkOrder.providerRequest.selection),
      allowFallback: false,
      requireSeed: false,
    },
    metadata: {
      ...clone(baseWorkOrder.providerRequest.metadata),
      candidateSetId,
      candidateCount,
      completePairwiseComparisonRequired: true,
      independentSetReviewRequired: true,
      generatedTextProhibited: true,
      automaticSelectionAllowed: false,
      publicationPerformed: false,
    },
  };
  const policy = candidateSetPolicy();
  const withoutFingerprint: Omit<
    BookArtCandidateSetWorkOrderV1,
    "workOrderFingerprintSha256"
  > = {
    outputKind: "evavo_book_art_candidate_set_work_order",
    schemaVersion: BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    identity: clone(baseWorkOrder.identity),
    purpose: baseWorkOrder.purpose,
    candidateSetId,
    candidateCount,
    sourceBriefFingerprint: normalizeDigest(
      baseWorkOrder.sourceBriefFingerprint,
    ),
    baseWorkOrderFingerprintSha256: normalizeDigest(
      baseWorkOrder.workOrderFingerprintSha256,
    ),
    baseWorkOrder: clone(baseWorkOrder),
    providerRequest,
    policy,
    requestedAt,
    requestedBy,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
  const workOrder: BookArtCandidateSetWorkOrderV1 = {
    ...withoutFingerprint,
    workOrderFingerprintSha256:
      fingerprintBookIllustrationValue(withoutFingerprint),
  };
  const issues = await validateBookArtCandidateSetWorkOrder(workOrder);
  if (issues.length) {
    return blockedWorkOrder(identity, issues, warnings);
  }
  warnings.push(
    `One provider job must return exactly ${candidateCount} unapproved alternatives; none may be promoted without individual QA, individual consensus, complete pairwise comparison and Docs Suite creative-quality approval.`,
  );
  return {
    outputKind: "evavo_book_art_candidate_set_work_order_compilation_result",
    schemaVersion: BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    status: "ready",
    identity: clone(baseWorkOrder.identity),
    workOrder,
    blockers: [],
    warnings,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    publicationPerformed: false,
  };
}

export async function validateBookArtCandidateSetWorkOrder(
  value: unknown,
): Promise<string[]> {
  const issues: string[] = [];
  const workOrder = strictObject(
    value,
    "candidate-set work order",
    WORK_ORDER_KEYS,
    issues,
  );
  if (!workOrder) return unique(issues);
  if (
    workOrder.outputKind !== "evavo_book_art_candidate_set_work_order" ||
    workOrder.schemaVersion !== BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION ||
    workOrder.contract !== BOOK_ART_CANDIDATE_SET_CONTRACT
  ) {
    issues.push("Candidate-set work-order identity or version is invalid.");
  }
  const identity = parseIdentity(
    strictObject(workOrder.identity, "candidate-set identity", IDENTITY_KEYS, issues),
  );
  const candidateSetId = safeId(
    workOrder.candidateSetId,
    "candidateSetId",
    issues,
  );
  const candidateCount = integer(
    workOrder.candidateCount,
    BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
    BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
    "candidateCount",
    issues,
  );
  const sourceBriefFingerprint = digest(
    workOrder.sourceBriefFingerprint,
    "sourceBriefFingerprint",
    issues,
  );
  const baseFingerprint = digest(
    workOrder.baseWorkOrderFingerprintSha256,
    "baseWorkOrderFingerprintSha256",
    issues,
  );
  const requestedAt = timestamp(
    workOrder.requestedAt,
    "candidate-set requestedAt",
    issues,
  );
  safeId(workOrder.requestedBy, "candidate-set requestedBy", issues);

  const baseWorkOrder = workOrder.baseWorkOrder as BookArtProductionWorkOrderV1;
  if (!record(baseWorkOrder)) {
    issues.push("Candidate-set base work order is missing.");
  } else {
    try {
      const validation = await validateBookArtProductionWorkOrder(baseWorkOrder);
      issues.push(...validation.issues);
    } catch (error: unknown) {
      issues.push(message(error, "Candidate-set base work-order validation failed."));
    }
  }
  if (baseWorkOrder) {
    if (!sameIdentity(identity, baseWorkOrder.identity)) {
      issues.push("Candidate-set identity differs from the governed base work order.");
    }
    if (workOrder.purpose !== baseWorkOrder.purpose) {
      issues.push("Candidate-set purpose differs from the governed base work order.");
    }
    if (sourceBriefFingerprint !== normalizeDigest(baseWorkOrder.sourceBriefFingerprint)) {
      issues.push("Candidate-set source brief differs from the governed base work order.");
    }
    if (baseFingerprint !== normalizeDigest(baseWorkOrder.workOrderFingerprintSha256)) {
      issues.push("Candidate-set base fingerprint differs from the governed work order.");
    }
  }

  const provider = strictObject(
    workOrder.providerRequest,
    "candidate-set provider request",
    CANDIDATE_PROVIDER_KEYS,
    issues,
  );
  const providerMetadata = strictObject(
    provider?.metadata,
    "candidate-set provider metadata",
    CANDIDATE_METADATA_KEYS,
    issues,
  );
  if (provider && baseWorkOrder) {
    if (
      provider.operation !== "generate" ||
      provider.continuityPhase !== "independent" ||
      provider.candidateCount !== candidateCount
    ) {
      issues.push(
        "Candidate-set provider request must generate the exact bounded candidate count.",
      );
    }
    if (
      record(provider.selection)?.allowFallback !== false ||
      record(provider.selection)?.requireSeed !== false
    ) {
      issues.push("Candidate-set provider fallback and required seed must remain disabled.");
    }
    for (const key of [
      "assetKind",
      "assetId",
      "candidateFamilyId",
      "creativeIntent",
      "negativeIntent",
      "quality",
    ] as const) {
      if (canonical(provider[key]) !== canonical(baseWorkOrder.providerRequest[key])) {
        issues.push(`Candidate-set provider ${key} differs from the governed base work order.`);
      }
    }
    for (const key of ["style", "shot", "target", "background"] as const) {
      if (canonical(provider[key]) !== canonical(baseWorkOrder.providerRequest[key])) {
        issues.push(`Candidate-set provider ${key} differs from the governed base work order.`);
      }
    }
  }
  if (providerMetadata) {
    if (
      providerMetadata.candidateSetId !== candidateSetId ||
      providerMetadata.candidateCount !== candidateCount ||
      providerMetadata.completePairwiseComparisonRequired !== true ||
      providerMetadata.independentSetReviewRequired !== true ||
      providerMetadata.generatedTextProhibited !== true ||
      providerMetadata.automaticSelectionAllowed !== false ||
      providerMetadata.publicationPerformed !== false
    ) {
      issues.push("Candidate-set provider metadata lost its quality or authority boundary.");
    }
  }
  validatePolicy(workOrder.policy, issues);
  for (const field of [
    "providerCallPerformed",
    "candidateArtifactsWritten",
    "selectionPerformed",
    "promotionPerformed",
    "bookUseBindingCreated",
    "publicationPerformed",
  ] as const) {
    if (workOrder[field] !== false) {
      issues.push(`Candidate-set work order cannot claim ${field}.`);
    }
  }
  const observedFingerprint = digest(
    workOrder.workOrderFingerprintSha256,
    "workOrderFingerprintSha256",
    issues,
  );
  const { workOrderFingerprintSha256: _discarded, ...unsigned } =
    workOrder as unknown as BookArtCandidateSetWorkOrderV1;
  const expectedFingerprint = fingerprintBookIllustrationValue(unsigned);
  if (observedFingerprint !== expectedFingerprint) {
    issues.push("Candidate-set work-order fingerprint differs from exact contents.");
  }
  if (Date.parse(requestedAt) < 0) {
    issues.push("Candidate-set requestedAt is invalid.");
  }
  return unique(issues);
}

export interface BookArtCandidateSetConsensusCandidateV1 {
  candidateId: string;
  candidateProducerId: string;
  candidateContentSha256: string;
  candidateArtifactFingerprint: string;
  planFingerprint: string;
  conceptFingerprint: string;
  compositionFingerprint: string;
  silhouetteFingerprint: string;
  manuscriptEvidenceIds: string[];
  evidenceIds: string[];
  visualConsensus: BookIllustrationVisualConsensusEvaluationV1;
}

export interface BookArtCandidateSetPairwiseComparisonV1 {
  leftCandidateId: string;
  rightCandidateId: string;
  overallSimilarityBasisPoints: number;
  conceptSimilarityBasisPoints: number;
  compositionSimilarityBasisPoints: number;
  silhouetteSimilarityBasisPoints: number;
  evidenceIds: string[];
}

export type BookArtCandidateSetReviewMethod =
  | "human"
  | "human_with_machine_assistance";

export interface BookArtCandidateSetConsensusInputV1 {
  outputKind: "evavo_art_book_candidate_set_consensus_input";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CANDIDATE_SET_CONTRACT;
  candidateSetId: string;
  workOrderFingerprintSha256: string;
  expectedCandidateCount: number;
  providerRunFingerprint: string;
  candidates: BookArtCandidateSetConsensusCandidateV1[];
  pairwiseComparisons: BookArtCandidateSetPairwiseComparisonV1[];
  setReviewerId: string;
  setReviewMethod: BookArtCandidateSetReviewMethod;
  machineOnlyDecision: false;
  requestedAt: string;
  requestedBy: string;
  providerCallAllowed: false;
  reviewerFallbackAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  bookUseBindingAllowed: false;
  publicationAllowed: false;
}

export interface BookArtCandidateSetConsensusEvaluationV1 {
  outputKind: "evavo_art_book_candidate_set_consensus_evaluation";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CANDIDATE_SET_CONTRACT;
  status: "needs_work" | "ready_for_docs_quality_gate";
  candidateSetId: string;
  workOrderFingerprintSha256: string;
  expectedCandidateCount: number;
  providerRunFingerprint: string;
  candidates: BookArtCandidateSetConsensusCandidateV1[];
  pairwiseComparisons: BookArtCandidateSetPairwiseComparisonV1[];
  candidateIds: string[];
  planFingerprint: string;
  setReviewerId: string;
  setReviewMethod: BookArtCandidateSetReviewMethod;
  machineOnlyDecision: false;
  nearDuplicateBasisPoints:
    typeof BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS;
  requiredActions: string[];
  evaluationFingerprint: string;
  providerCallPerformed: false;
  reviewerFallbackAllowed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
}

export interface BookArtCandidateSetConsensusResultV1 {
  outputKind: "evavo_art_book_candidate_set_consensus_result";
  schemaVersion: typeof BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CANDIDATE_SET_CONTRACT;
  status: "blocked" | "needs_work" | "ready_for_docs_quality_gate";
  evaluation?: BookArtCandidateSetConsensusEvaluationV1;
  blockers: string[];
  requiredActions: string[];
  providerCallPerformed: false;
  reviewerFallbackAllowed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
}

export function evaluateBookArtCandidateSetConsensus(
  value: unknown,
): BookArtCandidateSetConsensusResultV1 {
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  const input = strictObject(
    value,
    "candidate-set consensus input",
    CONSENSUS_INPUT_KEYS,
    blockers,
  );
  if (!input) return blockedConsensus(blockers);
  if (
    input.outputKind !== "evavo_art_book_candidate_set_consensus_input" ||
    input.schemaVersion !== BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION ||
    input.contract !== BOOK_ART_CANDIDATE_SET_CONTRACT
  ) {
    blockers.push("Candidate-set consensus input identity or version is invalid.");
  }
  for (const field of [
    "machineOnlyDecision",
    "providerCallAllowed",
    "reviewerFallbackAllowed",
    "automaticSelectionAllowed",
    "automaticPromotionAllowed",
    "bookUseBindingAllowed",
    "publicationAllowed",
  ] as const) {
    if (input[field] !== false) blockers.push(`${field} must remain false.`);
  }
  const candidateSetId = safeId(
    input.candidateSetId,
    "candidateSetId",
    blockers,
  );
  const workOrderFingerprintSha256 = digest(
    input.workOrderFingerprintSha256,
    "workOrderFingerprintSha256",
    blockers,
  );
  const expectedCandidateCount = integer(
    input.expectedCandidateCount,
    BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
    BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
    "expectedCandidateCount",
    blockers,
  );
  const providerRunFingerprint = digest(
    input.providerRunFingerprint,
    "providerRunFingerprint",
    blockers,
  );
  const setReviewerId = safeId(
    input.setReviewerId,
    "setReviewerId",
    blockers,
  );
  const setReviewMethod = enumeration(
    input.setReviewMethod,
    SET_REVIEW_METHODS,
    "setReviewMethod",
    blockers,
    "human",
  );
  timestamp(input.requestedAt, "candidate-set consensus requestedAt", blockers);
  safeId(input.requestedBy, "candidate-set consensus requestedBy", blockers);

  const candidateValues = Array.isArray(input.candidates)
    ? input.candidates
    : [];
  if (
    !Array.isArray(input.candidates) ||
    candidateValues.length < BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES ||
    candidateValues.length > BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES
  ) {
    blockers.push(
      `Candidate-set consensus requires ${BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES} to ${BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES} candidates.`,
    );
  }
  if (
    Array.isArray(input.candidates) &&
    candidateValues.length !== expectedCandidateCount
  ) {
    blockers.push(
      `Candidate-set consensus requires exactly ${expectedCandidateCount} candidates from the governed work order.`,
    );
  }
  const candidates = candidateValues
    .map((entry, index) =>
      parseConsensusCandidate(entry, index, blockers, requiredActions),
    )
    .filter((entry): entry is BookArtCandidateSetConsensusCandidateV1 =>
      entry !== undefined,
    )
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  for (const [label, values] of [
    ["candidate IDs", candidates.map((item) => item.candidateId)],
    ["candidate content hashes", candidates.map((item) => item.candidateContentSha256)],
    ["candidate artifact fingerprints", candidates.map((item) => item.candidateArtifactFingerprint)],
  ] as const) {
    if (duplicates(values).length) blockers.push(`Candidate-set ${label} are duplicated.`);
  }
  const producerIds = unique(
    candidates.map((candidate) => candidate.candidateProducerId),
  );
  if (producerIds.includes(setReviewerId)) {
    blockers.push("Candidate-set reviewer cannot be a candidate producer.");
  }
  const planFingerprints = unique(candidates.map((item) => item.planFingerprint));
  if (planFingerprints.length !== 1) {
    blockers.push("Every candidate must belong to the same exact illustration plan.");
  }
  for (const [label, values] of [
    ["concept", candidates.map((item) => item.conceptFingerprint)],
    ["composition", candidates.map((item) => item.compositionFingerprint)],
    ["silhouette", candidates.map((item) => item.silhouetteFingerprint)],
  ] as const) {
    if (duplicates(values).length) {
      requiredActions.push(
        `Regenerate the candidate set with distinct ${label} decisions rather than template variants.`,
      );
    }
  }

  const pairValues = Array.isArray(input.pairwiseComparisons)
    ? input.pairwiseComparisons
    : [];
  if (!Array.isArray(input.pairwiseComparisons)) {
    blockers.push("pairwiseComparisons must be an array.");
  }
  const candidateIdSet = new Set(candidates.map((item) => item.candidateId));
  const comparisons = pairValues
    .map((entry, index) =>
      parsePairwiseComparison(entry, index, candidateIdSet, blockers),
    )
    .filter((entry): entry is BookArtCandidateSetPairwiseComparisonV1 =>
      entry !== undefined,
    )
    .sort((left, right) => pairKey(left).localeCompare(pairKey(right)));
  const observedPairKeys = comparisons.map(pairKey);
  if (duplicates(observedPairKeys).length) {
    blockers.push("Candidate-set pairwise comparisons are duplicated.");
  }
  const expectedPairKeys = completePairKeys([...candidateIdSet].sort());
  const missingPairs = expectedPairKeys.filter(
    (key) => !new Set(observedPairKeys).has(key),
  );
  const unexpectedPairs = observedPairKeys.filter(
    (key) => !new Set(expectedPairKeys).has(key),
  );
  if (missingPairs.length) {
    blockers.push(`Candidate-set comparisons are missing: ${missingPairs.join(", ")}.`);
  }
  if (unexpectedPairs.length) {
    blockers.push(
      `Candidate-set comparisons contain unknown pairs: ${unexpectedPairs.join(", ")}.`,
    );
  }
  for (const comparison of comparisons) {
    const excessive = [
      comparison.overallSimilarityBasisPoints,
      comparison.conceptSimilarityBasisPoints,
      comparison.compositionSimilarityBasisPoints,
      comparison.silhouetteSimilarityBasisPoints,
    ].some(
      (score) =>
        score >= BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS,
    );
    if (excessive) {
      requiredActions.push(
        `Regenerate near-duplicate pair ${comparison.leftCandidateId}/${comparison.rightCandidateId}; every similarity measure must remain below ${BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS} basis points.`,
      );
    }
  }

  if (blockers.length) return blockedConsensus(unique(blockers));
  const status: BookArtCandidateSetConsensusEvaluationV1["status"] =
    requiredActions.length ? "needs_work" : "ready_for_docs_quality_gate";
  const unsigned: Omit<
    BookArtCandidateSetConsensusEvaluationV1,
    "evaluationFingerprint"
  > = {
    outputKind: "evavo_art_book_candidate_set_consensus_evaluation",
    schemaVersion: BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    status,
    candidateSetId,
    workOrderFingerprintSha256,
    expectedCandidateCount,
    providerRunFingerprint,
    candidates,
    pairwiseComparisons: comparisons,
    candidateIds: candidates.map((item) => item.candidateId),
    planFingerprint: planFingerprints[0]!,
    setReviewerId,
    setReviewMethod,
    machineOnlyDecision: false,
    nearDuplicateBasisPoints:
      BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS,
    requiredActions: unique(requiredActions).sort(),
    providerCallPerformed: false,
    reviewerFallbackAllowed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
  const evaluation: BookArtCandidateSetConsensusEvaluationV1 = {
    ...unsigned,
    evaluationFingerprint: fingerprintBookIllustrationValue(unsigned),
  };
  return {
    outputKind: "evavo_art_book_candidate_set_consensus_result",
    schemaVersion: BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    status,
    evaluation,
    blockers: [],
    requiredActions: evaluation.requiredActions,
    providerCallPerformed: false,
    reviewerFallbackAllowed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
}

export function fingerprintBookArtCandidateSetConsensusEvaluation(
  value:
    | Omit<BookArtCandidateSetConsensusEvaluationV1, "evaluationFingerprint">
    | BookArtCandidateSetConsensusEvaluationV1,
): string {
  const { evaluationFingerprint: _discarded, ...unsigned } =
    value as BookArtCandidateSetConsensusEvaluationV1;
  return fingerprintBookIllustrationValue(unsigned);
}

export function validateBookArtCandidateSetConsensusEvaluation(
  value: unknown,
): string[] {
  const issues: string[] = [];
  const evaluation = strictObject(
    value,
    "candidate-set consensus evaluation",
    CONSENSUS_EVALUATION_KEYS,
    issues,
  );
  if (!evaluation) return unique(issues);
  if (
    evaluation.outputKind !==
      "evavo_art_book_candidate_set_consensus_evaluation" ||
    evaluation.schemaVersion !== BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION ||
    evaluation.contract !== BOOK_ART_CANDIDATE_SET_CONTRACT
  ) {
    issues.push("Candidate-set consensus evaluation identity or version is invalid.");
  }
  if (
    evaluation.status !== "needs_work" &&
    evaluation.status !== "ready_for_docs_quality_gate"
  ) {
    issues.push("Candidate-set consensus status is invalid.");
  }
  const candidates = Array.isArray(evaluation.candidates)
    ? evaluation.candidates
    : [];
  const expectedCandidateCount = integer(
    evaluation.expectedCandidateCount,
    BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
    BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
    "expectedCandidateCount",
    issues,
  );
  if (
    candidates.length < BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES ||
    candidates.length > BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES
  ) {
    issues.push("Candidate-set consensus candidate count is invalid.");
  }
  if (
    Array.isArray(evaluation.candidates) &&
    candidates.length !== expectedCandidateCount
  ) {
    issues.push("Candidate-set evaluation does not contain the exact governed candidate count.");
  }
  if (
    !Array.isArray(evaluation.candidateIds) ||
    canonical(evaluation.candidateIds) !==
      canonical(
        candidates
          .map((entry) => record(entry)?.candidateId)
          .filter((entry): entry is string => typeof entry === "string")
          .sort(),
      )
  ) {
    issues.push("Candidate-set evaluation candidateIds differ from candidate evidence.");
  }
  if (
    evaluation.nearDuplicateBasisPoints !==
    BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS
  ) {
    issues.push("Candidate-set near-duplicate threshold changed.");
  }
  if (
    evaluation.machineOnlyDecision !== false ||
    evaluation.providerCallPerformed !== false ||
    evaluation.reviewerFallbackAllowed !== false ||
    evaluation.selectionPerformed !== false ||
    evaluation.promotionPerformed !== false ||
    evaluation.bookUseBindingCreated !== false ||
    evaluation.publicationPerformed !== false
  ) {
    issues.push("Candidate-set evaluation claims a forbidden side effect or authority.");
  }
  if (
    evaluation.status === "ready_for_docs_quality_gate" &&
    Array.isArray(evaluation.requiredActions) &&
    evaluation.requiredActions.length
  ) {
    issues.push("Ready candidate-set consensus cannot retain required actions.");
  }
  const replay = evaluateBookArtCandidateSetConsensus({
    outputKind: "evavo_art_book_candidate_set_consensus_input",
    schemaVersion: BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    candidateSetId: evaluation.candidateSetId,
    workOrderFingerprintSha256: evaluation.workOrderFingerprintSha256,
    expectedCandidateCount: evaluation.expectedCandidateCount,
    providerRunFingerprint: evaluation.providerRunFingerprint,
    candidates: evaluation.candidates,
    pairwiseComparisons: evaluation.pairwiseComparisons,
    setReviewerId: evaluation.setReviewerId,
    setReviewMethod: evaluation.setReviewMethod,
    machineOnlyDecision: evaluation.machineOnlyDecision,
    requestedAt: "1970-01-01T00:00:00.000Z",
    requestedBy: "candidate-set-evaluation-validator",
    providerCallAllowed: false,
    reviewerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingAllowed: false,
    publicationAllowed: false,
  });
  if (replay.status === "blocked" || !replay.evaluation) {
    issues.push(
      ...replay.blockers.map(
        (issue) => `Candidate-set semantic replay: ${issue}`,
      ),
    );
  } else {
    const {
      evaluationFingerprint: _observedReplayFingerprint,
      ...observedReplay
    } = evaluation as unknown as BookArtCandidateSetConsensusEvaluationV1;
    const {
      evaluationFingerprint: _expectedReplayFingerprint,
      ...expectedReplay
    } = replay.evaluation;
    if (canonical(observedReplay) !== canonical(expectedReplay)) {
      issues.push(
        "Candidate-set consensus evaluation differs from canonical semantic replay.",
      );
    }
  }
  const observed = digest(
    evaluation.evaluationFingerprint,
    "evaluationFingerprint",
    issues,
  );
  const expected = fingerprintBookArtCandidateSetConsensusEvaluation(
    evaluation as unknown as BookArtCandidateSetConsensusEvaluationV1,
  );
  if (observed !== expected) {
    issues.push("Candidate-set evaluation fingerprint differs from exact contents.");
  }
  return unique(issues);
}

function parseConsensusCandidate(
  value: unknown,
  index: number,
  blockers: string[],
  requiredActions: string[],
): BookArtCandidateSetConsensusCandidateV1 | undefined {
  const label = `candidates[${index}]`;
  const candidate = strictObject(value, label, CANDIDATE_KEYS, blockers);
  if (!candidate) return undefined;
  const candidateId = safeId(
    candidate.candidateId,
    `${label}.candidateId`,
    blockers,
  );
  const candidateProducerId = safeId(
    candidate.candidateProducerId,
    `${label}.candidateProducerId`,
    blockers,
  );
  const candidateContentSha256 = digest(
    candidate.candidateContentSha256,
    `${label}.candidateContentSha256`,
    blockers,
  );
  const candidateArtifactFingerprint = digest(
    candidate.candidateArtifactFingerprint,
    `${label}.candidateArtifactFingerprint`,
    blockers,
  );
  const planFingerprint = digest(
    candidate.planFingerprint,
    `${label}.planFingerprint`,
    blockers,
  );
  const conceptFingerprint = digest(
    candidate.conceptFingerprint,
    `${label}.conceptFingerprint`,
    blockers,
  );
  const compositionFingerprint = digest(
    candidate.compositionFingerprint,
    `${label}.compositionFingerprint`,
    blockers,
  );
  const silhouetteFingerprint = digest(
    candidate.silhouetteFingerprint,
    `${label}.silhouetteFingerprint`,
    blockers,
  );
  const manuscriptEvidenceIds = stringArray(
    candidate.manuscriptEvidenceIds,
    `${label}.manuscriptEvidenceIds`,
    blockers,
    1,
    256,
  );
  if (manuscriptEvidenceIds.length < 2) {
    requiredActions.push(
      `Candidate ${candidateId} needs evidence from at least two manuscript-specific anchors.`,
    );
  }
  const evidenceIds = stringArray(
    candidate.evidenceIds,
    `${label}.evidenceIds`,
    blockers,
    1,
    512,
  );
  const visualConsensus = candidate.visualConsensus as
    | BookIllustrationVisualConsensusEvaluationV1
    | undefined;
  validateVisualConsensus(
    visualConsensus,
    {
      candidateId,
      candidateProducerId,
      candidateContentSha256,
      candidateArtifactFingerprint,
      planFingerprint,
    },
    label,
    blockers,
    requiredActions,
  );
  if (!visualConsensus) return undefined;
  return {
    candidateId,
    candidateProducerId,
    candidateContentSha256,
    candidateArtifactFingerprint,
    planFingerprint,
    conceptFingerprint,
    compositionFingerprint,
    silhouetteFingerprint,
    manuscriptEvidenceIds: [...manuscriptEvidenceIds].sort(),
    evidenceIds: [...evidenceIds].sort(),
    visualConsensus: clone(visualConsensus),
  };
}

function validateVisualConsensus(
  value: BookIllustrationVisualConsensusEvaluationV1 | undefined,
  expected: Readonly<{
    candidateId: string;
    candidateProducerId: string;
    candidateContentSha256: string;
    candidateArtifactFingerprint: string;
    planFingerprint: string;
  }>,
  label: string,
  blockers: string[],
  requiredActions: string[],
): void {
  const source = strictObject(
    value,
    `${label}.visualConsensus`,
    VISUAL_CONSENSUS_KEYS,
    blockers,
  );
  if (!source) return;
  if (
    source.outputKind !== "evavo_art_book_visual_consensus_evaluation" ||
    source.schemaVersion !== 1 ||
    source.contract !== "evavo_art_book_illustration_intelligence_v1"
  ) {
    blockers.push(`${label}.visualConsensus identity is invalid.`);
  }
  const observedFingerprint = digest(
    source.evaluationFingerprint,
    `${label}.visualConsensus.evaluationFingerprint`,
    blockers,
  );
  const { evaluationFingerprint: _discarded, ...unsigned } =
    source as unknown as BookIllustrationVisualConsensusEvaluationV1;
  if (observedFingerprint !== fingerprintBookIllustrationValue(unsigned)) {
    blockers.push(`${label}.visualConsensus fingerprint differs from exact contents.`);
  }
  if (
    source.candidateId !== expected.candidateId ||
    normalizeDigest(String(source.candidateContentSha256)) !==
      expected.candidateContentSha256 ||
    normalizeDigest(String(source.candidateArtifactFingerprint)) !==
      expected.candidateArtifactFingerprint ||
    normalizeDigest(String(source.planFingerprint)) !== expected.planFingerprint
  ) {
    blockers.push(`${label}.visualConsensus belongs to different candidate evidence.`);
  }
  const reviewFingerprints = stringArray(
    source.reviewFingerprints,
    `${label}.visualConsensus.reviewFingerprints`,
    blockers,
    2,
    16,
  ).map((entry, index) =>
    digest(
      entry,
      `${label}.visualConsensus.reviewFingerprints[${index}]`,
      blockers,
    ),
  );
  const passingReviewerProducerIds = stringArray(
    source.passingReviewerProducerIds,
    `${label}.visualConsensus.passingReviewerProducerIds`,
    blockers,
    0,
    16,
  ).map((entry, index) =>
    safeId(
      entry,
      `${label}.visualConsensus.passingReviewerProducerIds[${index}]`,
      blockers,
    ),
  );
  const dissentingReviewerProducerIds = stringArray(
    source.dissentingReviewerProducerIds,
    `${label}.visualConsensus.dissentingReviewerProducerIds`,
    blockers,
    0,
    16,
  ).map((entry, index) =>
    safeId(
      entry,
      `${label}.visualConsensus.dissentingReviewerProducerIds[${index}]`,
      blockers,
    ),
  );
  const reviewerProducerIds = [
    ...passingReviewerProducerIds,
    ...dissentingReviewerProducerIds,
  ];
  if (duplicates(reviewFingerprints).length) {
    blockers.push(`${label}.visualConsensus review fingerprints are duplicated.`);
  }
  if (duplicates(reviewerProducerIds).length) {
    blockers.push(`${label}.visualConsensus reviewer producers are duplicated.`);
  }
  if (reviewerProducerIds.includes(expected.candidateProducerId)) {
    blockers.push(`${label}.visualConsensus is not independent from the candidate producer.`);
  }
  if (reviewFingerprints.length !== reviewerProducerIds.length) {
    blockers.push(`${label}.visualConsensus reviewer summary count is inconsistent.`);
  }
  const minimumIndependentReviewers = integer(
    source.minimumIndependentReviewers,
    2,
    16,
    `${label}.visualConsensus.minimumIndependentReviewers`,
    blockers,
  );
  const minimumConsensusBasisPoints = integer(
    source.minimumConsensusBasisPoints,
    5_000,
    10_000,
    `${label}.visualConsensus.minimumConsensusBasisPoints`,
    blockers,
  );
  const consensusBasisPoints = integer(
    source.consensusBasisPoints,
    0,
    10_000,
    `${label}.visualConsensus.consensusBasisPoints`,
    blockers,
  );
  const expectedConsensusBasisPoints = Math.floor(
    (passingReviewerProducerIds.length * 10_000) /
      Math.max(reviewerProducerIds.length, 1),
  );
  if (consensusBasisPoints !== expectedConsensusBasisPoints) {
    blockers.push(`${label}.visualConsensus consensus basis points are inconsistent.`);
  }
  if (
    source.consensusReached === true &&
    (passingReviewerProducerIds.length < minimumIndependentReviewers ||
      consensusBasisPoints < minimumConsensusBasisPoints)
  ) {
    blockers.push(`${label}.visualConsensus cannot claim consensus without the required independent passing reviewers.`);
  }
  if (
    typeof source.minimumPassingReviewerScore !== "number" ||
    !Number.isFinite(source.minimumPassingReviewerScore) ||
    source.minimumPassingReviewerScore < 0 ||
    source.minimumPassingReviewerScore > 100
  ) {
    blockers.push(`${label}.visualConsensus minimumPassingReviewerScore is invalid.`);
  }
  if (
    source.providerCallPerformed !== false ||
    source.reviewerFallbackAllowed !== false ||
    source.selectionPerformed !== false ||
    source.promotionPerformed !== false ||
    source.bookUseBindingCreated !== false ||
    source.publicationPerformed !== false
  ) {
    blockers.push(`${label}.visualConsensus claims forbidden authority.`);
  }
  if (
    source.status !== "ready_for_governed_selection" ||
    source.consensusReached !== true ||
    !Array.isArray(source.requiredActions) ||
    source.requiredActions.length !== 0
  ) {
    requiredActions.push(
      `Candidate ${expected.candidateId} must reach clean independent visual consensus before set review.`,
    );
  }
}

function parsePairwiseComparison(
  value: unknown,
  index: number,
  candidateIds: ReadonlySet<string>,
  blockers: string[],
): BookArtCandidateSetPairwiseComparisonV1 | undefined {
  const label = `pairwiseComparisons[${index}]`;
  const pair = strictObject(value, label, PAIR_KEYS, blockers);
  if (!pair) return undefined;
  const left = safeId(
    pair.leftCandidateId,
    `${label}.leftCandidateId`,
    blockers,
  );
  const right = safeId(
    pair.rightCandidateId,
    `${label}.rightCandidateId`,
    blockers,
  );
  if (left === right) blockers.push(`${label} cannot compare a candidate with itself.`);
  if (!candidateIds.has(left) || !candidateIds.has(right)) {
    blockers.push(`${label} references a candidate outside the exact set.`);
  }
  if (left.localeCompare(right) >= 0) {
    blockers.push(`${label} candidate IDs must be in canonical ascending order.`);
  }
  return {
    leftCandidateId: left,
    rightCandidateId: right,
    overallSimilarityBasisPoints: integer(
      pair.overallSimilarityBasisPoints,
      0,
      10_000,
      `${label}.overallSimilarityBasisPoints`,
      blockers,
    ),
    conceptSimilarityBasisPoints: integer(
      pair.conceptSimilarityBasisPoints,
      0,
      10_000,
      `${label}.conceptSimilarityBasisPoints`,
      blockers,
    ),
    compositionSimilarityBasisPoints: integer(
      pair.compositionSimilarityBasisPoints,
      0,
      10_000,
      `${label}.compositionSimilarityBasisPoints`,
      blockers,
    ),
    silhouetteSimilarityBasisPoints: integer(
      pair.silhouetteSimilarityBasisPoints,
      0,
      10_000,
      `${label}.silhouetteSimilarityBasisPoints`,
      blockers,
    ),
    evidenceIds: stringArray(
      pair.evidenceIds,
      `${label}.evidenceIds`,
      blockers,
      1,
      256,
    ).sort(),
  };
}

function candidateSetPolicy(): BookArtCandidateSetPolicyV1 {
  return {
    minimumCandidates: BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
    maximumCandidates: BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
    nearDuplicateBasisPoints:
      BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS,
    everyCandidateRequiresTechnicalQa: true,
    everyCandidateRequiresIndependentVisualConsensus: true,
    completePairwiseComparisonRequired: true,
    manuscriptEvidenceRequiredForEveryCandidate: true,
    distinctConceptCompositionAndSilhouetteRequired: true,
    generatedTextProhibited: true,
    oneProviderAttemptPerCandidateSet: true,
    providerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
  };
}

function validatePolicy(value: unknown, issues: string[]): void {
  const policy = strictObject(value, "candidate-set policy", POLICY_KEYS, issues);
  if (!policy || canonical(policy) !== canonical(candidateSetPolicy())) {
    issues.push("Candidate-set policy differs from the mandatory quality boundary.");
  }
}

function blockedWorkOrder(
  identity: BookArtIdentityV1,
  blockers: string[],
  warnings: string[],
): BookArtCandidateSetWorkOrderCompilationResultV1 {
  return {
    outputKind: "evavo_book_art_candidate_set_work_order_compilation_result",
    schemaVersion: BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    status: "blocked",
    identity,
    blockers: unique(blockers),
    warnings: unique(warnings),
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    selectionPerformed: false,
    promotionPerformed: false,
    publicationPerformed: false,
  };
}

function blockedConsensus(blockers: string[]): BookArtCandidateSetConsensusResultV1 {
  return {
    outputKind: "evavo_art_book_candidate_set_consensus_result",
    schemaVersion: BOOK_ART_CANDIDATE_SET_SCHEMA_VERSION,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    status: "blocked",
    blockers: unique(blockers),
    requiredActions: [
      "Correct the malformed, incomplete, stale or unauthorised candidate-set evidence.",
    ],
    providerCallPerformed: false,
    reviewerFallbackAllowed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/u;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const WORK_ORDER_INPUT_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "baseWorkOrder",
  "candidateCount",
  "requestedAt",
  "requestedBy",
  "providerFallbackAllowed",
  "automaticSelectionAllowed",
  "automaticPromotionAllowed",
  "publicationAllowed",
]);
const WORK_ORDER_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "identity",
  "purpose",
  "candidateSetId",
  "candidateCount",
  "sourceBriefFingerprint",
  "baseWorkOrderFingerprintSha256",
  "baseWorkOrder",
  "providerRequest",
  "policy",
  "requestedAt",
  "requestedBy",
  "workOrderFingerprintSha256",
  "providerCallPerformed",
  "candidateArtifactsWritten",
  "selectionPerformed",
  "promotionPerformed",
  "bookUseBindingCreated",
  "publicationPerformed",
]);
const IDENTITY_KEYS = new Set([
  "workspaceId",
  "projectId",
  "bookId",
  "editionId",
  "requestId",
]);
const CANDIDATE_PROVIDER_KEYS = new Set([
  "schemaVersion",
  "operation",
  "assetKind",
  "continuityPhase",
  "requestId",
  "assetId",
  "candidateFamilyId",
  "creativeIntent",
  "negativeIntent",
  "style",
  "shot",
  "target",
  "background",
  "quality",
  "candidateCount",
  "selection",
  "metadata",
]);
const CANDIDATE_METADATA_KEYS = new Set([
  "workspaceId",
  "projectId",
  "bookId",
  "editionId",
  "bookRequestId",
  "purpose",
  "manuscriptRevisionId",
  "manuscriptSha256",
  "extractedTextSha256",
  "visualCanonSha256",
  "artDirectionSha256",
  "sourceBriefFingerprint",
  "conceptTerritoryId",
  "rightsEvidenceIds",
  "providerCandidateMayBeFinal",
  "candidateSetId",
  "candidateCount",
  "completePairwiseComparisonRequired",
  "independentSetReviewRequired",
  "generatedTextProhibited",
  "automaticSelectionAllowed",
  "publicationPerformed",
]);
const POLICY_KEYS = new Set(Object.keys(candidateSetPolicy()));
const CONSENSUS_INPUT_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "candidateSetId",
  "workOrderFingerprintSha256",
  "expectedCandidateCount",
  "providerRunFingerprint",
  "candidates",
  "pairwiseComparisons",
  "setReviewerId",
  "setReviewMethod",
  "machineOnlyDecision",
  "requestedAt",
  "requestedBy",
  "providerCallAllowed",
  "reviewerFallbackAllowed",
  "automaticSelectionAllowed",
  "automaticPromotionAllowed",
  "bookUseBindingAllowed",
  "publicationAllowed",
]);
const CANDIDATE_KEYS = new Set([
  "candidateId",
  "candidateProducerId",
  "candidateContentSha256",
  "candidateArtifactFingerprint",
  "planFingerprint",
  "conceptFingerprint",
  "compositionFingerprint",
  "silhouetteFingerprint",
  "manuscriptEvidenceIds",
  "evidenceIds",
  "visualConsensus",
]);
const PAIR_KEYS = new Set([
  "leftCandidateId",
  "rightCandidateId",
  "overallSimilarityBasisPoints",
  "conceptSimilarityBasisPoints",
  "compositionSimilarityBasisPoints",
  "silhouetteSimilarityBasisPoints",
  "evidenceIds",
]);
const VISUAL_CONSENSUS_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "status",
  "candidateId",
  "candidateContentSha256",
  "candidateArtifactFingerprint",
  "planFingerprint",
  "qaResultFingerprint",
  "reviewFingerprints",
  "passingReviewerProducerIds",
  "dissentingReviewerProducerIds",
  "minorityFindingIds",
  "consensusBasisPoints",
  "minimumConsensusBasisPoints",
  "minimumIndependentReviewers",
  "minimumPassingReviewerScore",
  "consensusReached",
  "requiredActions",
  "evaluationFingerprint",
  "providerCallPerformed",
  "reviewerFallbackAllowed",
  "selectionPerformed",
  "promotionPerformed",
  "bookUseBindingCreated",
  "publicationPerformed",
]);
const CONSENSUS_EVALUATION_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "status",
  "candidateSetId",
  "workOrderFingerprintSha256",
  "expectedCandidateCount",
  "providerRunFingerprint",
  "candidates",
  "pairwiseComparisons",
  "candidateIds",
  "planFingerprint",
  "setReviewerId",
  "setReviewMethod",
  "machineOnlyDecision",
  "nearDuplicateBasisPoints",
  "requiredActions",
  "evaluationFingerprint",
  "providerCallPerformed",
  "reviewerFallbackAllowed",
  "selectionPerformed",
  "promotionPerformed",
  "bookUseBindingCreated",
  "publicationPerformed",
]);
const SET_REVIEW_METHODS = new Set<BookArtCandidateSetReviewMethod>([
  "human",
  "human_with_machine_assistance",
]);

type UnknownRecord = Record<string, unknown>;

function strictObject(
  value: unknown,
  label: string,
  allowed: ReadonlySet<string>,
  issues: string[],
): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${label} must be one object.`);
    return undefined;
  }
  const source = value as UnknownRecord;
  const unknown = Object.keys(source)
    .filter((key) => !allowed.has(key))
    .sort();
  if (unknown.length) {
    issues.push(`${label} contains unknown fields: ${unknown.join(", ")}.`);
  }
  return source;
}

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function safeId(value: unknown, label: string, issues: string[]): string {
  if (
    typeof value !== "string" ||
    !SAFE_ID.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  ) {
    issues.push(`${label} is invalid.`);
    return "invalid-id";
  }
  return value;
}

function digest(value: unknown, label: string, issues: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    issues.push(`${label} must be a SHA-256 digest.`);
    return `sha256:${"0".repeat(64)}`;
  }
  return normalizeDigest(value);
}

function normalizeDigest(value: string): string {
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function timestamp(value: unknown, label: string, issues: string[]): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) {
    issues.push(`${label} must be canonical UTC ISO-8601 with milliseconds.`);
    return "1970-01-01T00:00:00.000Z";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    issues.push(`${label} must be a real canonical UTC timestamp.`);
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
  issues: string[],
): number {
  if (
    !Number.isInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    issues.push(`${label} must be an integer from ${minimum} to ${maximum}.`);
    return minimum;
  }
  return Number(value);
}

function enumeration<T extends string>(
  value: unknown,
  supported: ReadonlySet<T>,
  label: string,
  issues: string[],
  fallback: T,
): T {
  if (typeof value !== "string" || !supported.has(value as T)) {
    issues.push(`${label} is unsupported.`);
    return fallback;
  }
  return value as T;
}

function stringArray(
  value: unknown,
  label: string,
  issues: string[],
  minimum: number,
  maximum: number,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum ||
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        entry.trim() !== entry ||
        entry.length === 0 ||
        entry.length > 300,
    )
  ) {
    issues.push(`${label} must contain ${minimum} to ${maximum} bounded strings.`);
    return [];
  }
  const result = value as string[];
  if (duplicates(result).length) issues.push(`${label} contains duplicates.`);
  return [...result];
}

function parseIdentity(value: UnknownRecord | undefined): BookArtIdentityV1 {
  return {
    workspaceId: typeof value?.workspaceId === "string" ? value.workspaceId : "",
    projectId: typeof value?.projectId === "string" ? value.projectId : "",
    bookId: typeof value?.bookId === "string" ? value.bookId : "",
    ...(value?.editionId === undefined
      ? {}
      : { editionId: typeof value.editionId === "string" ? value.editionId : "" }),
    requestId: typeof value?.requestId === "string" ? value.requestId : "",
  };
}

function emptyIdentity(): BookArtIdentityV1 {
  return { workspaceId: "", projectId: "", bookId: "", requestId: "" };
}

function sameIdentity(left: BookArtIdentityV1, right: BookArtIdentityV1): boolean {
  return canonical(left) === canonical(right);
}

function pairKey(value: BookArtCandidateSetPairwiseComparisonV1): string {
  return `${value.leftCandidateId}\0${value.rightCandidateId}`;
}

function completePairKeys(candidateIds: string[]): string[] {
  const output: string[] = [];
  for (let left = 0; left < candidateIds.length; left += 1) {
    for (let right = left + 1; right < candidateIds.length; right += 1) {
      output.push(`${candidateIds[left]}\0${candidateIds[right]}`);
    }
  }
  return output;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function canonical(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
