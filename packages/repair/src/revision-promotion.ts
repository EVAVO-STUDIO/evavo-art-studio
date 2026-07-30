import {
  normalizeJson,
  stableStringify,
  type ArtifactId,
  type ArtifactStore,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  CandidateSelectionError,
  promoteSelectedCandidate,
  type CandidateSelectionEvidence,
} from "@evavo/art-selection";

import {
  REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION,
  type RepairedFamilyRankingEvidence,
} from "./revision-ranking-types.js";
import {
  REPAIRED_FAMILY_PROMOTION_PROTOCOL_VERSION,
  RepairedFamilyPromotionError,
  type RepairedFamilyPromotionEvidence,
  type RepairedFamilyPromotionOptions,
  type RepairedFamilyPromotionRequestInput,
  type RepairedFamilyPromotionResult,
} from "./revision-promotion-types.js";
import {
  repairedFamilyPromotionRequestSha256,
  validateRepairedFamilyPromotionRequest,
} from "./revision-promotion-validation.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(code: string, message: string, details?: JsonValue): never {
  throw new RepairedFamilyPromotionError(code, message, details);
}

function nowDate(now: () => Date): Date {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_CLOCK_INVALID",
      "Revision-bound promotion clock returned an invalid date.",
    );
  }
  return value;
}

async function verifiedArtifact(
  artifacts: ArtifactStore,
  artifactId: ArtifactId,
  role: string,
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    artifacts.get(artifactId),
    artifacts.verify(artifactId),
  ]);
  if (!artifact || !verification.exists) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_ARTIFACT_NOT_FOUND",
      `${role} artifact was not found: ${artifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_ARTIFACT_VERIFICATION_FAILED",
      `${role} artifact failed immutable descriptor or content verification: ${artifactId}`,
    );
  }
  return artifact;
}

async function readJson(
  artifacts: ArtifactStore,
  artifact: StoredArtifact,
  role: string,
): Promise<unknown> {
  try {
    return JSON.parse((await artifacts.read(artifact.artifactId)).toString("utf8")) as unknown;
  } catch (error: unknown) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_JSON_INVALID",
      `${role} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parseRankingEvidence(
  value: unknown,
  artifactId: ArtifactId,
): RepairedFamilyRankingEvidence {
  if (!isRecord(value)) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_RANKING_INVALID",
      `Ranking evidence ${artifactId} must contain one JSON object.`,
    );
  }
  if (
    value.schemaVersion !== "1.0" ||
    value.protocolVersion !== REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION ||
    typeof value.rankingId !== "string" ||
    typeof value.requestSha256 !== "string" ||
    typeof value.bridgeEvidenceArtifactId !== "string" ||
    typeof value.bridgeId !== "string" ||
    typeof value.repairId !== "string" ||
    typeof value.familyId !== "string" ||
    typeof value.sourceManifestArtifactId !== "string" ||
    typeof value.sourceManifestSha256 !== "string" ||
    typeof value.referenceArtifactId !== "string" ||
    !stringArray(value.revisionEvidenceArtifactIds) ||
    !stringArray(value.candidateArtifactIds) ||
    typeof value.selectionEvidenceArtifactId !== "string" ||
    typeof value.selectionId !== "string" ||
    typeof value.selectionRequestSha256 !== "string" ||
    !new Set(["selected", "review-required", "rejected"]).has(
      typeof value.decision === "string" ? value.decision : "",
    ) ||
    typeof value.promotionEligible !== "boolean" ||
    typeof value.winnerMargin !== "number" ||
    !Array.isArray(value.ranking) ||
    !isRecord(value.selectionEvidence) ||
    value.passed !== true ||
    typeof value.completedAt !== "string"
  ) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_RANKING_INVALID",
      `Ranking evidence ${artifactId} is incomplete or did not pass ranking governance.`,
    );
  }
  return value as unknown as RepairedFamilyRankingEvidence;
}

function parseSelectionEvidence(value: unknown): CandidateSelectionEvidence {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    typeof value.protocolVersion !== "string" ||
    typeof value.selectionId !== "string" ||
    typeof value.requestSha256 !== "string" ||
    !Array.isArray(value.ranking) ||
    !isRecord(value.reference) ||
    typeof value.reference.artifactId !== "string" ||
    !isRecord(value.policy) ||
    typeof value.promotionEligible !== "boolean"
  ) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_SELECTION_EVIDENCE_INVALID",
      "Revision ranking contains invalid embedded candidate-selection evidence.",
    );
  }
  return value as unknown as CandidateSelectionEvidence;
}

function candidateForApproval(
  evidence: RepairedFamilyRankingEvidence,
  approvalMode: "automatic" | "human",
): ArtifactId {
  if (approvalMode === "automatic") {
    if (
      evidence.decision !== "selected" ||
      !evidence.promotionEligible ||
      evidence.selectedCandidateArtifactId === undefined
    ) {
      fail(
        "REPAIRED_FAMILY_PROMOTION_AUTOMATIC_NOT_AUTHORIZED",
        "Automatic repaired-family promotion requires a selected, promotion-eligible ranking.",
      );
    }
    return evidence.selectedCandidateArtifactId;
  }
  if (
    evidence.decision === "rejected" ||
    evidence.recommendedCandidateArtifactId === undefined
  ) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_HUMAN_NOT_AUTHORIZED",
      "Human approval requires a highest-ranked hard-gate-eligible repaired candidate.",
    );
  }
  return evidence.recommendedCandidateArtifactId;
}

export async function promoteRepairedFamilyCandidate(
  input: RepairedFamilyPromotionRequestInput | unknown,
  options: RepairedFamilyPromotionOptions,
): Promise<RepairedFamilyPromotionResult> {
  const request = validateRepairedFamilyPromotionRequest(input);
  const now = options.now ?? (() => new Date());
  const promotedAt = nowDate(now);
  const rankingArtifact = await verifiedArtifact(
    options.artifacts,
    request.rankingEvidenceArtifactId,
    "revision-bound ranking evidence",
  );
  if (
    rankingArtifact.storageClass !== "evidence" ||
    rankingArtifact.mediaType !== "application/json" ||
    rankingArtifact.labels.artifactRole !==
      "revision-bound-candidate-selection-evidence" ||
    rankingArtifact.labels.approvalState !== "evidence-only" ||
    rankingArtifact.labels.qualityState !== "passed" ||
    rankingArtifact.labels.finalDeliverable !== "false"
  ) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_RANKING_STATE_INVALID",
      "rankingEvidenceArtifactId must reference passed, evidence-only, non-final revision-bound ranking evidence.",
    );
  }
  const ranking = parseRankingEvidence(
    await readJson(options.artifacts, rankingArtifact, "ranking evidence"),
    rankingArtifact.artifactId,
  );
  if (
    rankingArtifact.labels.rankingId !== ranking.rankingId ||
    rankingArtifact.labels.bridgeId !== ranking.bridgeId ||
    rankingArtifact.labels.repairId !== ranking.repairId ||
    rankingArtifact.labels.familyId !== ranking.familyId ||
    rankingArtifact.labels.decision !== ranking.decision ||
    rankingArtifact.labels.promotionEligible !== String(ranking.promotionEligible)
  ) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_RANKING_LABEL_MISMATCH",
      "Ranking artifact labels do not match its immutable evidence body.",
    );
  }
  if (request.target.expectedArtifactId !== ranking.referenceArtifactId) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_REFERENCE_TARGET_MISMATCH",
      "Promotion target must currently point to the approved source layer declared by revision-bound ranking evidence.",
      normalizeJson({
        expectedArtifactId: request.target.expectedArtifactId,
        rankingReferenceArtifactId: ranking.referenceArtifactId,
      }),
    );
  }
  const requiredRankingSources = [
    ranking.bridgeEvidenceArtifactId,
    ranking.selectionEvidenceArtifactId,
    ranking.referenceArtifactId,
    ...ranking.revisionEvidenceArtifactIds,
    ...ranking.candidateArtifactIds,
  ];
  const rankingSources = new Set(rankingArtifact.sourceArtifacts);
  const missingRankingSources = requiredRankingSources.filter(
    (artifactId) => !rankingSources.has(artifactId),
  );
  if (missingRankingSources.length > 0) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_RANKING_LINEAGE_INCOMPLETE",
      "Ranking descriptor omits required revision-bound promotion sources.",
      normalizeJson({ missingRankingSources }),
    );
  }

  const selectionArtifact = await verifiedArtifact(
    options.artifacts,
    ranking.selectionEvidenceArtifactId,
    "original candidate selection evidence",
  );
  if (
    selectionArtifact.storageClass !== "evidence" ||
    selectionArtifact.mediaType !== "application/json" ||
    selectionArtifact.labels.artifactRole !== "candidate-selection-evidence"
  ) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_SELECTION_STATE_INVALID",
      "Revision-bound ranking must reference ordinary candidate-selection-evidence.",
    );
  }
  const parsedSelection = parseSelectionEvidence(
    await readJson(options.artifacts, selectionArtifact, "selection evidence"),
  );
  const embeddedSelection = parseSelectionEvidence(ranking.selectionEvidence);
  if (
    stableStringify(normalizeJson(parsedSelection)) !==
      stableStringify(normalizeJson(embeddedSelection)) ||
    parsedSelection.selectionId !== ranking.selectionId ||
    parsedSelection.requestSha256 !== ranking.selectionRequestSha256 ||
    parsedSelection.reference.artifactId !== ranking.referenceArtifactId ||
    selectionArtifact.labels.selectionId !== parsedSelection.selectionId
  ) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_SELECTION_BINDING_INVALID",
      "Original selection evidence differs from the revision-bound ranking wrapper.",
    );
  }
  const candidateArtifactId = candidateForApproval(
    ranking,
    request.approval.mode,
  );
  if (!ranking.candidateArtifactIds.includes(candidateArtifactId)) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_CANDIDATE_BINDING_INVALID",
      "Derived promotion candidate is outside the revision-bound candidate set.",
    );
  }

  const boundSelection = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(parsedSelection), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${ranking.selectionId}.revision-bound.selection.evidence.json`,
      sourceArtifacts: [
        rankingArtifact.artifactId,
        selectionArtifact.artifactId,
        ranking.bridgeEvidenceArtifactId,
        ranking.referenceArtifactId,
        ...ranking.revisionEvidenceArtifactIds,
        ...ranking.candidateArtifactIds,
      ].filter((value, index, values) => values.indexOf(value) === index).sort() as readonly ArtifactId[],
      labels: {
        artifactRole: "candidate-selection-evidence",
        selectionId: parsedSelection.selectionId,
        decision: parsedSelection.decision,
        promotionEligible: String(parsedSelection.promotionEligible),
        evidenceEnvelope: "revision-bound",
        revisionRankingEvidenceArtifactId: rankingArtifact.artifactId,
        rankingId: ranking.rankingId,
        bridgeId: ranking.bridgeId,
        repairId: ranking.repairId,
        familyId: ranking.familyId,
        ...(parsedSelection.recommendedCandidateArtifactId === undefined
          ? {}
          : {
              recommendedCandidateArtifactId:
                parsedSelection.recommendedCandidateArtifactId,
            }),
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        selectionId: parsedSelection.selectionId,
        requestSha256: parsedSelection.requestSha256,
        originalSelectionEvidenceArtifactId: selectionArtifact.artifactId,
        revisionRankingEvidenceArtifactId: rankingArtifact.artifactId,
      }),
    },
  );

  let promoted;
  try {
    promoted = await promoteSelectedCandidate(
      {
        schemaVersion: "1.0",
        promotionId: request.promotionId,
        selectionEvidenceArtifactId: boundSelection.artifactId,
        candidateArtifactId,
        target: request.target,
        approval: request.approval,
        actor: request.actor,
        metadata: {
          revisionBoundPromotion: true,
          rankingEvidenceArtifactId: rankingArtifact.artifactId,
          rankingId: ranking.rankingId,
          bridgeEvidenceArtifactId: ranking.bridgeEvidenceArtifactId,
          bridgeId: ranking.bridgeId,
          repairId: ranking.repairId,
          familyId: ranking.familyId,
          ...(request.metadata === undefined
            ? {}
            : { requestMetadata: request.metadata }),
        },
      },
      {
        artifacts: options.artifacts,
        now: () => promotedAt,
      },
    );
  } catch (error: unknown) {
    if (error instanceof CandidateSelectionError) {
      throw new RepairedFamilyPromotionError(
        error.code,
        error.message,
        error.details,
      );
    }
    throw error;
  }
  if (
    promoted.candidateArtifactId !== candidateArtifactId ||
    promoted.selectionEvidenceArtifactId !== boundSelection.artifactId ||
    promoted.reference.artifactId !== promoted.masterArtifactId ||
    promoted.reference.previousArtifactId !== ranking.referenceArtifactId
  ) {
    fail(
      "REPAIRED_FAMILY_PROMOTION_RESULT_INVALID",
      "Underlying compare-and-swap promotion result does not match revision-bound authorization.",
    );
  }

  const evidence: RepairedFamilyPromotionEvidence = {
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_PROMOTION_PROTOCOL_VERSION,
    promotionId: request.promotionId,
    requestSha256: repairedFamilyPromotionRequestSha256(request),
    rankingEvidenceArtifactId: rankingArtifact.artifactId,
    rankingId: ranking.rankingId,
    bridgeEvidenceArtifactId: ranking.bridgeEvidenceArtifactId,
    bridgeId: ranking.bridgeId,
    repairId: ranking.repairId,
    familyId: ranking.familyId,
    sourceManifestArtifactId: ranking.sourceManifestArtifactId,
    sourceManifestSha256: ranking.sourceManifestSha256,
    referenceArtifactId: ranking.referenceArtifactId,
    originalSelectionEvidenceArtifactId: selectionArtifact.artifactId,
    boundSelectionEvidenceArtifactId: boundSelection.artifactId,
    candidateArtifactId,
    masterArtifactId: promoted.masterArtifactId,
    authorizationEvidenceArtifactId: promoted.authorizationEvidenceArtifactId,
    approvalMode: request.approval.mode,
    reference: promoted.reference,
    promotedAt: promotedAt.toISOString(),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  const stored = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(evidence), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${request.promotionId}.revision-bound.promotion.evidence.json`,
      sourceArtifacts: [
        rankingArtifact.artifactId,
        selectionArtifact.artifactId,
        boundSelection.artifactId,
        ranking.bridgeEvidenceArtifactId,
        ranking.referenceArtifactId,
        candidateArtifactId,
        promoted.masterArtifactId,
        promoted.authorizationEvidenceArtifactId,
        ...ranking.revisionEvidenceArtifactIds,
      ].filter((value, index, values) => values.indexOf(value) === index).sort() as readonly ArtifactId[],
      labels: {
        artifactRole: "revision-bound-promotion-evidence",
        approvalState: "evidence-only",
        qualityState: "passed",
        finalDeliverable: "false",
        promotionId: request.promotionId,
        rankingId: ranking.rankingId,
        bridgeId: ranking.bridgeId,
        repairId: ranking.repairId,
        familyId: ranking.familyId,
        candidateArtifactId,
        masterArtifactId: promoted.masterArtifactId,
        approvalMode: request.approval.mode,
        targetReference: `${request.target.namespace}/${request.target.name}`,
      },
      metadata: normalizeJson({
        requestSha256: evidence.requestSha256,
        boundSelectionEvidenceArtifactId: boundSelection.artifactId,
        authorizationEvidenceArtifactId: promoted.authorizationEvidenceArtifactId,
        referenceGeneration: promoted.reference.generation,
        previousArtifactId: promoted.reference.previousArtifactId,
      }),
    },
  );
  return {
    evidenceArtifactId: stored.artifactId,
    boundSelectionEvidenceArtifactId: boundSelection.artifactId,
    masterArtifactId: promoted.masterArtifactId,
    authorizationEvidenceArtifactId: promoted.authorizationEvidenceArtifactId,
    reference: promoted.reference,
    evidence,
  };
}
