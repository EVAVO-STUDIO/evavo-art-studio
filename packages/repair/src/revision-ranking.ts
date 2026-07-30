import {
  normalizeJson,
  type ArtifactId,
  type ArtifactStore,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  CandidateSelectionError,
  executeCandidateSelection,
  selectionRequestSha256,
  validateCandidateSelectionRequest,
} from "@evavo/art-selection";

import {
  REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION,
  type RepairedFamilySelectionEvidence,
} from "./revision-selection-types.js";
import {
  REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION,
  RepairedFamilyRankingError,
  type RepairedFamilyRankingEvidence,
  type RepairedFamilyRankingOptions,
  type RepairedFamilyRankingRequestInput,
  type RepairedFamilyRankingResult,
} from "./revision-ranking-types.js";
import {
  repairedFamilyRankingRequestSha256,
  validateRepairedFamilyRankingRequest,
} from "./revision-ranking-validation.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(code: string, message: string, details?: JsonValue): never {
  throw new RepairedFamilyRankingError(code, message, details);
}

function nowIso(now: () => Date): string {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    fail(
      "REPAIRED_FAMILY_RANKING_CLOCK_INVALID",
      "Revision-bound ranking clock returned an invalid date.",
    );
  }
  return value.toISOString();
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
      "REPAIRED_FAMILY_RANKING_ARTIFACT_NOT_FOUND",
      `${role} artifact was not found: ${artifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    fail(
      "REPAIRED_FAMILY_RANKING_ARTIFACT_VERIFICATION_FAILED",
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
      "REPAIRED_FAMILY_RANKING_JSON_INVALID",
      `${role} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parseBridgeEvidence(
  value: unknown,
  artifactId: ArtifactId,
): RepairedFamilySelectionEvidence {
  if (!isRecord(value)) {
    fail(
      "REPAIRED_FAMILY_RANKING_BRIDGE_INVALID",
      `Bridge evidence ${artifactId} must contain one JSON object.`,
    );
  }
  if (
    value.schemaVersion !== "1.0" ||
    value.protocolVersion !== REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION ||
    typeof value.bridgeId !== "string" ||
    typeof value.requestSha256 !== "string" ||
    typeof value.repairId !== "string" ||
    typeof value.familyId !== "string" ||
    typeof value.sourceManifestArtifactId !== "string" ||
    typeof value.sourceManifestSha256 !== "string" ||
    typeof value.referenceArtifactId !== "string" ||
    !stringArray(value.revisionEvidenceArtifactIds) ||
    value.revisionEvidenceArtifactIds.length < 2 ||
    !stringArray(value.revisionIds) ||
    !stringArray(value.candidateArtifactIds) ||
    value.candidateArtifactIds.length < 2 ||
    !stringArray(value.familyEvidenceArtifactIds) ||
    !stringArray(value.revisedManifestArtifactIds) ||
    !stringArray(value.externalEvidenceArtifactIds) ||
    !isRecord(value.selectionRequest) ||
    typeof value.selectionRequestSha256 !== "string" ||
    !isRecord(value.selectionJob) ||
    value.passed !== true ||
    typeof value.completedAt !== "string"
  ) {
    fail(
      "REPAIRED_FAMILY_RANKING_BRIDGE_INVALID",
      `Bridge evidence ${artifactId} is incomplete or did not pass preparation.`,
    );
  }
  return value as unknown as RepairedFamilySelectionEvidence;
}

function exactStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

function validateEmbeddedJob(
  bridge: RepairedFamilySelectionEvidence,
  selectionRequestSha: string,
): void {
  const job = bridge.selectionJob;
  if (
    !isRecord(job) ||
    job.queue !== "selection" ||
    job.kind !== "art.candidate.select" ||
    typeof job.idempotencyKey !== "string" ||
    !isRecord(job.payload) ||
    !Array.isArray(job.inputArtifacts) ||
    !stringArray(job.requiredCapabilities) ||
    !job.requiredCapabilities.includes("selection.compare") ||
    !job.requiredCapabilities.includes("evidence.bundle")
  ) {
    fail(
      "REPAIRED_FAMILY_RANKING_SELECTION_JOB_INVALID",
      "Bridge evidence contains an invalid or over-privileged selection job contract.",
    );
  }
  const payload = validateCandidateSelectionRequest(job.payload);
  if (
    selectionRequestSha256(payload) !== selectionRequestSha ||
    selectionRequestSha256(payload) !== bridge.selectionRequestSha256
  ) {
    fail(
      "REPAIRED_FAMILY_RANKING_SELECTION_JOB_HASH_MISMATCH",
      "Embedded selection job payload does not match the bridge selection request hash.",
    );
  }
  const requiredInputs = [
    bridge.referenceArtifactId,
    ...bridge.candidateArtifactIds,
    ...bridge.externalEvidenceArtifactIds,
    ...bridge.revisionEvidenceArtifactIds,
    ...bridge.familyEvidenceArtifactIds,
    ...bridge.revisedManifestArtifactIds,
  ];
  const declared = new Set(
    job.inputArtifacts.filter((entry): entry is string => typeof entry === "string"),
  );
  const missing = requiredInputs.filter((entry) => !declared.has(entry));
  if (missing.length > 0) {
    fail(
      "REPAIRED_FAMILY_RANKING_SELECTION_JOB_LINEAGE_MISSING",
      "Embedded selection job omits bridge-bound artifact inputs.",
      normalizeJson({ missing }),
    );
  }
}

export async function executeRepairedFamilyRanking(
  input: RepairedFamilyRankingRequestInput | unknown,
  options: RepairedFamilyRankingOptions,
): Promise<RepairedFamilyRankingResult> {
  const request = validateRepairedFamilyRankingRequest(input);
  const now = options.now ?? (() => new Date());
  const completedAt = nowIso(now);
  const bridgeArtifact = await verifiedArtifact(
    options.artifacts,
    request.bridgeEvidenceArtifactId,
    "repaired family selection bridge evidence",
  );
  if (
    bridgeArtifact.storageClass !== "evidence" ||
    bridgeArtifact.mediaType !== "application/json" ||
    bridgeArtifact.labels.artifactRole !==
      "repaired-family-selection-bridge-evidence" ||
    bridgeArtifact.labels.approvalState !== "evidence-only" ||
    bridgeArtifact.labels.qualityState !== "passed" ||
    bridgeArtifact.labels.finalDeliverable !== "false"
  ) {
    fail(
      "REPAIRED_FAMILY_RANKING_BRIDGE_STATE_INVALID",
      "bridgeEvidenceArtifactId must reference passed, evidence-only, non-final revision-selection bridge evidence.",
    );
  }
  const bridge = parseBridgeEvidence(
    await readJson(options.artifacts, bridgeArtifact, "selection bridge evidence"),
    bridgeArtifact.artifactId,
  );
  if (
    bridgeArtifact.labels.bridgeId !== bridge.bridgeId ||
    bridgeArtifact.labels.repairId !== bridge.repairId ||
    bridgeArtifact.labels.familyId !== bridge.familyId
  ) {
    fail(
      "REPAIRED_FAMILY_RANKING_BRIDGE_LABEL_MISMATCH",
      "Bridge artifact labels do not match the immutable evidence body.",
    );
  }
  const requiredBridgeSources = [
    bridge.referenceArtifactId,
    ...bridge.revisionEvidenceArtifactIds,
    ...bridge.candidateArtifactIds,
    ...bridge.familyEvidenceArtifactIds,
    ...bridge.revisedManifestArtifactIds,
    ...bridge.externalEvidenceArtifactIds,
  ];
  const bridgeSources = new Set(bridgeArtifact.sourceArtifacts);
  const missingBridgeSources = requiredBridgeSources.filter(
    (artifactId) => !bridgeSources.has(artifactId),
  );
  if (missingBridgeSources.length > 0) {
    fail(
      "REPAIRED_FAMILY_RANKING_BRIDGE_LINEAGE_INCOMPLETE",
      "Bridge artifact descriptor omits required immutable ranking sources.",
      normalizeJson({ missingBridgeSources }),
    );
  }

  const selectionRequest = validateCandidateSelectionRequest(
    bridge.selectionRequest,
  );
  const selectionRequestHash = selectionRequestSha256(selectionRequest);
  if (
    selectionRequestHash !== bridge.selectionRequestSha256 ||
    selectionRequest.referenceArtifactId !== bridge.referenceArtifactId ||
    !exactStrings(
      selectionRequest.candidateArtifactIds,
      bridge.candidateArtifactIds,
    ) ||
    !exactStrings(
      selectionRequest.externalEvidenceArtifactIds,
      bridge.externalEvidenceArtifactIds,
    ) ||
    selectionRequest.policy.requireReferenceLineage !== true ||
    selectionRequest.policy.requireQualityPassed !== true ||
    !exactStrings(selectionRequest.policy.allowedCandidateRoles, [
      "repaired-family-quality-candidate",
    ])
  ) {
    fail(
      "REPAIRED_FAMILY_RANKING_SELECTION_REQUEST_INVALID",
      "Bridge selection request differs from its protected candidate, reference or policy contract.",
    );
  }
  validateEmbeddedJob(bridge, selectionRequestHash);

  let selection;
  try {
    selection = await executeCandidateSelection(selectionRequest, {
      artifacts: options.artifacts,
      now,
    });
  } catch (error: unknown) {
    if (error instanceof CandidateSelectionError) {
      throw new RepairedFamilyRankingError(
        error.code,
        error.message,
        error.details,
      );
    }
    throw error;
  }
  const selectionArtifact = await verifiedArtifact(
    options.artifacts,
    selection.evidenceArtifactId,
    "candidate selection evidence",
  );
  if (
    selectionArtifact.storageClass !== "evidence" ||
    selectionArtifact.mediaType !== "application/json" ||
    selectionArtifact.labels.artifactRole !== "candidate-selection-evidence" ||
    selection.evidence.requestSha256 !== bridge.selectionRequestSha256 ||
    selection.evidence.reference.artifactId !== bridge.referenceArtifactId ||
    !exactStrings(
      selection.evidence.ranking.map((entry) => entry.candidateArtifactId),
      bridge.candidateArtifactIds,
    )
  ) {
    fail(
      "REPAIRED_FAMILY_RANKING_SELECTION_EVIDENCE_INVALID",
      "Candidate selection evidence does not match the verified revision bridge.",
    );
  }

  const evidence: RepairedFamilyRankingEvidence = {
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION,
    rankingId: request.rankingId,
    requestSha256: repairedFamilyRankingRequestSha256(request),
    bridgeEvidenceArtifactId: bridgeArtifact.artifactId,
    bridgeId: bridge.bridgeId,
    repairId: bridge.repairId,
    familyId: bridge.familyId,
    sourceManifestArtifactId: bridge.sourceManifestArtifactId,
    sourceManifestSha256: bridge.sourceManifestSha256,
    referenceArtifactId: bridge.referenceArtifactId,
    revisionEvidenceArtifactIds: bridge.revisionEvidenceArtifactIds,
    candidateArtifactIds: bridge.candidateArtifactIds,
    selectionEvidenceArtifactId: selection.evidenceArtifactId,
    selectionId: selection.evidence.selectionId,
    selectionRequestSha256: selection.evidence.requestSha256,
    decision: selection.evidence.decision,
    ...(selection.evidence.recommendedCandidateArtifactId === undefined
      ? {}
      : {
          recommendedCandidateArtifactId:
            selection.evidence.recommendedCandidateArtifactId,
        }),
    ...(selection.evidence.selectedCandidateArtifactId === undefined
      ? {}
      : {
          selectedCandidateArtifactId:
            selection.evidence.selectedCandidateArtifactId,
        }),
    promotionEligible: selection.evidence.promotionEligible,
    winnerMargin: selection.evidence.winnerMargin,
    ranking: selection.evidence.ranking,
    selectionEvidence: selection.evidence,
    passed: true,
    completedAt,
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  const sourceArtifacts = [
    bridgeArtifact.artifactId,
    selection.evidenceArtifactId,
    ...requiredBridgeSources,
  ].filter((value, index, values) => values.indexOf(value) === index).sort() as readonly ArtifactId[];
  const stored = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(evidence), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${request.rankingId}.revision-bound-selection.json`,
      sourceArtifacts,
      labels: {
        artifactRole: "revision-bound-candidate-selection-evidence",
        approvalState: "evidence-only",
        qualityState: "passed",
        finalDeliverable: "false",
        rankingId: request.rankingId,
        bridgeId: bridge.bridgeId,
        repairId: bridge.repairId,
        familyId: bridge.familyId,
        decision: selection.evidence.decision,
        promotionEligible: String(selection.evidence.promotionEligible),
        ...(selection.evidence.recommendedCandidateArtifactId === undefined
          ? {}
          : {
              recommendedCandidateArtifactId:
                selection.evidence.recommendedCandidateArtifactId,
            }),
      },
      metadata: normalizeJson({
        requestSha256: evidence.requestSha256,
        selectionRequestSha256: evidence.selectionRequestSha256,
        candidateCount: evidence.candidateArtifactIds.length,
        eligibleCandidateCount: evidence.ranking.filter(
          (entry) => entry.hardGatesPassed,
        ).length,
        decision: evidence.decision,
        winnerMargin: evidence.winnerMargin,
        promotionEligible: evidence.promotionEligible,
        requiresSeparatePromotion: true,
      }),
    },
  );
  return {
    evidenceArtifactId: stored.artifactId,
    selectionEvidenceArtifactId: selection.evidenceArtifactId,
    evidence,
  };
}
