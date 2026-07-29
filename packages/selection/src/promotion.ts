import {
  normalizeJson,
  type ArtifactId,
  type ArtifactReference,
  type ArtifactStore,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";

import {
  SELECTION_PROTOCOL_VERSION,
  CandidateSelectionError,
  type CandidatePromotionOptions,
  type CandidatePromotionResult,
  type CandidateSelectionEvidence,
  type CandidateSelectionRankingEntry,
  type NormalizedCandidatePromotionRequest,
} from "./types.js";
import {
  promotionRequestSha256,
  validateCandidatePromotionRequest,
} from "./validation.js";

function nowDate(now: () => Date): Date {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_CLOCK_INVALID",
      "Candidate promotion clock returned an invalid date.",
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
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_ARTIFACT_NOT_FOUND",
      `${role} artifact was not found: ${artifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_ARTIFACT_VERIFICATION_FAILED",
      `${role} artifact failed immutable verification: ${artifactId}`,
    );
  }
  return artifact;
}

function parseSelectionEvidence(
  value: unknown,
  artifactId: ArtifactId,
): CandidateSelectionEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_SELECTION_EVIDENCE_INVALID",
      `Selection evidence ${artifactId} must contain one JSON object.`,
    );
  }
  const evidence = value as Partial<CandidateSelectionEvidence>;
  if (
    evidence.schemaVersion !== "1.0" ||
    evidence.protocolVersion !== SELECTION_PROTOCOL_VERSION ||
    typeof evidence.selectionId !== "string" ||
    typeof evidence.requestSha256 !== "string" ||
    !new Set(["selected", "review-required", "rejected"]).has(
      evidence.decision ?? "",
    ) ||
    typeof evidence.promotionEligible !== "boolean" ||
    typeof evidence.winnerMargin !== "number" ||
    !Array.isArray(evidence.ranking) ||
    !evidence.reference ||
    typeof evidence.reference.artifactId !== "string" ||
    !evidence.policy
  ) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_SELECTION_EVIDENCE_INVALID",
      `Selection evidence ${artifactId} is missing required governance fields.`,
    );
  }
  return evidence as CandidateSelectionEvidence;
}

function selectedRanking(
  evidence: CandidateSelectionEvidence,
  candidateArtifactId: ArtifactId,
): CandidateSelectionRankingEntry {
  const ranking = evidence.ranking.find(
    (entry) => entry.candidateArtifactId === candidateArtifactId,
  );
  if (!ranking) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_CANDIDATE_NOT_RANKED",
      "Candidate is absent from the immutable selection ranking.",
    );
  }
  if (!ranking.hardGatesPassed || ranking.violations.length) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_BLOCKING_GATES_FAILED",
      "Candidate promotion cannot override blocking selection failures.",
      normalizeJson({ violations: ranking.violations }),
    );
  }
  if (evidence.recommendedCandidateArtifactId !== candidateArtifactId) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_NOT_RECOMMENDED",
      "Promotion may only target the highest-ranked eligible candidate.",
    );
  }
  return ranking;
}

function assertApproval(
  request: NormalizedCandidatePromotionRequest,
  evidence: CandidateSelectionEvidence,
  ranking: CandidateSelectionRankingEntry,
): void {
  if (request.approval.mode === "automatic") {
    if (
      evidence.decision !== "selected" ||
      !evidence.promotionEligible ||
      evidence.selectedCandidateArtifactId !== request.candidateArtifactId ||
      !ranking.automaticEvidenceComplete
    ) {
      throw new CandidateSelectionError(
        "CANDIDATE_PROMOTION_AUTOMATIC_NOT_AUTHORIZED",
        "Automatic promotion requires an automatically selected candidate with complete evidence.",
      );
    }
    return;
  }
  if (evidence.decision === "rejected") {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_HUMAN_OVERRIDE_REJECTED",
      "Human approval cannot promote a selection with no hard-gate-eligible candidate.",
    );
  }
  if (!request.approval.approver.trim() || !request.approval.reason.trim()) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_HUMAN_APPROVAL_INVALID",
      "Human promotion requires a named approver and a reason.",
    );
  }
}

function masterFileName(candidate: StoredArtifact): string {
  const fileName = candidate.fileName ?? `${candidate.artifactId}.png`;
  const dot = fileName.lastIndexOf(".");
  const stem = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  const extension = candidate.mediaType === "image/webp"
    ? "webp"
    : candidate.mediaType === "image/jpeg"
      ? "jpg"
      : "png";
  return `${stem || "candidate"}.selected-master.${extension}`;
}

function expectedReference(
  request: NormalizedCandidatePromotionRequest,
  master: StoredArtifact,
  promotedAt: Date,
): ArtifactReference {
  return {
    schemaVersion: "1.0",
    namespace: request.target.namespace,
    name: request.target.name,
    generation: request.target.expectedGeneration + 1,
    artifactId: master.artifactId,
    contentHash: master.contentHash,
    ...(request.target.expectedArtifactId
      ? { previousArtifactId: request.target.expectedArtifactId }
      : {}),
    updatedAt: promotedAt.toISOString(),
    actor: request.actor,
  };
}

function assertCurrentReference(
  current: ArtifactReference | null,
  request: NormalizedCandidatePromotionRequest,
): void {
  const generation = current?.generation ?? 0;
  if (generation !== request.target.expectedGeneration) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_REFERENCE_CONFLICT",
      `Reference generation changed from ${request.target.expectedGeneration} to ${generation}.`,
    );
  }
  if (
    request.target.expectedArtifactId !== undefined &&
    current?.artifactId !== request.target.expectedArtifactId
  ) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_REFERENCE_CONFLICT",
      "Reference artifact changed after the promotion request was prepared.",
    );
  }
  if (
    request.target.expectedArtifactId === undefined &&
    current !== null
  ) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_REFERENCE_CONFLICT",
      "Promotion expected a new reference, but the target already exists.",
    );
  }
}

export async function promoteSelectedCandidate(
  input: unknown,
  options: CandidatePromotionOptions,
): Promise<CandidatePromotionResult> {
  const request = validateCandidatePromotionRequest(input);
  const now = options.now ?? (() => new Date());
  const promotedAt = nowDate(now);
  const selectionArtifact = await verifiedArtifact(
    options.artifacts,
    request.selectionEvidenceArtifactId,
    "selection evidence",
  );
  if (
    selectionArtifact.storageClass !== "evidence" ||
    selectionArtifact.mediaType !== "application/json" ||
    selectionArtifact.labels.artifactRole !== "candidate-selection-evidence"
  ) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_SELECTION_EVIDENCE_STATE_INVALID",
      "Promotion requires a candidate-selection-evidence JSON artifact.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      (await options.artifacts.read(selectionArtifact.artifactId)).toString("utf8"),
    ) as unknown;
  } catch {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_SELECTION_EVIDENCE_INVALID",
      "Selection evidence is not valid JSON.",
    );
  }
  const evidence = parseSelectionEvidence(parsed, selectionArtifact.artifactId);
  if (selectionArtifact.labels.selectionId !== evidence.selectionId) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_SELECTION_EVIDENCE_BINDING_INVALID",
      "Selection evidence descriptor and body disagree on selectionId.",
    );
  }
  if (!selectionArtifact.sourceArtifacts.includes(request.candidateArtifactId)) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_SELECTION_LINEAGE_INVALID",
      "Selected candidate is absent from selection-evidence source lineage.",
    );
  }
  if (!selectionArtifact.sourceArtifacts.includes(evidence.reference.artifactId)) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_SELECTION_LINEAGE_INVALID",
      "Selection reference is absent from selection-evidence source lineage.",
    );
  }

  const ranking = selectedRanking(
    evidence,
    request.candidateArtifactId,
  );
  assertApproval(request, evidence, ranking);
  const candidate = await verifiedArtifact(
    options.artifacts,
    request.candidateArtifactId,
    "selected candidate",
  );
  if (
    candidate.storageClass !== "intermediate" ||
    candidate.labels.approvalState !== "unapproved" ||
    candidate.labels.qualityState !== "passed" ||
    !evidence.policy.allowedCandidateRoles.includes(
      candidate.labels.artifactRole ?? "",
    )
  ) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_CANDIDATE_STATE_INVALID",
      "Selected candidate must remain an unapproved, quality-passed intermediate of an allowed role.",
    );
  }
  if (
    candidate.descriptorSha256 !== ranking.descriptorSha256 ||
    candidate.contentSha256 !== ranking.contentSha256
  ) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_CANDIDATE_BINDING_INVALID",
      "Candidate descriptor or content hash differs from the immutable ranking.",
    );
  }
  await verifiedArtifact(
    options.artifacts,
    evidence.reference.artifactId,
    "selection reference",
  );

  const currentReference = await options.artifacts.resolveReference(
    request.target.namespace,
    request.target.name,
  );
  assertCurrentReference(currentReference, request);

  const master = await options.artifacts.put(
    await options.artifacts.read(candidate.artifactId),
    {
      mediaType: candidate.mediaType,
      storageClass: "master",
      fileName: masterFileName(candidate),
      sourceArtifacts: [
        candidate.artifactId,
        selectionArtifact.artifactId,
        evidence.reference.artifactId,
      ],
      labels: {
        artifactRole: "selected-art-master",
        approvalState: "selected",
        qualityState: "passed",
        finalDeliverable: "false",
        promotionId: request.promotionId,
        selectionId: evidence.selectionId,
        selectionEvidenceArtifactId: selectionArtifact.artifactId,
        approvalMode: request.approval.mode,
        targetReference: `${request.target.namespace}/${request.target.name}`,
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        protocolVersion: SELECTION_PROTOCOL_VERSION,
        promotionId: request.promotionId,
        selectionId: evidence.selectionId,
        selectionDecision: evidence.decision,
        selectionScore: ranking.score,
        winnerMargin: evidence.winnerMargin,
        sourceCandidateArtifactId: candidate.artifactId,
        sourceCandidateDescriptorSha256: candidate.descriptorSha256,
        sourceCandidateContentSha256: candidate.contentSha256,
        referenceArtifactId: evidence.reference.artifactId,
        target: {
          namespace: request.target.namespace,
          name: request.target.name,
          generation: request.target.expectedGeneration + 1,
        },
        actor: request.actor,
        approval: request.approval,
        promotedAt: promotedAt.toISOString(),
        ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      }),
    },
  );

  const anticipatedReference = expectedReference(request, master, promotedAt);
  const authorizationBody = normalizeJson({
    schemaVersion: "1.0",
    protocolVersion: SELECTION_PROTOCOL_VERSION,
    promotionId: request.promotionId,
    promotionRequestSha256: promotionRequestSha256(request),
    selectionEvidenceArtifactId: selectionArtifact.artifactId,
    selectionId: evidence.selectionId,
    decision: evidence.decision,
    selectedCandidate: {
      artifactId: candidate.artifactId,
      descriptorSha256: candidate.descriptorSha256,
      contentSha256: candidate.contentSha256,
      rank: ranking.rank,
      score: ranking.score,
      hardGatesPassed: ranking.hardGatesPassed,
      automaticEvidenceComplete: ranking.automaticEvidenceComplete,
    },
    master: {
      artifactId: master.artifactId,
      descriptorSha256: master.descriptorSha256,
      contentSha256: master.contentSha256,
    },
    approval: request.approval,
    actor: request.actor,
    anticipatedReference,
    authorizedAt: promotedAt.toISOString(),
  });
  const authorization = await options.artifacts.put(
    `${JSON.stringify(authorizationBody, null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${request.promotionId}.promotion.authorization.json`,
      sourceArtifacts: [
        selectionArtifact.artifactId,
        candidate.artifactId,
        master.artifactId,
      ],
      labels: {
        artifactRole: "candidate-promotion-authorization",
        promotionId: request.promotionId,
        selectionId: evidence.selectionId,
        approvalMode: request.approval.mode,
        targetReference: `${request.target.namespace}/${request.target.name}`,
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        promotionRequestSha256: promotionRequestSha256(request),
        anticipatedGeneration: anticipatedReference.generation,
      }),
    },
  );

  let reference: ArtifactReference;
  try {
    reference = await options.artifacts.updateReference(
      request.target.namespace,
      request.target.name,
      master.artifactId,
      {
        expectedGeneration: request.target.expectedGeneration,
        ...(request.target.expectedArtifactId === undefined
          ? {}
          : { expectedArtifactId: request.target.expectedArtifactId }),
        actor: request.actor,
        now: promotedAt,
      },
    );
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    if (code === "ARTIFACT_REFERENCE_CONFLICT") {
      throw new CandidateSelectionError(
        "CANDIDATE_PROMOTION_REFERENCE_CONFLICT",
        "Approved reference changed before compare-and-swap promotion completed.",
        normalizeJson({
          promotionAuthorizationArtifactId: authorization.artifactId,
          selectedMasterArtifactId: master.artifactId,
        }),
      );
    }
    throw error;
  }
  if (JSON.stringify(reference) !== JSON.stringify(anticipatedReference)) {
    throw new CandidateSelectionError(
      "CANDIDATE_PROMOTION_REFERENCE_RESULT_INVALID",
      "Artifact store returned a reference that differs from the authorized promotion record.",
      normalizeJson({ anticipatedReference, reference }),
    );
  }

  return {
    schemaVersion: "1.0",
    protocolVersion: SELECTION_PROTOCOL_VERSION,
    promotionId: request.promotionId,
    selectionEvidenceArtifactId: selectionArtifact.artifactId,
    candidateArtifactId: candidate.artifactId,
    masterArtifactId: master.artifactId,
    authorizationEvidenceArtifactId: authorization.artifactId,
    reference,
    approvalMode: request.approval.mode,
  };
}
